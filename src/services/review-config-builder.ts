import type { FileContent, ReviewConfig } from '../types/review.js';

export async function buildReviewConfig({
    rulesOnly,
    fast,
    options,
    getFullFileContents,
    filterFiles,
}: {
    rulesOnly?: boolean;
    fast?: boolean;
    options?: {
        files?: string[];
        staged?: boolean;
        commit?: string;
        branch?: string;
        quiet?: boolean;
    };
    getFullFileContents: (
        files?: string[],
        options?: {
            staged?: boolean;
            commit?: string;
            branch?: string;
        },
    ) => Promise<FileContent[]>;
    filterFiles: (files: FileContent[], quiet?: boolean) => FileContent[];
}): Promise<ReviewConfig> {
    const reviewConfig: ReviewConfig = {
        rulesOnly,
        fast,
    };

    if (fast) {
        return reviewConfig;
    }

    const allFiles = await getFullFileContents(options?.files, {
        staged: options?.staged,
        commit: options?.commit,
        branch: options?.branch,
    });

    reviewConfig.files = filterFiles(allFiles, options?.quiet ?? false);

    return reviewConfig;
}
