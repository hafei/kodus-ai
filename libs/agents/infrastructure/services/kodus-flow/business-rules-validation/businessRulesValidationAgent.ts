import { AgentInputEnum, Thread, createLogger } from '@kodus/flow';
import { LLMModelProvider, PromptRunnerService } from '@kodus/kodus-common/llm';
import { Injectable, Inject, Optional } from '@nestjs/common';

import { ParametersKey } from '@libs/core/domain/enums/parameters-key.enum';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';
import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import {
    PARAMETERS_SERVICE_TOKEN,
    IParametersService,
} from '@libs/organization/domain/parameters/contracts/parameters.service.contract';
import { ObservabilityService } from '@libs/core/log/observability.service';

import { BlueprintStepContractViolationError } from '@libs/shared/blueprint/blueprint.runner';
import { BlueprintStep, LLMStep } from '@libs/shared/blueprint/blueprint.types';
import { GenericSkillRunnerService } from '../../../../skills/generic-skill-runner.service';
import { CapabilityStrategyService } from '../../../../skills/runtime/capability-strategy.service';
import { CapabilityResourcePlanService } from '../../../../skills/runtime/capability-resource-plan.service';
import {
    CapabilityExecutionHooks,
    SkillCapabilityRuntimeConfig,
    ToolCaller,
} from '../../../../skills/runtime/skill-runtime.types';
import { asRecord } from '../../../../skills/runtime/value-utils';
import {
    isMcpConnectivityError,
    McpConnectionUnavailableError,
    RequiredMcpPreflightError,
} from '../../../../skills/skill.errors';
import { createBusinessRulesBlueprint } from './blueprint';
import {
    buildMcpConnectionFailureFeedback,
    buildRequiredMcpFeedback,
} from './required-mcp-feedback';
import { BusinessRulesContext, ValidationResult } from './types';
import { MetricsCollectorService } from '@libs/core/infrastructure/metrics/metrics-collector.service';
import {
    AbstractSkillProvider,
    SkillErrorContext,
} from '../../../../skills/abstract-skill-provider';
import { buildBusinessRulesAnalysisPrompt } from './analysis-prompt.builder';
import { buildBusinessRulesContractViolationFeedback } from './contract-feedback.builder';
import { parseBusinessRulesValidationResult } from './validation-result.parser';

const SKILL_NAME = 'business-rules-validation';

/** Re-exported for backward compatibility with callers that imported from here */
export type { ValidationResult };

@Injectable()
export class BusinessRulesValidationAgentProvider extends AbstractSkillProvider<BusinessRulesContext> {
    private readonly logger = createLogger(
        BusinessRulesValidationAgentProvider.name,
    );

    protected readonly skillName = SKILL_NAME;

    protected readonly defaultLLMConfig = {
        llmProvider: LLMModelProvider.GEMINI_2_5_PRO,
        temperature: 0,
        maxTokens: 20000,
        maxReasoningTokens: 1000,
        stop: undefined as string[] | undefined,
    };

    constructor(
        promptRunnerService: PromptRunnerService,
        permissionValidationService: PermissionValidationService,
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
        observabilityService: ObservabilityService,
        genericSkillRunner: GenericSkillRunnerService,
        @Optional() metricsCollector?: MetricsCollectorService,
        @Optional() capabilityStrategyService?: CapabilityStrategyService,
        @Optional() capabilityResourcePlanService?: CapabilityResourcePlanService,
    ) {
        super(
            promptRunnerService,
            permissionValidationService,
            observabilityService,
            genericSkillRunner,
            metricsCollector,
            capabilityStrategyService,
            capabilityResourcePlanService,
        );
    }

    protected createBlueprint(
        fetcher: ToolCaller,
        capabilityRuntime: SkillCapabilityRuntimeConfig,
        hooks?: CapabilityExecutionHooks<BusinessRulesContext>,
    ): BlueprintStep<BusinessRulesContext>[] {
        return createBusinessRulesBlueprint(fetcher, capabilityRuntime, hooks);
    }

    protected runLLMStep(
        step: LLMStep,
        ctx: BusinessRulesContext,
    ): Promise<BusinessRulesContext> {
        return this.runAnalyzer(step, ctx);
    }

    protected createInitialContext(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prepareContext?: any;
        thread?: Thread;
        userLanguage: string;
    }): BusinessRulesContext {
        return {
            organizationAndTeamData: params.organizationAndTeamData,
            userLanguage: params.userLanguage,
            thread: params.thread,
            prepareContext: params.prepareContext,
        };
    }

    protected resolveTaskContextMode(
        ctx: BusinessRulesContext,
    ): 'cache_first' | 'agent_first' {
        return ctx.prepareContext?.taskContextResolutionMode ?? 'cache_first';
    }

    protected resolveUserLanguage(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<string> {
        return this.getLanguage(organizationAndTeamData);
    }

    protected onFetcherInitializationError(
        params: SkillErrorContext,
    ): string | undefined {
        const { error, userLanguage, context } = params;

        if (error instanceof RequiredMcpPreflightError) {
            const feedback = buildRequiredMcpFeedback({
                requiredMcps: error.requiredMcps,
                userLanguage,
                availableProviders: error.availableProviders,
            });

            this.logger.warn({
                message:
                    'Business rules validation skipped due to missing required MCP integrations',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationId: context.organizationAndTeamData?.organizationId,
                    teamId: context.organizationAndTeamData?.teamId,
                    requiredMcps: error.requiredMcps,
                },
            });

            return feedback;
        }

        if (error instanceof McpConnectionUnavailableError) {
            const feedback = buildMcpConnectionFailureFeedback({
                userLanguage,
                availableProviders: error.availableProviders,
            });

            this.logger.warn({
                message:
                    'Business rules validation skipped due to MCP connection failure during fetcher initialization',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationId: context.organizationAndTeamData?.organizationId,
                    teamId: context.organizationAndTeamData?.teamId,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                },
            });

            return feedback;
        }

        return undefined;
    }

    protected onBlueprintExecutionError(
        params: SkillErrorContext,
    ): string | undefined {
        const { error, userLanguage, context } = params;

        if (
            error instanceof McpConnectionUnavailableError ||
            isMcpConnectivityError(error)
        ) {
            const feedback = buildMcpConnectionFailureFeedback({
                userLanguage,
                availableProviders:
                    error instanceof McpConnectionUnavailableError
                        ? error.availableProviders
                        : undefined,
            });

            this.logger.warn({
                message:
                    'Business rules validation failed due to MCP connection error while executing blueprint',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationId: context.organizationAndTeamData?.organizationId,
                    teamId: context.organizationAndTeamData?.teamId,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                },
            });

            return feedback;
        }

        if (error instanceof BlueprintStepContractViolationError) {
            return buildBusinessRulesContractViolationFeedback(
                userLanguage,
                error.stage,
                [error.details],
            );
        }

        return undefined;
    }

    private async runAnalyzer(
        _step: LLMStep,
        ctx: BusinessRulesContext,
    ): Promise<BusinessRulesContext> {
        const executionPolicy =
            this.genericSkillRunner.getExecutionPolicy(SKILL_NAME);
        const analyzerInstructions = this.genericSkillRunner.getAnalyzerInstructions(
            SKILL_NAME,
            {
                organizationId: ctx.organizationAndTeamData?.organizationId,
                teamId: ctx.organizationAndTeamData?.teamId,
                customInstructions: this.resolveAnalyzerCustomInstructions(ctx),
            },
        );
        const analyzerAdapter = super.createLLMAdapter(
            'BusinessRulesValidation',
            'businessRulesAnalyzer',
        );
        const prompt = buildBusinessRulesAnalysisPrompt(ctx);
        const maxAttempts = Math.max(1, executionPolicy.analyzerMaxIterations);
        let validationResult: ValidationResult | undefined;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const analysisResult = await this.withTimeout(
                    analyzerAdapter.call({
                        messages: [
                            {
                                role: AgentInputEnum.SYSTEM,
                                content: analyzerInstructions,
                            },
                            {
                                role: AgentInputEnum.USER,
                                content: prompt,
                            },
                        ],
                        temperature: this.defaultLLMConfig.temperature,
                        maxTokens: this.defaultLLMConfig.maxTokens,
                        maxReasoningTokens:
                            this.defaultLLMConfig.maxReasoningTokens,
                        stop: this.defaultLLMConfig.stop,
                    }),
                    executionPolicy.analyzerTimeoutMs,
                    `business-rules-analyzer-attempt-${attempt}`,
                );

                const usage = asRecord(
                    (analysisResult as { usage?: unknown }).usage,
                );
                const tokensIn =
                    typeof usage.promptTokens === 'number'
                        ? usage.promptTokens
                        : 0;
                const tokensOut =
                    typeof usage.completionTokens === 'number'
                        ? usage.completionTokens
                        : 0;
                const totalTokens =
                    typeof usage.totalTokens === 'number'
                        ? usage.totalTokens
                        : tokensIn + tokensOut;
                this.logger.log({
                    message: 'Business rules analyzer token usage',
                    context: BusinessRulesValidationAgentProvider.name,
                    serviceName: BusinessRulesValidationAgentProvider.name,
                    metadata: {
                        attempt,
                        tokensIn,
                        tokensOut,
                        totalTokens,
                        organizationId:
                            ctx.organizationAndTeamData?.organizationId,
                        teamId: ctx.organizationAndTeamData?.teamId,
                    },
                });

                const parsed = this.parseValidationResult(analysisResult.content);
                validationResult = parsed;
                if (!this.isParserFallback(parsed) || attempt === maxAttempts) {
                    break;
                }
            } catch (error) {
                lastError = error;
                if (attempt === maxAttempts) {
                    break;
                }
            }
        }

        if (!validationResult) {
            validationResult = {
                needsMoreInfo: true,
                missingInfo:
                    lastError instanceof Error
                        ? `Analyzer execution failed: ${lastError.message}`
                        : 'Analyzer execution failed.',
                summary:
                    '❌ **Error processing validation**\n\nAn error occurred while processing the system response. Please try again.',
            };
        }

        const formattedResponse = validationResult.needsMoreInfo
            ? (validationResult.missingInfo ??
              '## 🤔 Need Task Information\n\nPlease provide task context.')
            : (validationResult.summary ?? '');

        return { ...ctx, validationResult, formattedResponse };
    }

    private isParserFallback(result: ValidationResult): boolean {
        if (!result.needsMoreInfo) {
            return false;
        }

        const message = (result.missingInfo ?? '').toLowerCase();
        return message.includes('error parsing validation result');
    }

    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        label: string,
    ): Promise<T> {
        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Timeout after ${timeoutMs}ms in ${label}`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    private resolveAnalyzerCustomInstructions(
        ctx: BusinessRulesContext,
    ): string | undefined {
        const value = ctx.prepareContext?.customInstructions;
        return typeof value === 'string' && value.trim().length > 0
            ? value
            : undefined;
    }

    protected async createMCPAdapter(
        _organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {}

    private parseValidationResult(result: unknown): ValidationResult {
        return parseBusinessRulesValidationResult(result);
    }

    private async getLanguage(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<string> {
        if (!organizationAndTeamData?.teamId) return 'en-US';

        try {
            const language = await this.parametersService.findByKey(
                ParametersKey.LANGUAGE_CONFIG,
                organizationAndTeamData,
            );
            return language?.configValue ?? 'en-US';
        } catch {
            return 'en-US';
        }
    }

}
