import { createCapabilityToolRuntime } from '@libs/agents/skills/runtime/capability-runtime.resolver';
import {
    fetchPullRequestDiff,
    fetchPullRequestMetadata,
    fetchTaskContext as fetchTaskContextCapability,
    PrDiffReadParams,
    PrMetadataReadParams,
} from '@libs/agents/skills/capabilities';
import {
    CapabilityExecutionHooks,
    CapabilityExecutionTrace,
    SkillCapabilityRuntimeConfig,
    ToolCaller,
} from '@libs/agents/skills/runtime/skill-runtime.types';

import {
    BusinessRulesContext,
    TaskContextNormalized,
    TaskQuality,
} from './types';

export const SKILL_NAME = 'business-rules-validation';
export const PR_METADATA_CAPABILITY = 'pr.metadata.read';
export const PR_DIFF_CAPABILITY = 'pr.diff.read';
export const TASK_CONTEXT_CAPABILITY = 'task.context.read';

interface ToolingResult<T> {
    value: T;
    traces: CapabilityExecutionTrace[];
}

export interface BusinessRulesBlueprintTooling {
    fetchPullRequestBody: (
        ctx: BusinessRulesContext,
    ) => Promise<ToolingResult<string | undefined>>;
    fetchPullRequestDiff: (
        ctx: BusinessRulesContext,
    ) => Promise<ToolingResult<string>>;
    fetchTaskContext: (
        ctx: BusinessRulesContext,
    ) => Promise<ToolingResult<TaskContextNormalized | undefined>>;
}

export function resolvePullRequestDescription(
    ctx: BusinessRulesContext,
): string {
    const description = ctx.prepareContext?.pullRequestDescription;
    return typeof description === 'string' ? description : '';
}

export function resolveTaskContext(ctx: BusinessRulesContext): string {
    const taskContext = ctx.prepareContext?.taskContext;
    return typeof taskContext === 'string' ? taskContext : '';
}

export function classifyTaskQuality(taskContext: string): TaskQuality {
    const normalized = taskContext.trim();
    if (!normalized.length) {
        return 'EMPTY';
    }
    if (normalized.length < 80) {
        return 'MINIMAL';
    }
    if (normalized.length < 260) {
        return 'PARTIAL';
    }
    return 'COMPLETE';
}

function resolvePullRequestMetadataToolArgs(
    ctx: BusinessRulesContext,
): PrMetadataReadParams | undefined {
    const organizationId = ctx.organizationAndTeamData?.organizationId;
    const teamId = ctx.organizationAndTeamData?.teamId;
    const repositoryId = resolveRepositoryId(ctx);
    const repositoryName = resolveRepositoryName(ctx) ?? repositoryId;
    const prNumber = resolvePullRequestNumber(ctx);

    if (
        typeof organizationId !== 'string' ||
        typeof teamId !== 'string' ||
        typeof repositoryId !== 'string' ||
        typeof repositoryName !== 'string' ||
        typeof prNumber !== 'number'
    ) {
        return undefined;
    }

    return {
        organizationId,
        teamId,
        repositoryId,
        repositoryName,
        pullRequestNumber: prNumber,
    };
}

function resolvePullRequestDiffToolArgs(
    ctx: BusinessRulesContext,
): PrDiffReadParams | undefined {
    const organizationId = ctx.organizationAndTeamData?.organizationId;
    const teamId = ctx.organizationAndTeamData?.teamId;
    const repositoryId = resolveRepositoryId(ctx);
    const repositoryName = resolveRepositoryName(ctx);
    const prNumber = resolvePullRequestNumber(ctx);

    if (
        typeof organizationId !== 'string' ||
        typeof teamId !== 'string' ||
        typeof repositoryId !== 'string' ||
        typeof prNumber !== 'number'
    ) {
        return undefined;
    }

    return {
        organizationId,
        teamId,
        repositoryId,
        repositoryName,
        pullRequestNumber: prNumber,
    };
}

export function createBusinessRulesBlueprintTooling(
    fetcher: ToolCaller,
    capabilityRuntime: SkillCapabilityRuntimeConfig,
    hooks?: CapabilityExecutionHooks<BusinessRulesContext>,
): BusinessRulesBlueprintTooling {
    const providerType = capabilityRuntime.providerType || 'external';
    const registeredTools = getRegisteredToolNames(fetcher);
    const capabilityTools = createCapabilityToolRuntime({
        config: capabilityRuntime,
        registeredTools,
    });

    return {
        fetchPullRequestBody: async (ctx: BusinessRulesContext) => {
            const args = resolvePullRequestMetadataToolArgs(ctx);
            const toolName = capabilityTools.getToolName(PR_METADATA_CAPABILITY);
            const metadata = await fetchPullRequestMetadata(fetcher, toolName, args, {
                skillName: SKILL_NAME,
                organizationId:
                    ctx.organizationAndTeamData?.organizationId ?? 'unknown-org',
                teamId: ctx.organizationAndTeamData?.teamId ?? 'unknown-team',
                provider: providerType,
            });

            await Promise.all(
                metadata.traces.map((trace) => hooks?.recordExecution?.(trace)),
            );

            return {
                value: metadata.body,
                traces: metadata.traces,
            };
        },

        fetchPullRequestDiff: async (ctx: BusinessRulesContext) => {
            const args = resolvePullRequestDiffToolArgs(ctx);
            const toolName = capabilityTools.getToolName(PR_DIFF_CAPABILITY);
            const diff = await fetchPullRequestDiff(fetcher, toolName, args, {
                skillName: SKILL_NAME,
                organizationId:
                    ctx.organizationAndTeamData?.organizationId ?? 'unknown-org',
                teamId: ctx.organizationAndTeamData?.teamId ?? 'unknown-team',
                provider: providerType,
            });

            await Promise.all(
                diff.traces.map((trace) => hooks?.recordExecution?.(trace)),
            );

            return {
                value: diff.diff,
                traces: diff.traces,
            };
        },

        fetchTaskContext: async (ctx: BusinessRulesContext) => {
            const taskContext = await fetchTaskContextCapability(
                fetcher,
                capabilityRuntime,
                {
                    skillName: SKILL_NAME,
                    organizationId:
                        ctx.organizationAndTeamData?.organizationId ??
                        'unknown-org',
                    teamId:
                        ctx.organizationAndTeamData?.teamId ?? 'unknown-team',
                    pullRequestNumber: resolvePullRequestNumber(ctx),
                    prBody: ctx.prBody,
                    headRef:
                        typeof ctx.prepareContext?.pullRequest?.headRef ===
                        'string'
                            ? ctx.prepareContext?.pullRequest?.headRef
                            : undefined,
                    userQuestion:
                        typeof ctx.prepareContext?.userQuestion === 'string'
                            ? ctx.prepareContext?.userQuestion
                            : undefined,
                    pullRequestDescription:
                        typeof ctx.prepareContext?.pullRequestDescription ===
                        'string'
                            ? ctx.prepareContext?.pullRequestDescription
                            : undefined,
                    taskContext:
                        typeof ctx.prepareContext?.taskContext === 'string'
                            ? ctx.prepareContext?.taskContext
                            : undefined,
                    userLanguage: ctx.userLanguage,
                    thread: ctx.thread,
                    excludedTools: [
                        capabilityTools.getToolName(PR_METADATA_CAPABILITY),
                        capabilityTools.getToolName(PR_DIFF_CAPABILITY),
                    ].filter(
                        (toolName): toolName is string =>
                            typeof toolName === 'string',
                    ),
                    taskContextResolutionMode:
                        hooks?.resolveTaskContextMode?.(ctx, providerType) ??
                        'cache_first',
                    enableAgenticFallback:
                        ctx.prepareContext?.enableAgenticFallback,
                },
                {
                    getSeedTaskContextTools: hooks?.getSeedTaskContextTools,
                    getCachedTaskContextTools: hooks?.getCachedTaskContextTools,
                    saveCachedTaskContextTools:
                        hooks?.saveCachedTaskContextTools,
                    resolvePreferredTool: hooks?.resolvePreferredTool,
                    recordExecution: hooks?.recordExecution,
                },
            );

            return {
                value: taskContext.normalized,
                traces: taskContext.traces,
            };
        },
    };
}

function resolvePullRequestNumber(
    ctx: BusinessRulesContext,
): number | undefined {
    const nested = ctx.prepareContext?.pullRequest?.pullRequestNumber;
    if (typeof nested === 'number') {
        return nested;
    }
    return undefined;
}

function resolveRepositoryId(ctx: BusinessRulesContext): string | undefined {
    const repositoryId = ctx.prepareContext?.repository?.id;
    return typeof repositoryId === 'string' ? repositoryId : undefined;
}

function resolveRepositoryName(ctx: BusinessRulesContext): string | undefined {
    const repositoryName = ctx.prepareContext?.repository?.name;
    return typeof repositoryName === 'string' ? repositoryName : undefined;
}

function getRegisteredToolNames(fetcher: ToolCaller): string[] {
    return fetcher
        .getRegisteredTools()
        .map((tool) => tool.name ?? '')
        .filter((toolName) => toolName.trim().length > 0);
}
