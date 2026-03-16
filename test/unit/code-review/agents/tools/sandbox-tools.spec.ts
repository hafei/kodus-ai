import { z } from 'zod';
import { registerSandboxTools, registerSearchDocsTool } from '@/code-review/infrastructure/agents/tools/sandbox-tools';
import { RemoteCommands } from '@/code-review/infrastructure/adapters/services/collectCrossFileContexts.service';

jest.mock('@kodus/flow', () => ({
    createLogger: () => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
    }),
}));

describe('registerSandboxTools', () => {
    let mockOrchestration: any;
    let mockRemoteCommands: RemoteCommands;
    let registeredTools: Map<string, any>;

    beforeEach(() => {
        registeredTools = new Map();
        mockOrchestration = {
            createTool: jest.fn((config: any) => {
                registeredTools.set(config.name, config);
            }),
        };

        mockRemoteCommands = {
            grep: jest.fn().mockResolvedValue('match1\nmatch2'),
            read: jest.fn().mockResolvedValue('file contents here'),
            listDir: jest.fn().mockResolvedValue('src/\n  index.ts\n  utils.ts'),
            exec: jest.fn().mockResolvedValue({ stdout: 'exec output', exitCode: 0 }),
        };
    });

    it('should register all 5 sandbox tools when exec is available', () => {
        registerSandboxTools(mockOrchestration, mockRemoteCommands);

        expect(mockOrchestration.createTool).toHaveBeenCalledTimes(5);
        expect(registeredTools.has('grep')).toBe(true);
        expect(registeredTools.has('readFile')).toBe(true);
        expect(registeredTools.has('listDir')).toBe(true);
        expect(registeredTools.has('astGrep')).toBe(true);
        expect(registeredTools.has('shell')).toBe(true);
    });

    it('should register only 3 tools when exec is not available', () => {
        const commandsWithoutExec: RemoteCommands = {
            grep: jest.fn(),
            read: jest.fn(),
            listDir: jest.fn(),
        };
        registerSandboxTools(mockOrchestration, commandsWithoutExec);

        expect(mockOrchestration.createTool).toHaveBeenCalledTimes(3);
        expect(registeredTools.has('grep')).toBe(true);
        expect(registeredTools.has('readFile')).toBe(true);
        expect(registeredTools.has('listDir')).toBe(true);
        expect(registeredTools.has('astGrep')).toBe(false);
        expect(registeredTools.has('shell')).toBe(false);
    });

    describe('grep tool', () => {
        it('should call remoteCommands.grep with pattern and path', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const grepTool = registeredTools.get('grep');

            await grepTool.execute({ pattern: 'functionName', path: 'src' });

            expect(mockRemoteCommands.grep).toHaveBeenCalledWith(
                'functionName',
                'src',
                undefined,
            );
        });

        it('should pass glob filter', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const grepTool = registeredTools.get('grep');

            await grepTool.execute({
                pattern: 'import',
                glob: '*.ts',
            });

            expect(mockRemoteCommands.grep).toHaveBeenCalledWith(
                'import',
                '.',
                '*.ts',
            );
        });

        it('should truncate results exceeding MAX_GREP_MATCHES', async () => {
            const manyLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
            (mockRemoteCommands.grep as jest.Mock).mockResolvedValue(manyLines);

            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const grepTool = registeredTools.get('grep');

            const result = await grepTool.execute({ pattern: 'test' });

            expect(result.result).toContain('more matches truncated');
        });
    });

    describe('readFile tool', () => {
        it('should call remoteCommands.read with path and line ranges', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const readTool = registeredTools.get('readFile');

            await readTool.execute({ path: 'src/index.ts', startLine: 10, endLine: 20 });

            expect(mockRemoteCommands.read).toHaveBeenCalledWith(
                'src/index.ts',
                10,
                20,
            );
        });

        it('should default to 0 for missing line ranges (full file)', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const readTool = registeredTools.get('readFile');

            await readTool.execute({ path: 'src/index.ts' });

            expect(mockRemoteCommands.read).toHaveBeenCalledWith(
                'src/index.ts',
                0,
                0,
            );
        });

        it('should truncate results exceeding MAX_READ_LENGTH', async () => {
            const largeContent = 'x'.repeat(40_000);
            (mockRemoteCommands.read as jest.Mock).mockResolvedValue(largeContent);

            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const readTool = registeredTools.get('readFile');

            const result = await readTool.execute({ path: 'big.ts' });

            expect(result.result).toContain('file truncated');
            expect(result.result.length).toBeLessThan(40_000);
        });
    });

    describe('listDir tool', () => {
        it('should call remoteCommands.listDir with path and depth', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const listTool = registeredTools.get('listDir');

            await listTool.execute({ path: 'src', maxDepth: 3 });

            expect(mockRemoteCommands.listDir).toHaveBeenCalledWith('src', 3);
        });

        it('should default to path "." and depth 2', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const listTool = registeredTools.get('listDir');

            await listTool.execute({});

            expect(mockRemoteCommands.listDir).toHaveBeenCalledWith('.', 2);
        });

        it('should cap maxDepth at 4', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const listTool = registeredTools.get('listDir');

            await listTool.execute({ maxDepth: 10 });

            expect(mockRemoteCommands.listDir).toHaveBeenCalledWith('.', 4);
        });
    });

    describe('shell tool', () => {
        it('should allow whitelisted commands via exec', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const shellTool = registeredTools.get('shell');

            await shellTool.execute({ command: 'npx tsc --noEmit src/file.ts' });

            expect(mockRemoteCommands.exec).toHaveBeenCalledWith(
                'npx tsc --noEmit src/file.ts',
            );
        });

        it('should block non-whitelisted commands', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const shellTool = registeredTools.get('shell');

            const result = await shellTool.execute({ command: 'node malicious.js' });

            expect(result.result).toContain('Command not allowed');
            // grep should NOT have been called for this
        });

        it('should block commands with dangerous patterns', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const shellTool = registeredTools.get('shell');

            const result = await shellTool.execute({
                command: 'npx tsc --noEmit; rm -rf /',
            });

            expect(result.result).toContain('blocked patterns');
        });

        it('should block redirect operators', async () => {
            registerSandboxTools(mockOrchestration, mockRemoteCommands);
            const shellTool = registeredTools.get('shell');

            const result = await shellTool.execute({
                command: 'npx eslint src > /tmp/output',
            });

            expect(result.result).toContain('blocked patterns');
        });
    });
});

describe('registerSearchDocsTool', () => {
    let mockOrchestration: any;
    let mockDocService: any;
    let registeredTools: Map<string, any>;

    beforeEach(() => {
        registeredTools = new Map();
        mockOrchestration = {
            createTool: jest.fn((config: any) => {
                registeredTools.set(config.name, config);
            }),
        };

        mockDocService = {
            searchByFilePlan: jest.fn().mockResolvedValue({
                agent: [
                    {
                        query: 'test query',
                        title: 'React Hooks',
                        url: 'https://react.dev/hooks',
                        snippet: 'Hooks are a way to...',
                        source: 'exa-search',
                    },
                ],
            }),
        };
    });

    it('should register searchDocs tool', () => {
        registerSearchDocsTool(mockOrchestration, mockDocService);

        expect(registeredTools.has('searchDocs')).toBe(true);
    });

    it('should call documentation service with correct plan', async () => {
        registerSearchDocsTool(mockOrchestration, mockDocService);
        const searchTool = registeredTools.get('searchDocs');

        const result = await searchTool.execute({
            packageName: 'react',
            query: 'useEffect cleanup',
        });

        expect(mockDocService.searchByFilePlan).toHaveBeenCalledWith(
            {
                agent: {
                    queryTasks: [
                        { packageName: 'react', query: 'useEffect cleanup' },
                    ],
                },
            },
            undefined,
        );
        expect(result.result).toContain('React Hooks');
    });

    it('should return error for empty packageName', async () => {
        registerSearchDocsTool(mockOrchestration, mockDocService);
        const searchTool = registeredTools.get('searchDocs');

        const result = await searchTool.execute({
            packageName: '',
            query: 'test',
        });

        expect(result.result).toContain('required');
    });

    it('should handle no results', async () => {
        mockDocService.searchByFilePlan.mockResolvedValue({ agent: [] });

        registerSearchDocsTool(mockOrchestration, mockDocService);
        const searchTool = registeredTools.get('searchDocs');

        const result = await searchTool.execute({
            packageName: 'unknown-lib',
            query: 'test',
        });

        expect(result.result).toContain('No documentation found');
    });

    it('should handle service errors gracefully', async () => {
        mockDocService.searchByFilePlan.mockRejectedValue(
            new Error('Exa API unavailable'),
        );

        registerSearchDocsTool(mockOrchestration, mockDocService);
        const searchTool = registeredTools.get('searchDocs');

        const result = await searchTool.execute({
            packageName: 'react',
            query: 'hooks',
        });

        expect(result.result).toContain('Documentation search error');
        expect(result.result).toContain('Exa API unavailable');
    });
});
