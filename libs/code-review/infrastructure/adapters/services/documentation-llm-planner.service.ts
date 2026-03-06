import { createLogger } from '@kodus/flow';
import {
    BYOKConfig,
    LLMModelProvider,
    ParserType,
    PromptRole,
    PromptRunnerService,
} from '@kodus/kodus-common/llm';
import { SUPPORTED_LANGUAGES } from '@libs/code-review/domain/contracts/SupportedLanguages';
import {
    DocumentationQueryPlanByFile,
    DocumentationQueryTask,
    RepositoryPackageReference,
} from '@libs/code-review/pipeline/context/code-review-pipeline.context';
import {
    DocumentationPlannerPayload,
    DocumentationPlannerSchema,
    DocumentationPlannerSchemaType,
    prompt_code_review_documentation_planner_system,
    prompt_code_review_documentation_planner_user,
} from '@libs/common/utils/langchainCommon/prompts/codeReviewDocumentationPlanner';
import { FileChange } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { BYOKPromptRunnerService } from '@libs/core/infrastructure/services/tokenTracking/byokPromptRunner.service';
import { Injectable } from '@nestjs/common';
import path from 'path';

const FILE_CONTENT_LIMIT = 5000;
const PATCH_CONTENT_LIMIT = 4000;

@Injectable()
export class DocumentationLLMPlannerService {
    private readonly logger = createLogger(DocumentationLLMPlannerService.name);

    constructor(private readonly promptRunnerService: PromptRunnerService) {}

    async planDocumentationByFile(params: {
        packages: RepositoryPackageReference[];
        changedFiles: FileChange[];
        byokConfig?: BYOKConfig;
    }): Promise<Record<string, DocumentationQueryPlanByFile>> {
        const { packages, changedFiles, byokConfig } = params;

        const codeFiles = changedFiles.filter((file) =>
            this.isCodeFile(file.filename),
        );

        if (!codeFiles.length) {
            return {};
        }

        const provider = LLMModelProvider.GEMINI_3_1_FLASH_LITE_PREVIEW;
        const fallbackProvider = LLMModelProvider.GEMINI_3_FLASH_PREVIEW;
        const runName = 'documentationPlanner';

        const promptRunner = new BYOKPromptRunnerService(
            this.promptRunnerService,
            provider,
            fallbackProvider,
            byokConfig,
        );

        const packageSlice = packages.slice(0, 200);
        const plans: Record<string, DocumentationQueryPlanByFile> = {};

        try {
            const settled = await Promise.allSettled(
                codeFiles.map(async (file) => {
                    const filePackages = this.filterPackagesForFile(
                        packageSlice,
                        file.filename,
                    );

                    const payload: DocumentationPlannerPayload = {
                        packages: filePackages,
                        file: {
                            filePath: file.filename,
                            fileContent: (file.fileContent || '').slice(
                                0,
                                FILE_CONTENT_LIMIT,
                            ),
                            diff: (
                                file.patchWithLinesStr ||
                                file.patch ||
                                ''
                            ).slice(0, PATCH_CONTENT_LIMIT),
                        },
                    };

                    const response = await promptRunner
                        .builder()
                        .setParser(ParserType.ZOD, DocumentationPlannerSchema)
                        .setLLMJsonMode(true)
                        .setPayload(payload)
                        .addPrompt({
                            role: PromptRole.SYSTEM,
                            prompt: prompt_code_review_documentation_planner_system,
                        })
                        .addPrompt({
                            role: PromptRole.USER,
                            prompt: prompt_code_review_documentation_planner_user,
                        })
                        .setTemperature(0)
                        .setRunName(`${runName}:${file.filename}`)
                        .execute();

                    return {
                        file,
                        result: response as DocumentationPlannerSchemaType,
                    };
                }),
            );

            for (const [index, settledResult] of settled.entries()) {
                if (settledResult.status === 'fulfilled') {
                    const mapped = this.mapResultByFile(
                        settledResult.value.result,
                        this.getAllowedPackageNamesByFile(
                            packageSlice,
                            settledResult.value.file.filename,
                        ),
                    );

                    if (mapped) {
                        plans[settledResult.value.file.filename] = mapped;
                        continue;
                    }

                    plans[settledResult.value.file.filename] =
                        this.buildFallbackPlanForFile(
                            settledResult.value.file,
                            packages,
                        );
                    continue;
                }

                this.logger.warn({
                    message:
                        'Documentation planner LLM failed for one file, using fallback for that file',
                    context: DocumentationLLMPlannerService.name,
                    metadata: {
                        fileName: codeFiles[index]?.filename,
                    },
                    error: settledResult.reason,
                });

                const fallbackFile = codeFiles[index];
                if (fallbackFile) {
                    plans[fallbackFile.filename] =
                        this.buildFallbackPlanForFile(fallbackFile, packages);
                }
            }

            if (Object.keys(plans).length > 0) {
                return plans;
            }

            return this.buildFallbackPlan(codeFiles, packages);
        } catch (error) {
            this.logger.warn({
                message:
                    'Documentation planner LLM failed, using fallback query plan',
                context: DocumentationLLMPlannerService.name,
                error,
            });

            return this.buildFallbackPlan(codeFiles, packages);
        }
    }

    private mapResultByFile(
        result: DocumentationPlannerSchemaType,
        allowedPackageNames: Set<string>,
    ): DocumentationQueryPlanByFile | null {
        if (!result) {
            return null;
        }

        const rawQueryTasks = this.uniqueQueryTasks(result.queryTasks);

        if (!rawQueryTasks.length) {
            return {
                queryTasks: [],
            };
        }

        const queryTasks = rawQueryTasks.filter((task) =>
            allowedPackageNames.has(task.packageName.toLowerCase()),
        );

        if (!queryTasks.length) {
            return null;
        }

        return {
            queryTasks,
        };
    }

    private buildFallbackPlan(
        changedFiles: FileChange[],
        packages: RepositoryPackageReference[],
    ): Record<string, DocumentationQueryPlanByFile> {
        const plan: Record<string, DocumentationQueryPlanByFile> = {};

        for (const file of changedFiles) {
            const filePackages = this.filterPackagesForFile(
                packages,
                file.filename,
            );
            const topPackages = this.uniqueStrings(
                filePackages.map((pkg) => pkg.name),
            ).slice(0, 5);

            if (!topPackages.length) {
                plan[file.filename] = {
                    queryTasks: [],
                };
                continue;
            }

            const fileText =
                `${file.fileContent || ''}\n${file.patch || ''}`.toLowerCase();
            const matched = topPackages.filter(
                (pkg) =>
                    fileText.includes(pkg.toLowerCase().replace('/', '')) ||
                    fileText.includes(pkg.toLowerCase()),
            );

            const relevantPackages = (
                matched.length > 0 ? matched : topPackages
            ).slice(0, 3);

            const queryTasks = relevantPackages.map((packageName) =>
                this.createQueryTask(
                    packageName,
                    `Find official documentation and best practices for ${packageName} used in ${file.filename}`,
                ),
            );

            plan[file.filename] = {
                queryTasks,
            };
        }

        return plan;
    }

    private buildFallbackPlanForFile(
        file: FileChange,
        packages: RepositoryPackageReference[],
    ): DocumentationQueryPlanByFile {
        const fileScopedPackages = this.filterPackagesForFile(
            packages,
            file.filename,
        );

        return (
            this.buildFallbackPlan([file], fileScopedPackages)[
                file.filename
            ] || {
                queryTasks: [],
            }
        );
    }

    private uniqueQueryTasks(
        tasks: DocumentationQueryTask[],
    ): DocumentationQueryTask[] {
        const seen = new Set<string>();
        const result: DocumentationQueryTask[] = [];

        for (const task of tasks || []) {
            const normalizedPackageName = (task?.packageName || '').trim();
            const normalizedQuery = (task?.query || '').trim();

            if (!normalizedPackageName || !normalizedQuery) {
                continue;
            }

            const key = `${normalizedPackageName.toLowerCase()}::${normalizedQuery.toLowerCase()}`;
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            result.push(
                this.createQueryTask(normalizedPackageName, normalizedQuery),
            );
        }

        return result;
    }

    private createQueryTask(
        packageName: string,
        query: string,
    ): DocumentationQueryTask {
        return {
            packageName,
            query,
        };
    }

    private filterPackagesForFile(
        packages: RepositoryPackageReference[],
        filePath: string,
    ): RepositoryPackageReference[] {
        const ecosystems = this.getAllowedEcosystemsForFile(filePath);

        if (!ecosystems.length) {
            return [];
        }

        return ecosystems.flatMap((ecosystem) =>
            this.scopePackagesToNearestManifestDirectory(
                filePath,
                packages.filter((pkg) => pkg.ecosystem === ecosystem),
            ),
        );
    }

    private scopePackagesToNearestManifestDirectory(
        filePath: string,
        packages: RepositoryPackageReference[],
    ): RepositoryPackageReference[] {
        if (!packages.length) {
            return [];
        }

        const fileDirectory = this.normalizeDirectory(
            path.posix.dirname(filePath),
        );

        const manifestDirectories = [
            ...new Set(
                packages.map((pkg) =>
                    this.normalizeDirectory(path.posix.dirname(pkg.sourceFile)),
                ),
            ),
        ].filter((directory) =>
            this.isAncestorDirectory(directory, fileDirectory),
        );

        if (!manifestDirectories.length) {
            return packages;
        }

        const nearestDirectory = manifestDirectories.sort(
            (a, b) => b.length - a.length,
        )[0];

        return packages.filter(
            (pkg) =>
                this.normalizeDirectory(path.posix.dirname(pkg.sourceFile)) ===
                nearestDirectory,
        );
    }

    private isAncestorDirectory(
        candidateDirectory: string,
        fileDirectory: string,
    ): boolean {
        if (!candidateDirectory) {
            return true;
        }

        return (
            fileDirectory === candidateDirectory ||
            fileDirectory.startsWith(`${candidateDirectory}/`)
        );
    }

    private normalizeDirectory(directory: string): string {
        if (!directory || directory === '.' || directory === '/') {
            return '';
        }

        return directory.replace(/^\/+|\/+$/g, '');
    }

    private getAllowedPackageNamesByFile(
        packages: RepositoryPackageReference[],
        filePath: string,
    ): Set<string> {
        return new Set(
            this.filterPackagesForFile(packages, filePath).map((pkg) =>
                pkg.name.toLowerCase(),
            ),
        );
    }

    private getAllowedEcosystemsForFile(
        filePath: string,
    ): RepositoryPackageReference['ecosystem'][] {
        const extension = path.posix.extname(filePath).toLowerCase();

        if (!extension) {
            return [];
        }

        const language = Object.values(SUPPORTED_LANGUAGES).find((lang) =>
            lang.extensions.includes(extension),
        )?.name;

        switch (language) {
            case 'typescript':
            case 'javascript':
                return ['npm'];
            case 'python':
                return ['pip'];
            case 'java':
                return ['maven', 'gradle'];
            case 'go':
                return ['go'];
            case 'ruby':
                return ['ruby'];
            case 'rust':
                return ['cargo'];
            default:
                return [];
        }
    }

    private isCodeFile(filePath: string): boolean {
        const extension = path.posix.extname(filePath).toLowerCase();

        if (!extension) {
            return false;
        }

        return Object.values(SUPPORTED_LANGUAGES).some((lang) =>
            lang.extensions.includes(extension),
        );
    }

    private uniqueStrings(items: string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];

        for (const item of items || []) {
            const normalized = (item || '').trim();
            if (!normalized) {
                continue;
            }
            if (seen.has(normalized.toLowerCase())) {
                continue;
            }
            seen.add(normalized.toLowerCase());
            result.push(normalized);
        }

        return result;
    }
}
