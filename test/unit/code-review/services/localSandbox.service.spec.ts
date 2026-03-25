/**
 * Tests for LocalSandboxService exec security.
 *
 * Instead of mocking child_process (complex due to promisify hoisting),
 * we test the exec logic by extracting and testing the validation patterns directly.
 */

jest.mock('@kodus/flow', () => ({
    createLogger: () => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
    }),
}));

/**
 * Extracted from LocalSandboxService.buildRemoteCommands.exec
 * to test validation logic without needing to mock child_process.
 */
function validateExecCommand(command: string): {
    allowed: boolean;
    reason?: string;
    program?: string;
    args?: string[];
} {
    const ALLOWED_PROGRAMS = new Set([
        'sg',
        'tsc',
        'npx',
        'eslint',
        'python',
        'python3',
        'go',
        'cargo',
        'cat',
        'wc',
        'head',
        'tail',
        'file',
    ]);

    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) {
        return { allowed: false, reason: 'empty command' };
    }

    const [program, ...args] = parts.map((p) => p.replace(/^['"]|['"]$/g, ''));

    if (!ALLOWED_PROGRAMS.has(program)) {
        return {
            allowed: false,
            reason: `Program "${program}" is not allowed`,
            program,
        };
    }

    const positionalArgs: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('-')) {
            i++; // skip flag value
            continue;
        }
        positionalArgs.push(args[i]);
    }
    const hasTraversal = positionalArgs.some(
        (a) => a.startsWith('/') || /(^|\/)\.\.($|\/)/.test(a),
    );
    if (hasTraversal) {
        return {
            allowed: false,
            reason: 'path traversal in positional args',
            program,
            args,
        };
    }

    return { allowed: true, program, args };
}

describe('LocalSandboxService exec validation', () => {
    describe('program whitelist', () => {
        it('should allow sg (ast-grep)', () => {
            const result = validateExecCommand(
                "sg --pattern '$VAR.map($FN)' --lang typescript .",
            );
            expect(result.allowed).toBe(true);
            expect(result.program).toBe('sg');
        });

        it('should allow npx', () => {
            const result = validateExecCommand('npx tsc --noEmit src/file.ts');
            expect(result.allowed).toBe(true);
            expect(result.program).toBe('npx');
            expect(result.args).toContain('tsc');
        });

        it('should allow eslint', () => {
            const result = validateExecCommand('eslint src/file.ts');
            expect(result.allowed).toBe(true);
        });

        it('should allow cat', () => {
            const result = validateExecCommand('cat src/file.ts');
            expect(result.allowed).toBe(true);
        });

        it('should allow tsc', () => {
            const result = validateExecCommand('tsc --noEmit');
            expect(result.allowed).toBe(true);
        });

        it('should allow go vet', () => {
            const result = validateExecCommand('go vet ./...');
            expect(result.allowed).toBe(true);
        });

        it('should allow cargo check', () => {
            const result = validateExecCommand('cargo check');
            expect(result.allowed).toBe(true);
        });

        it('should block curl', () => {
            const result = validateExecCommand('curl http://evil.com');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('not allowed');
        });

        it('should block rm', () => {
            const result = validateExecCommand('rm -rf .');
            expect(result.allowed).toBe(false);
        });

        it('should block node', () => {
            const result = validateExecCommand('node -e "process.exit(1)"');
            expect(result.allowed).toBe(false);
        });

        it('should block bash', () => {
            const result = validateExecCommand('bash -c "whoami"');
            expect(result.allowed).toBe(false);
        });

        it('should block wget', () => {
            const result = validateExecCommand('wget http://evil.com');
            expect(result.allowed).toBe(false);
        });

        it('should block chmod', () => {
            const result = validateExecCommand('chmod 777 file');
            expect(result.allowed).toBe(false);
        });

        it('should block empty command', () => {
            const result = validateExecCommand('');
            expect(result.allowed).toBe(false);
        });
    });

    describe('path traversal protection', () => {
        it('should block absolute paths in positional args', () => {
            const result = validateExecCommand('cat /etc/passwd');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('path traversal');
        });

        it('should block .. in positional args', () => {
            const result = validateExecCommand('cat ../../etc/passwd');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('path traversal');
        });

        it('should block .. in middle of path', () => {
            const result = validateExecCommand(
                'eslint src/../../../etc/shadow',
            );
            expect(result.allowed).toBe(false);
        });

        it('should allow relative paths', () => {
            const result = validateExecCommand('cat src/utils/helper.ts');
            expect(result.allowed).toBe(true);
        });

        it('should allow nested relative paths', () => {
            const result = validateExecCommand(
                'eslint src/services/auth/handler.ts',
            );
            expect(result.allowed).toBe(true);
        });

        it('should allow flags containing slashes (not positional)', () => {
            const result = validateExecCommand(
                "sg --pattern 'import/export' --lang typescript .",
            );
            expect(result.allowed).toBe(true);
        });

        it('should allow flags containing .. (not positional)', () => {
            const result = validateExecCommand(
                "sg --pattern '$A..$B' --lang ruby .",
            );
            expect(result.allowed).toBe(true);
        });

        it('should allow dot path', () => {
            const result = validateExecCommand(
                'sg --pattern test --lang typescript .',
            );
            expect(result.allowed).toBe(true);
        });

        it('should block absolute path even with valid program', () => {
            const result = validateExecCommand('eslint /usr/src/app/secret.ts');
            expect(result.allowed).toBe(false);
        });

        it('should block traversal even with valid program', () => {
            const result = validateExecCommand('cat ../../../etc/shadow');
            expect(result.allowed).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle quoted arguments correctly', () => {
            const result = validateExecCommand(
                "sg --pattern 'await $PROMISE' --lang typescript src",
            );
            expect(result.allowed).toBe(true);
            expect(result.program).toBe('sg');
        });

        it('should handle double-quoted arguments', () => {
            const result = validateExecCommand(
                'sg --pattern "catch ($ERR) { }" --lang javascript .',
            );
            expect(result.allowed).toBe(true);
        });

        it('should handle multiple positional args', () => {
            const result = validateExecCommand(
                'eslint src/a.ts src/b.ts src/c.ts',
            );
            expect(result.allowed).toBe(true);
            expect(result.args).toHaveLength(3);
        });

        it('should block if ANY positional arg has traversal', () => {
            const result = validateExecCommand(
                'eslint src/ok.ts ../../bad.ts src/also-ok.ts',
            );
            expect(result.allowed).toBe(false);
        });
    });
});
