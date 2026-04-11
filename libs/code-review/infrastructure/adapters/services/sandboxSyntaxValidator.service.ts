import { Injectable } from '@nestjs/common';
import { createLogger } from '@kodus/flow';
import { Sandbox } from 'e2b';
import pLimit from 'p-limit';
import { ValidationCandidate } from '@libs/code-review/domain/types/astValidate.type';

const PARSE_TIMEOUT_MS = 30_000;
const CONCURRENCY_LIMIT = 10;
const VALIDATE_DIR = '/tmp/validate';

@Injectable()
export class SandboxSyntaxValidator {
    private readonly logger = createLogger(SandboxSyntaxValidator.name);

    /**
     * Validate syntax of merged code candidates by running kodus-graph parse in the sandbox.
     * Returns a Set of candidate IDs that are syntactically valid.
     * If sandbox is not available, returns all IDs (skip validation).
     */
    async validateFiles(
        sandbox: Sandbox | null,
        candidates: ValidationCandidate[],
    ): Promise<Set<string>> {
        if (!sandbox || candidates.length === 0) {
            return new Set(candidates.map((c) => c.id));
        }

        const limit = pLimit(CONCURRENCY_LIMIT);
        const tasks = candidates.map((candidate) =>
            limit(() => this.validateSingle(sandbox, candidate)),
        );

        const results = await Promise.allSettled(tasks);
        const validIds = new Set<string>();

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                validIds.add(result.value);
            }
        }

        this.logger.log({
            message: `[SYNTAX] Validated ${candidates.length} candidates: ${validIds.size} valid, ${candidates.length - validIds.size} invalid`,
            context: SandboxSyntaxValidator.name,
        });

        return validIds;
    }

    private async validateSingle(
        sandbox: Sandbox,
        candidate: ValidationCandidate,
    ): Promise<string | null> {
        const workDir = `${VALIDATE_DIR}/${candidate.id}`;
        const filePath = candidate.filePath;
        const fullPath = `${workDir}/${filePath}`;
        const resultPath = `${workDir}/result.json`;

        try {
            // Decode base64 content
            const code = Buffer.from(candidate.encodedData, 'base64').toString('utf-8');

            // Create directory structure and write file
            const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
            await sandbox.commands.run(`mkdir -p "${dir}"`, { timeoutMs: 5_000 });
            await sandbox.files.write(fullPath, code);

            // Run kodus-graph parse
            const result = await sandbox.commands.run(
                `kodus-graph parse --files "${filePath}" --repo-dir "${workDir}" --out "${resultPath}"`,
                { timeoutMs: PARSE_TIMEOUT_MS },
            );

            if (result.exitCode !== 0) {
                this.logger.warn({
                    message: `[SYNTAX] kodus-graph parse failed for ${filePath} (exit=${result.exitCode})`,
                    context: SandboxSyntaxValidator.name,
                    metadata: { candidateId: candidate.id, stderr: result.stderr?.substring(0, 200) },
                });
                return null;
            }

            // Read and check parse_errors
            const jsonContent = await sandbox.files.read(resultPath);
            const parsed = JSON.parse(jsonContent);
            const parseErrors = parsed?.metadata?.parse_errors ?? 0;
            const extractErrors = parsed?.metadata?.extract_errors ?? 0;

            if (parseErrors > 0 || extractErrors > 0) {
                this.logger.log({
                    message: `[SYNTAX] Invalid syntax: ${filePath} (parse_errors=${parseErrors}, extract_errors=${extractErrors})`,
                    context: SandboxSyntaxValidator.name,
                    metadata: { candidateId: candidate.id },
                });
                return null;
            }

            return candidate.id;
        } catch (error) {
            this.logger.warn({
                message: `[SYNTAX] Validation error for ${filePath}, marking as invalid`,
                context: SandboxSyntaxValidator.name,
                error,
                metadata: { candidateId: candidate.id },
            });
            return null;
        } finally {
            // Cleanup
            try {
                await sandbox.commands.run(`rm -rf "${workDir}"`, { timeoutMs: 5_000 });
            } catch { /* ignore cleanup errors */ }
        }
    }
}
