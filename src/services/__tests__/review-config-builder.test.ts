import { describe, expect, it, vi } from 'vitest';
import { buildReviewConfig } from '../review-config-builder.js';
import type { FileContent } from '../../types/review.js';

describe('buildReviewConfig', () => {
    it('returns base config without loading files when fast mode is enabled', async () => {
        const getFullFileContents = vi.fn();
        const filterFiles = vi.fn();

        await expect(
            buildReviewConfig({
                rulesOnly: true,
                fast: true,
                options: {
                    files: ['src/a.ts'],
                    staged: true,
                    commit: 'abc123',
                    branch: 'main',
                    quiet: true,
                },
                getFullFileContents,
                filterFiles,
            }),
        ).resolves.toEqual({
            rulesOnly: true,
            fast: true,
        });

        expect(getFullFileContents).not.toHaveBeenCalled();
        expect(filterFiles).not.toHaveBeenCalled();
    });

    it('loads and filters files when fast mode is disabled', async () => {
        const files: FileContent[] = [
            {
                path: 'src/a.ts',
                content: 'const a = 1;',
                status: 'modified',
                diff: '+const a = 1;',
            },
        ];
        const getFullFileContents = vi.fn().mockResolvedValue(files);
        const filterFiles = vi.fn().mockReturnValue(files);

        await expect(
            buildReviewConfig({
                rulesOnly: false,
                fast: false,
                options: {
                    files: ['src/a.ts'],
                    staged: true,
                    commit: 'abc123',
                    branch: 'main',
                    quiet: true,
                },
                getFullFileContents,
                filterFiles,
            }),
        ).resolves.toEqual({
            rulesOnly: false,
            fast: false,
            files,
        });

        expect(getFullFileContents).toHaveBeenCalledWith(['src/a.ts'], {
            staged: true,
            commit: 'abc123',
            branch: 'main',
        });
        expect(filterFiles).toHaveBeenCalledWith(files, true);
    });
});
