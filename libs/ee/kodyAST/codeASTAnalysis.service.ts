import { Injectable } from '@nestjs/common';

import {
    LLMModelProvider,
    ParserType,
    PromptRole,
    PromptRunnerService,
} from '@kodus/kodus-common/llm';

import type { ContextPack } from '@kodus/flow';
import { createLogger } from '@kodus/flow';
import {
    getAugmentationsFromPack,
    getOverridesFromPack,
} from '@libs/ai-engine/infrastructure/adapters/services/context/code-review-context.utils';
import { ContextAugmentationsMap } from '@libs/ai-engine/infrastructure/adapters/services/context/interfaces/code-review-context-pack.interface';
import { LLMResponseProcessor } from '@libs/ai-engine/infrastructure/adapters/services/llmResponseProcessor.transform';
import { IASTAnalysisService } from '@libs/code-review/domain/contracts/ASTAnalysisService.contract';
import { SeverityLevel } from '@libs/common/utils/enums/severityLevel.enum';
import { prompt_detectBreakingChanges } from '@libs/common/utils/langchainCommon/prompts/detectBreakingChanges';
import {
    prompt_validateCodeSemantics,
    ValidateCodeSemanticsResult,
    validateCodeSemanticsSchema,
} from '@libs/common/utils/langchainCommon/prompts/validateCodeSemantics';
import { calculateBackoffInterval } from '@libs/common/utils/polling';
import { AxiosASTService } from '@libs/core/infrastructure/config/axios/microservices/ast.axios';
import {
    AIAnalysisResult,
    AnalysisContext,
    CodeSuggestion,
    Repository,
} from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';
import { ObservabilityService } from '@libs/core/log/observability.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';

import { ASTValidateCodeRequest } from '@libs/code-review/domain/types/astValidate.type';
import {
    checkSuggestionSimplicitySchema,
    prompt_checkSuggestionSimplicity_system,
    prompt_checkSuggestionSimplicity_user,
} from '@libs/common/utils/langchainCommon/prompts/checkSuggestionSimplicity';
import {
    GetImpactAnalysisResponse,
    GetTaskInfoResponse,
    InitializeImpactAnalysisResponse,
    InitializeRepositoryResponse,
    ProtoAuthMode,
    ProtoPlatformType,
    RepositoryData,
    TaskStatus,
} from './interfaces/code-ast-analysis.interface';

@Injectable()
export class CodeAstAnalysisService implements IASTAnalysisService {
    private readonly llmResponseProcessor: LLMResponseProcessor;
    private readonly astAxios: AxiosASTService;

    private readonly logger = createLogger(CodeAstAnalysisService.name);

    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly promptRunnerService: PromptRunnerService,
        private readonly observabilityService: ObservabilityService,
    ) {
        this.llmResponseProcessor = new LLMResponseProcessor();
        this.astAxios = new AxiosASTService();
    }

    async analyzeASTWithAI(
        context: AnalysisContext,
    ): Promise<AIAnalysisResult> {
        const provider = LLMModelProvider.NOVITA_DEEPSEEK_V3_0324;
        const fallbackProvider = LLMModelProvider.OPENAI_GPT_4O;
        const runName = 'analyzeASTWithAI';

        const payload = await this.prepareAnalysisContext(context);

        // atributos de negócio do span
        const spanName = `${CodeAstAnalysisService.name}::${runName}`;
        const spanAttrs = {
            type: 'system',
            organizationId: context?.organizationAndTeamData?.organizationId,
            prNumber: context?.pullRequest?.number,
        };

        try {
            // roda toda a chamada de LLM dentro de um span, com captura de tokens
            const { result: analysis } =
                await this.observabilityService.runLLMInSpan<string>({
                    spanName,
                    runName,
                    attrs: spanAttrs,
                    exec: async (callbacks) => {
                        return await this.promptRunnerService
                            .builder()
                            .setProviders({
                                main: provider,
                                fallback: fallbackProvider,
                            })
                            .setParser(ParserType.STRING)
                            .setLLMJsonMode(true)
                            .setPayload(payload)
                            .addPrompt({
                                role: PromptRole.USER,
                                prompt: prompt_detectBreakingChanges,
                            })
                            .addMetadata({
                                organizationId:
                                    context?.organizationAndTeamData
                                        ?.organizationId,
                                teamId: context?.organizationAndTeamData
                                    ?.teamId,
                                pullRequestId: context?.pullRequest?.number,
                                provider,
                                fallbackProvider,
                                runName,
                            })
                            .setTemperature(0)
                            .addCallbacks(callbacks)
                            .setRunName(runName)
                            .execute();
                    },
                });

            if (!analysis) {
                const message = `No response from LLM for PR#${context.pullRequest.number}`;
                this.logger.warn({
                    message,
                    context: CodeAstAnalysisService.name,
                    metadata: {
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                    },
                });
                throw new Error(message);
            }

            const analysisResult = this.llmResponseProcessor.processResponse(
                context.organizationAndTeamData,
                context.pullRequest.number,
                analysis,
            );

            analysisResult.codeReviewModelUsed = {
                generateSuggestions: provider,
            };

            return {
                ...analysisResult,
                codeSuggestions: analysisResult?.codeSuggestions?.map(
                    (codeSuggestion: CodeSuggestion) => ({
                        ...codeSuggestion,
                        severity: SeverityLevel.CRITICAL,
                        label: 'breaking_changes',
                    }),
                ),
            };
        } catch (error) {
            this.logger.error({
                message: `Error during AST code analysis for PR#${context.pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: context?.organizationAndTeamData,
                    prNumber: context?.pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    async initializeASTAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        filePaths: string[] = [],
    ): Promise<InitializeRepositoryResponse> {
        try {
            const { headRepo: headDirParams, baseRepo: baseDirParams } =
                await this.getRepoParams(
                    repository,
                    pullRequest,
                    organizationAndTeamData,
                    platformType,
                );

            const response =
                await this.astAxios.post<InitializeRepositoryResponse>(
                    '/api/ast/repositories/initialize',
                    {
                        baseRepo: baseDirParams,
                        headRepo: headDirParams,
                        filePaths,
                        organizationId: organizationAndTeamData.organizationId,
                    },
                    {
                        headers: {
                            'x-task-key':
                                organizationAndTeamData.organizationId,
                        },
                    },
                );

            return response;
        } catch (error) {
            this.logger.error({
                message: `Error during AST initialization for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    private static readonly AuthModeMap: Record<string, ProtoAuthMode> = {
        OAUTH: ProtoAuthMode.OAUTH,
        TOKEN: ProtoAuthMode.TOKEN,
    };

    private static readonly PlatformTypeMap: Record<string, ProtoPlatformType> =
        {
            'github': ProtoPlatformType.GITHUB,
            'gitlab': ProtoPlatformType.GITLAB,
            'bitbucket': ProtoPlatformType.BITBUCKET,
            'azure-devops': ProtoPlatformType.AZURE_REPOS,
        };

    private async getCloneParams(
        repository: Repository,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<RepositoryData> {
        const params = await this.codeManagementService.getCloneParams({
            repository,
            organizationAndTeamData,
        });
        return {
            ...params,
            auth: {
                ...params.auth,
                type: CodeAstAnalysisService.AuthModeMap[params.auth.type],
            },
            provider: CodeAstAnalysisService.PlatformTypeMap[params.provider],
        };
    }

    async initializeImpactAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        codeChunk: string,
        fileName: string,
        graphsTaskId: string,
    ): Promise<InitializeImpactAnalysisResponse> {
        try {
            const { headRepo, baseRepo } = await this.getRepoParams(
                repository,
                pullRequest,
                organizationAndTeamData,
                platformType,
            );

            if (!headRepo) {
                throw new Error('Head repository parameters are missing');
            }

            const response =
                await this.astAxios.post<InitializeImpactAnalysisResponse>(
                    '/api/ast/impact-analysis/initialize',
                    {
                        baseRepo,
                        headRepo,
                        codeChunk,
                        fileName,
                        organizationId: organizationAndTeamData.organizationId,
                        graphsTaskId,
                    },
                    {
                        headers: {
                            'x-task-key':
                                organizationAndTeamData.organizationId,
                        },
                    },
                );

            return response;
        } catch (error) {
            this.logger.error({
                message: `Error during AST Impact Analysis initialization for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    async getImpactAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        taskId: string,
    ): Promise<GetImpactAnalysisResponse> {
        try {
            const { headRepo, baseRepo } = await this.getRepoParams(
                repository,
                pullRequest,
                organizationAndTeamData,
                platformType,
            );

            if (!headRepo) {
                throw new Error('Head repository parameters are missing');
            }

            const response =
                await this.astAxios.post<GetImpactAnalysisResponse>(
                    '/api/ast/impact-analysis/retrieve',
                    {
                        baseRepo,
                        headRepo,
                        organizationId: organizationAndTeamData.organizationId,
                        taskId,
                    },
                    {
                        headers: {
                            'x-task-key':
                                organizationAndTeamData.organizationId,
                        },
                    },
                );

            return response;
        } catch (error) {
            this.logger.error({
                message: `Error during AST Impact Analysis for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    private async prepareAnalysisContext(context: AnalysisContext) {
        const baseContext = {
            language: context?.repository?.language,
            languageResultPrompt:
                context?.codeReviewConfig?.languageResultPrompt,
            impactASTAnalysis: context?.impactASTAnalysis?.functionsAffect
                ? Object.values(context?.impactASTAnalysis?.functionsAffect)
                : [],
            v2PromptOverrides:
                context?.activeOverrides ??
                getOverridesFromPack(context?.sharedContextPack) ??
                context?.codeReviewConfig?.v2PromptOverrides,
            externalPromptLayers: context?.externalPromptLayers,
            contextAugmentations: {
                ...(getAugmentationsFromPack(context?.sharedContextPack) ?? {}),
                ...(context?.fileAugmentations ?? {}),
            } as ContextAugmentationsMap,
            contextPack: context?.sharedContextPack as ContextPack | undefined,
        };

        return baseContext;
    }

    async getRelatedContentFromDiff(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        diff: string,
        filePath: string,
        taskId: string,
    ): Promise<{ content: string }> {
        const { headRepo, baseRepo } = await this.getRepoParams(
            repository,
            pullRequest,
            organizationAndTeamData,
            platformType,
        );

        const response = await this.astAxios.post<{ content: string }>(
            '/api/ast/diff/content',
            {
                baseRepo,
                headRepo,
                diff,
                filePath,
                organizationId: organizationAndTeamData.organizationId,
                taskId,
            },
            {
                headers: {
                    'x-task-key': organizationAndTeamData.organizationId,
                },
            },
        );
        return response ?? { content: '' };
    }

    private async getRepoParams(
        repository: any,
        pullRequest: any,
        organizationAndTeamData: OrganizationAndTeamData,
        platformType: string,
    ): Promise<{
        headRepo: RepositoryData | null;
        baseRepo: RepositoryData | null;
    } | null> {
        const headDirParams = await this.getCloneParams(
            {
                id: repository.id,
                name: repository.name,
                defaultBranch: pullRequest.head?.ref,
                fullName:
                    repository.full_name ||
                    repository.fullName ||
                    repository.path_with_namespace ||
                    `${repository.owner}/${repository.name}`,
                platform: platformType as
                    | 'github'
                    | 'gitlab'
                    | 'bitbucket'
                    | 'azure-devops',
                language: repository.language || 'unknown',
            },
            organizationAndTeamData,
        );

        if (!headDirParams) {
            return null;
        }

        const baseDirParams = await this.getCloneParams(
            {
                id: repository.id,
                name: repository.name,
                defaultBranch: pullRequest.base?.ref,
                fullName:
                    repository.full_name ||
                    repository.fullName ||
                    repository.path_with_namespace ||
                    `${repository.owner}/${repository.name}`,
                platform: platformType as
                    | 'github'
                    | 'gitlab'
                    | 'bitbucket'
                    | 'azure-devops',
                language: repository.language || 'unknown',
            },
            organizationAndTeamData,
        );

        if (!baseDirParams) {
            return {
                headRepo: headDirParams,
                baseRepo: null,
            };
        }

        return {
            headRepo: headDirParams,
            baseRepo: baseDirParams,
        };
    }

    async awaitTask(
        taskId: string,
        organizationAndTeamData: OrganizationAndTeamData,
        options: {
            timeout?: number;
            initialInterval?: number;
            maxInterval?: number;
            useExponentialBackoff?: boolean;
        } = {
            timeout: 120000, // Default timeout increased to 2 minutes
            initialInterval: 1000, // Start with 1 second (faster for quick tasks)
            maxInterval: 30000, // Cap at 30 seconds
            useExponentialBackoff: true, // Enable exponential backoff by default
        },
    ): Promise<GetTaskInfoResponse> {
        if (!taskId) {
            throw new Error('Task ID is required to await task completion');
        }

        const { timeout, initialInterval, maxInterval, useExponentialBackoff } =
            options;

        const startTime = Date.now();
        let attempt = 0;

        const endStates = [
            TaskStatus.TASK_STATUS_COMPLETED,
            TaskStatus.TASK_STATUS_FAILED,
            TaskStatus.TASK_STATUS_CANCELLED,
        ];

        while (true) {
            const elapsedTime = Date.now() - startTime;

            if (elapsedTime > timeout) {
                this.logger.error({
                    message: `Task ${taskId} timed out after ${timeout}ms (${Math.floor(timeout / 1000)}s)`,
                    context: CodeAstAnalysisService.name,
                    metadata: {
                        taskId,
                        timeout,
                        attempts: attempt,
                        elapsedTime,
                    },
                });
                throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
            }

            try {
                this.logger.log({
                    message: `Polling task ${taskId} status (attempt ${attempt + 1})`,
                    context: CodeAstAnalysisService.name,
                    metadata: {
                        taskId,
                        attempt: attempt + 1,
                        elapsedTime: `${Math.floor(elapsedTime / 1000)}s`,
                    },
                });

                const taskStatus = await this.astAxios.get<GetTaskInfoResponse>(
                    `/api/tasks/${taskId}`,
                    {
                        headers: {
                            'x-task-key':
                                organizationAndTeamData.organizationId,
                        },
                    },
                );

                if (!taskStatus || !taskStatus.task) {
                    throw new Error(`Task ${taskId} not found`);
                }

                if (endStates.includes(taskStatus.task.status)) {
                    this.logger.log({
                        message: `Task ${taskId} completed with status: ${taskStatus.task.status}`,
                        context: CodeAstAnalysisService.name,
                        metadata: {
                            taskId,
                            status: taskStatus.task.status,
                            totalAttempts: attempt + 1,
                            totalTime: `${Math.floor(elapsedTime / 1000)}s`,
                        },
                    });
                    return taskStatus;
                }
            } catch (error) {
                if (error?.response?.status === 404) {
                    this.logger.warn({
                        message: `Task ${taskId} not found`,
                        context: CodeAstAnalysisService.name,
                        error,
                        metadata: { taskId },
                    });

                    return null;
                }

                this.logger.warn({
                    message: `A transient error occurred while polling for task ${taskId}. Retrying...`,
                    error,
                    context: CodeAstAnalysisService.name,
                    metadata: { taskId, attempt: attempt + 1 },
                });
            }

            // Calculate next wait interval using shared utility
            const waitInterval = useExponentialBackoff
                ? calculateBackoffInterval(attempt, {
                      baseInterval: initialInterval,
                      maxInterval,
                  })
                : calculateBackoffInterval(attempt, {
                      baseInterval: initialInterval,
                      maxInterval,
                      multiplier: 1, // Linear increment
                  });

            this.logger.debug({
                message: `Waiting ${waitInterval}ms before next poll`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    taskId,
                    waitInterval,
                    attempt: attempt + 1,
                    useExponentialBackoff,
                },
            });

            await new Promise((resolve) => setTimeout(resolve, waitInterval));
            attempt++;
        }
    }

    async deleteASTAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        taskId: string,
    ): Promise<void> {
        try {
            const { headRepo, baseRepo } = await this.getRepoParams(
                repository,
                pullRequest,
                organizationAndTeamData,
                platformType,
            );

            if (!headRepo) {
                throw new Error('Head repository parameters are missing');
            }

            await this.astAxios.post(
                '/api/ast/repositories/delete',
                {
                    baseRepo,
                    headRepo,
                    organizationId: organizationAndTeamData.organizationId,
                    taskId,
                },
                {
                    headers: {
                        'x-task-key': organizationAndTeamData.organizationId,
                    },
                },
            );
        } catch (error) {
            this.logger.error({
                message: `Error during AST analysis deletion for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    async startValidate(payload: {
        files: ASTValidateCodeRequest;
    }): Promise<{ taskId: string }> {
        const taskId = await this.astAxios.post(
            '/api/ast/validate-code/initialize',
            { ...payload.files },
        );

        return taskId;
    }

    async getValidate(
        taskId: string,
        organizationAndTeamData?: OrganizationAndTeamData,
    ) {
        let attempt = 0;
        const maxAttempts = 3;

        while (true) {
            try {
                const response = await this.astAxios.get<any>(
                    `/api/ast/validate-code/result/${taskId}`,
                );

                return response?.result;
            } catch (error) {
                attempt++;
                const isTransientError =
                    error.code === 'ECONNRESET' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNABORTED' ||
                    error.message?.includes('socket hang up');

                if (!isTransientError || attempt >= maxAttempts) {
                    throw error;
                }

                this.logger.warn({
                    message: `Transient error calling getValidate, attempt ${attempt}/${maxAttempts}`,
                    error,
                    context: CodeAstAnalysisService.name,
                    metadata: { taskId, organizationAndTeamData },
                });

                const waitTime = calculateBackoffInterval(attempt, {
                    baseInterval: 1000,
                    maxInterval: 5000,
                });

                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
        }
    }

    public async validateWithLLM(
        taskId: string,
        payload: {
            code: string;
            filePath: string;
            language?: string;
            diff?: string;
        },
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<ValidateCodeSemanticsResult | null> {
        const provider = LLMModelProvider.GROQ_GPT_OSS_120B;
        const fallbackProvider = LLMModelProvider.OPENAI_GPT_4O_MINI;
        const runName = 'validateWithLLM';
        const spanName = `${CodeAstAnalysisService.name}::${runName}`;

        const spanAttrs = {
            organizationId: organizationAndTeamData?.organizationId,
            prNumber,
            filePath: payload.filePath,
        };

        try {
            const { result } = await this.observabilityService.runLLMInSpan({
                spanName,
                runName,
                attrs: spanAttrs,
                exec: async (callbacks) => {
                    return await this.promptRunnerService
                        .builder()
                        .setProviders({
                            main: provider,
                            fallback: fallbackProvider,
                        })
                        .setParser(ParserType.ZOD, validateCodeSemanticsSchema)
                        .setLLMJsonMode(true)
                        .setPayload(payload)
                        .addPrompt({
                            role: PromptRole.USER,
                            prompt: prompt_validateCodeSemantics,
                        })
                        .addCallbacks(callbacks)
                        .addMetadata({
                            organizationId:
                                organizationAndTeamData?.organizationId,
                            teamId: organizationAndTeamData?.teamId,
                            pullRequestId: prNumber,
                            provider,
                            fallbackProvider,
                            runName,
                        })
                        .setTemperature(0)
                        .setRunName(runName)
                        .execute();
                },
            });

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Error executing LLM validation',
                context: CodeAstAnalysisService.name,
                metadata: {
                    filePath: payload.filePath,
                    taskId,
                    organizationAndTeamData,
                    prNumber,
                },
                error,
            });
            return null;
        }
    }

    async test(payload: any): Promise<any> {
        const { headRepo } = await this.getRepoParams(
            payload.repository,
            payload.pullRequest,
            payload.organizationAndTeamData,
            payload.platformType,
        );

        const response = await this.astAxios.post(
            '/api/lsp/suggestion/diagnostic',
            {
                repoData: headRepo,
                suggestions: payload.suggestions,
            },
        );

        return response;
    }

    async getTest(id: string): Promise<any> {
        const response = await this.astAxios.get(
            `/api/ast/validate-code/result/c25eae7e-5a78-46a9-acbe-8ab819d0a0b8`,
        );

        return response;
    }

    async checkSuggestionSimplicity(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        suggestion: Partial<CodeSuggestion>,
    ): Promise<{ isSimple: boolean; reason?: string }> {
        const runName = 'checkSuggestionSimplicity';
        const provider = LLMModelProvider.GEMINI_2_5_FLASH;
        const fallbackProvider = LLMModelProvider.OPENAI_GPT_4O_MINI;

        const spanName = `${CodeAstAnalysisService.name}::${runName}`;
        const spanAttrs = {
            organizationId: organizationAndTeamData?.organizationId,
            prNumber,
        };

        try {
            const { result } = await this.observabilityService.runLLMInSpan({
                spanName,
                runName,
                attrs: spanAttrs,
                exec: async (callbacks) => {
                    return await this.promptRunnerService
                        .builder()
                        .setProviders({
                            main: provider,
                            fallback: fallbackProvider,
                        })
                        .setParser(
                            ParserType.ZOD,
                            checkSuggestionSimplicitySchema,
                        )
                        .setLLMJsonMode(true)
                        .setTemperature(0)
                        .setPayload({
                            language: suggestion.language || 'text',
                            existingCode: suggestion.existingCode || '',
                            improvedCode: suggestion.improvedCode || '',
                        })
                        .addPrompt({
                            prompt: prompt_checkSuggestionSimplicity_system,
                            role: PromptRole.SYSTEM,
                        })
                        .addPrompt({
                            prompt: prompt_checkSuggestionSimplicity_user,
                            role: PromptRole.USER,
                        })
                        .addCallbacks(callbacks)
                        .addMetadata({
                            organizationId:
                                organizationAndTeamData?.organizationId,
                            teamId: organizationAndTeamData?.teamId,
                            pullRequestId: prNumber,
                            provider,
                            fallbackProvider,
                            runName,
                        })
                        .setRunName(runName)
                        .execute();
                },
            });

            if (!result) {
                this.logger.warn({
                    message:
                        'No result from LLM when checking suggestion simplicity',
                    context: CodeAstAnalysisService.name,
                    metadata: {
                        organizationAndTeamData,
                        prNumber,
                        suggestionId: suggestion.id,
                    },
                });

                return { isSimple: false, reason: 'No result from LLM' };
            }

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Error checking suggestion simplicity',
                error,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData,
                    prNumber,
                    suggestionId: suggestion.id,
                },
            });

            // Fail safe: if error, assume not simple to be safe
            return { isSimple: false, reason: 'Error during check' };
        }
    }
}
