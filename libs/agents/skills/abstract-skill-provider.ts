import { Thread, createLogger } from '@kodus/flow';
import { PromptRunnerService } from '@kodus/kodus-common/llm';

import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import { ObservabilityService } from '@libs/core/log/observability.service';
import { MetricsCollectorService } from '@libs/core/infrastructure/metrics/metrics-collector.service';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';
import {
    BlueprintStepContractViolationError,
    runBlueprint,
} from '@libs/shared/blueprint/blueprint.runner';
import {
    BlueprintContext,
    BlueprintStep,
    BlueprintStepMetric,
    LLMStep,
} from '@libs/shared/blueprint/blueprint.types';

import { BaseAgentProvider } from '../infrastructure/services/kodus-flow/base-agent.provider';
import { GenericSkillRunnerService } from './generic-skill-runner.service';
import { buildCapabilityHooks } from './runtime/capability-hooks.factory';
import { CapabilityResourcePlanService } from './runtime/capability-resource-plan.service';
import { CapabilityStrategyService } from './runtime/capability-strategy.service';
import {
    CapabilityExecutionHooks,
    CapabilityExecutionTrace,
    SkillCapabilityRuntimeConfig,
    ToolCaller,
} from './runtime/skill-runtime.types';

export interface SkillExecutionContext {
    organizationAndTeamData: OrganizationAndTeamData;
    prepareContext?: any;
    thread?: Thread;
}

export interface SkillErrorContext {
    userLanguage: string;
    context: SkillExecutionContext;
    error: unknown;
}

export abstract class AbstractSkillProvider<
    TContext extends BlueprintContext & {
        capabilityExecutionTrace?: CapabilityExecutionTrace[];
    },
> extends BaseAgentProvider {
    private readonly runtimeLogger = createLogger(this.constructor.name);

    protected abstract readonly skillName: string;

    constructor(
        promptRunnerService: PromptRunnerService,
        permissionValidationService: PermissionValidationService,
        observabilityService: ObservabilityService,
        protected readonly genericSkillRunner: GenericSkillRunnerService,
        protected readonly metricsCollector?: MetricsCollectorService,
        protected readonly capabilityStrategyService?: CapabilityStrategyService,
        protected readonly capabilityResourcePlanService?: CapabilityResourcePlanService,
    ) {
        super(
            promptRunnerService,
            permissionValidationService,
            observabilityService,
        );
    }

    protected abstract createBlueprint(
        fetcher: ToolCaller,
        capabilityRuntime: SkillCapabilityRuntimeConfig,
        hooks?: CapabilityExecutionHooks<TContext>,
    ): BlueprintStep<TContext>[];

    protected abstract runLLMStep(
        step: LLMStep,
        ctx: TContext,
    ): Promise<TContext>;

    protected abstract createInitialContext(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prepareContext?: any;
        thread?: Thread;
        userLanguage: string;
    }): TContext;

    protected abstract resolveUserLanguage(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<string>;

    protected resolveTaskContextMode(
        _ctx: TContext,
        _providerType: string,
    ): 'cache_first' | 'agent_first' {
        return 'cache_first';
    }

    protected onFetcherInitializationError(
        _params: SkillErrorContext,
    ): string | undefined {
        return undefined;
    }

    protected onBlueprintExecutionError(
        _params: SkillErrorContext,
    ): string | undefined {
        return undefined;
    }

    protected extractResponse(ctx: TContext): string {
        const formatted = (ctx as { formattedResponse?: string }).formattedResponse;
        return typeof formatted === 'string' ? formatted : '';
    }

    async execute(context: SkillExecutionContext): Promise<string> {
        const normalizedContext = context;

        if (!normalizedContext.organizationAndTeamData) {
            throw new Error(
                'Organization and team data is required for skill execution.',
            );
        }

        const userLanguage = await this.resolveUserLanguage(
            normalizedContext.organizationAndTeamData,
        );

        this.runtimeLogger.log({
            message: `${this.skillName} execution started`,
            context: this.constructor.name,
            serviceName: this.constructor.name,
            metadata: {
                skill: this.skillName,
                userLanguage,
                organizationId:
                    normalizedContext.organizationAndTeamData?.organizationId,
                teamId: normalizedContext.organizationAndTeamData?.teamId,
            },
        });

        await this.fetchBYOKConfig(normalizedContext.organizationAndTeamData);

        let fetcherRuntime: Awaited<
            ReturnType<GenericSkillRunnerService['createFetcherOrchestration']>
        >;
        try {
            fetcherRuntime = await this.genericSkillRunner.createFetcherOrchestration(
                this.skillName,
                super.createLLMAdapter(this.constructor.name, `${this.skillName}-fetcher`),
                normalizedContext.organizationAndTeamData,
            );
        } catch (error) {
            const feedback = this.onFetcherInitializationError({
                userLanguage,
                context: normalizedContext,
                error,
            });
            if (feedback) {
                return feedback;
            }
            throw error;
        }

        const initialCtx = this.createInitialContext({
            organizationAndTeamData: normalizedContext.organizationAndTeamData,
            prepareContext: normalizedContext.prepareContext,
            thread: normalizedContext.thread,
            userLanguage,
        });

        const capabilityRuntimeConfig = fetcherRuntime.capabilityRuntime;
        const capabilityHooks = buildCapabilityHooks<TContext>({
            strategyService: this.capabilityStrategyService,
            resourcePlanService: this.capabilityResourcePlanService,
            resolveTaskContextMode: (ctx, providerType) =>
                this.resolveTaskContextMode(ctx, providerType),
            recordExecution: (trace) => this.recordCapabilityExecution(trace),
        });

        let result: Awaited<ReturnType<typeof runBlueprint<TContext>>>;
        try {
            result = await runBlueprint<TContext>({
                steps: this.createBlueprint(
                    fetcherRuntime.toolCaller,
                    capabilityRuntimeConfig,
                    capabilityHooks,
                ),
                context: initialCtx,
                runLLMStep: (step, ctx) => this.runLLMStep(step, ctx),
                onStepMetric: (metric) =>
                    this.recordStepMetric(
                        metric,
                        normalizedContext.organizationAndTeamData,
                    ),
                logger: {
                    log: (msg) =>
                        this.runtimeLogger.log({
                            message: msg,
                            context: this.constructor.name,
                            serviceName: this.constructor.name,
                        }),
                    error: (msg, err) =>
                        this.runtimeLogger.error({
                            message: msg,
                            context: this.constructor.name,
                            serviceName: this.constructor.name,
                            metadata: { error: err },
                        }),
                },
            });
        } catch (error) {
            if (error instanceof BlueprintStepContractViolationError) {
                this.runtimeLogger.error({
                    message:
                        'Skill execution failed due to blueprint step contract violation',
                    context: this.constructor.name,
                    serviceName: this.constructor.name,
                    metadata: {
                        organizationId:
                            normalizedContext.organizationAndTeamData
                                ?.organizationId,
                        teamId: normalizedContext.organizationAndTeamData?.teamId,
                        skill: this.skillName,
                        stepName: error.stepName,
                        stage: error.stage,
                        details: error.details,
                    },
                });
            }

            const feedback = this.onBlueprintExecutionError({
                userLanguage,
                context: normalizedContext,
                error,
            });
            if (feedback) {
                return feedback;
            }
            throw error;
        }

        this.runtimeLogger.log({
            message: `${this.skillName} execution completed`,
            context: this.constructor.name,
            serviceName: this.constructor.name,
            metadata: {
                skill: this.skillName,
                organizationId:
                    normalizedContext.organizationAndTeamData?.organizationId,
                teamId: normalizedContext.organizationAndTeamData?.teamId,
                completedSteps: result.completedSteps,
                skippedAt: result.skippedAt,
                responseLength: this.extractResponse(result.context).length,
            },
        });

        const traces = result.context.capabilityExecutionTrace ?? [];
        if (traces.length > 0) {
            this.runtimeLogger.log({
                message: 'Capability execution traces',
                context: this.constructor.name,
                serviceName: this.constructor.name,
                metadata: {
                    organizationId:
                        normalizedContext.organizationAndTeamData?.organizationId,
                    teamId: normalizedContext.organizationAndTeamData?.teamId,
                    skill: this.skillName,
                    traceCount: traces.length,
                    traces: traces.map((trace) => ({
                        capability: trace.capability,
                        mode: trace.mode,
                        provider: trace.provider,
                        tool: trace.toolName,
                        status: trace.status,
                        reason: trace.reason,
                        latencyMs: trace.latencyMs,
                    })),
                },
            });
        }

        return this.extractResponse(result.context);
    }

    protected async recordCapabilityExecution(
        trace: CapabilityExecutionTrace,
    ): Promise<void> {
        if (!this.capabilityStrategyService) {
            return;
        }

        await this.capabilityStrategyService.recordExecution(trace);

        const labels = {
            skill: trace.skillName,
            capability: trace.capability,
            provider: trace.provider,
            mode: trace.mode,
            status: trace.status,
            toolName: trace.toolName ?? 'none',
            reason: trace.reason ?? 'none',
        };

        this.metricsCollector?.recordCounter(
            'kodus_skill_capability_execution_total',
            1,
            labels,
        );
        this.metricsCollector?.recordHistogram(
            'kodus_skill_capability_execution_duration_ms',
            trace.latencyMs,
            labels,
        );
    }

    protected recordStepMetric(
        metric: BlueprintStepMetric,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const labels = {
            skill: this.skillName,
            step: metric.stepName,
            stepType: metric.stepType,
            status: metric.status,
        };

        this.metricsCollector?.recordHistogram(
            'kodus_skill_step_duration_ms',
            metric.durationMs,
            labels,
        );
        this.metricsCollector?.recordCounter(
            'kodus_skill_step_total',
            1,
            labels,
        );

        this.runtimeLogger.log({
            message: 'Skill step metric',
            context: this.constructor.name,
            serviceName: this.constructor.name,
            metadata: {
                ...labels,
                durationMs: metric.durationMs,
                organizationId: organizationAndTeamData?.organizationId,
                teamId: organizationAndTeamData?.teamId,
                ...(metric.errorMessage
                    ? { errorMessage: metric.errorMessage }
                    : {}),
            },
        });
    }
}
