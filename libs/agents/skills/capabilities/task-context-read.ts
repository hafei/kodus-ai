import { createLogger } from '@kodus/flow';

import {
    executeDeterministicTool,
    DeterministicFallbackReason,
} from '../runtime/deterministic-tool-executor';
import {
    CapabilityExecutionTrace,
    CapabilityStrategyScope,
    SkillCapabilityRuntimeConfig,
    ToolCaller,
} from '../runtime/skill-runtime.types';
import { asRecord, safeJsonParse, safeStringify } from '../runtime/value-utils';

import { TaskContextNormalized } from './types';

const ISSUE_KEY_REGEX = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const URL_REGEX = /https?:\/\/[^\s)]+/gi;
const TASK_CONTEXT_CAPABILITY = 'task.context.read';

type ResolutionMode = 'cache_first' | 'agent_first';

export interface TaskContextReadParams {
    skillName: string;
    organizationId: string;
    teamId: string;
    pullRequestNumber?: number;
    prBody?: string;
    headRef?: string;
    userQuestion?: string;
    pullRequestDescription?: string;
    taskContext?: string;
    userLanguage?: string;
    thread?: unknown;
    excludedTools?: string[];
    taskContextResolutionMode?: ResolutionMode;
    enableAgenticFallback?: boolean;
}

export interface TaskContextReadResult {
    normalized: TaskContextNormalized | undefined;
    raw: string;
    traces: CapabilityExecutionTrace[];
}

export interface TaskContextReadHooks {
    getSeedTaskContextTools?: (
        provider: string,
        capability: string,
    ) => Promise<string[]>;
    getCachedTaskContextTools?: (
        scope: CapabilityStrategyScope,
    ) => Promise<string[]>;
    saveCachedTaskContextTools?: (
        scope: CapabilityStrategyScope,
        tools: string[],
    ) => Promise<void>;
    resolvePreferredTool?: (
        scope: CapabilityStrategyScope,
        candidates: string[],
    ) => Promise<string | undefined>;
    recordExecution?: (trace: CapabilityExecutionTrace) => Promise<void>;
}

interface TaskContextHints {
    issueKeys: string[];
    issueLinks: string[];
    queryText: string;
    urlHosts: string[];
}

interface TaskContextToolSignature {
    requiredParams: string[];
    properties: Record<string, Record<string, unknown>>;
    normalizedProperties: Record<string, Record<string, unknown>>;
}

interface ExecuteAndTraceParams<T> {
    params: TaskContextReadParams;
    toolCaller: ToolCaller;
    providerType: string;
    toolName: string | undefined;
    args: Record<string, unknown>;
    canExecute: boolean;
    extract: (payload: unknown) => T;
    fallback: T;
    isSuccessful: (value: T) => boolean;
    hooks?: TaskContextReadHooks;
    logger: ReturnType<typeof createLogger>;
}

interface AgentFallbackParams {
    toolCaller: ToolCaller;
    params: TaskContextReadParams;
    providerType: string;
    candidateTools: string[];
    hooks?: TaskContextReadHooks;
    logger: ReturnType<typeof createLogger>;
}

export async function fetchTaskContext(
    toolCaller: ToolCaller,
    capabilityRuntime: SkillCapabilityRuntimeConfig,
    params: TaskContextReadParams,
    hooks?: TaskContextReadHooks,
): Promise<TaskContextReadResult> {
    const logger = createLogger('TaskContextReadCapability');
    const providerType = capabilityRuntime.providerType || 'external';
    const registeredTools = getRegisteredToolNames(toolCaller);
    const taskContextToolSignatures = getTaskContextToolSignatures(toolCaller);

    const scope = buildScope(params, providerType);
    const providerCandidates = resolveTaskContextProviders({
        providerType,
        allProviderTypes: capabilityRuntime.allProviderTypes,
    });
    const hints = resolveTaskContextHints(params);
    const resolutionMode = params.taskContextResolutionMode ?? 'cache_first';
    const allowAgenticFallback = shouldUseAgenticTaskContextFallback(
        params,
        registeredTools.length > 0,
    );

    const cachedTools = (await hooks?.getCachedTaskContextTools?.(scope)) ?? [];
    const seededTools = uniqueNonEmpty(
        (
            await Promise.all(
                providerCandidates.map(
                    async (provider) =>
                        (await hooks?.getSeedTaskContextTools?.(
                            provider,
                            TASK_CONTEXT_CAPABILITY,
                        )) ?? [],
                ),
            )
        ).flat(),
    );

    const deterministicAllowlist = resolveTaskContextDeterministicAllowlist({
        seededTools,
    });

    const discoveredCandidateTools = getTaskContextCandidateTools({
        registeredTools,
        allowlist: [...deterministicAllowlist],
        excludedTools: params.excludedTools ?? [],
        logger,
    });

    const candidateTools = applyTaskContextToolBoundary({
        candidateTools: discoveredCandidateTools,
        seededTools,
    });

    const preferredTool = await hooks?.resolvePreferredTool?.(
        scope,
        candidateTools,
    );
    const orderedTools = orderCandidateTools({
        candidateTools,
        preferredTool,
        cachedTools,
        seededTools,
        includeExploration:
            preferredTool === undefined &&
            cachedTools.length === 0 &&
            seededTools.length === 0,
    });

    const traces: CapabilityExecutionTrace[] = [];

    if (!orderedTools.length && !allowAgenticFallback) {
        const emptyCandidatesTrace: CapabilityExecutionTrace = {
            ...createBaseTrace(params, {
                capability: TASK_CONTEXT_CAPABILITY,
                mode: 'deterministic',
                provider: providerType,
            }),
            status: 'skipped',
            reason: 'no_candidate_tools',
            latencyMs: 0,
        };
        traces.push(emptyCandidatesTrace);
        await hooks?.recordExecution?.(emptyCandidatesTrace);

        return {
            normalized: undefined,
            raw: '',
            traces,
        };
    }

    if (resolutionMode === 'agent_first' && allowAgenticFallback) {
        const agenticFirst = await fetchTaskContextWithAgentFallback({
            toolCaller,
            params,
            providerType,
            candidateTools: orderedTools,
            hooks,
            logger,
        });

        traces.push(...agenticFirst.traces);
        await maybePersistLearnedTools(
            hooks,
            scope,
            agenticFirst.learnedTools,
            candidateTools,
            registeredTools,
            cachedTools,
        );

        if (agenticFirst.value) {
            return {
                normalized: agenticFirst.value,
                raw: agenticFirst.value.description ?? '',
                traces,
            };
        }
    }

    for (const toolName of orderedTools) {
        const argsCandidates = buildTaskContextArgsCandidates(
            toolName,
            hints,
            taskContextToolSignatures.get(toolName),
        );

        for (const args of argsCandidates) {
            const result = await executeAndTrace({
                params,
                toolCaller,
                providerType,
                toolName,
                args,
                canExecute: true,
                extract: (payload) => extractTaskContextFromToolResult(payload),
                fallback: undefined,
                isSuccessful: (value) => Boolean(value?.description || value?.title),
                hooks,
                logger,
            });

            traces.push(...result.traces);
            if (result.value) {
                result.value.sourceProvider = providerType;
                await maybePersistLearnedTools(
                    hooks,
                    scope,
                    [toolName],
                    candidateTools,
                    registeredTools,
                    cachedTools,
                );

                return {
                    normalized: result.value,
                    raw: result.value.description ?? '',
                    traces,
                };
            }
        }
    }

    if (!allowAgenticFallback) {
        return {
            normalized: undefined,
            raw: '',
            traces,
        };
    }

    const agenticFallback = await fetchTaskContextWithAgentFallback({
        toolCaller,
        params,
        providerType,
        candidateTools: orderedTools,
        hooks,
        logger,
    });

    traces.push(...agenticFallback.traces);
    await maybePersistLearnedTools(
        hooks,
        scope,
        agenticFallback.learnedTools,
        candidateTools,
        registeredTools,
        cachedTools,
    );

    return {
        normalized: agenticFallback.value,
        raw: agenticFallback.value?.description ?? '',
        traces,
    };
}

function resolveTaskContextHints(params: TaskContextReadParams): TaskContextHints {
    const candidates = [
        params.taskContext,
        params.pullRequestDescription,
        params.prBody,
        params.userQuestion,
        params.headRef,
    ]
        .filter((value): value is string => typeof value === 'string')
        .join('\n');

    const issueKeys = extractIssueKeys(candidates);
    const issueLinks = extractLinks(candidates);

    const urlHosts = new Set<string>();
    for (const link of issueLinks) {
        try {
            const parsed = new URL(link);
            if (parsed.hostname.trim().length > 0) {
                urlHosts.add(parsed.hostname.toLowerCase());
            }
        } catch {
            // Ignore malformed URLs extracted from free-form text.
        }
    }

    return {
        issueKeys,
        issueLinks,
        queryText: params.userQuestion ?? params.pullRequestDescription ?? '',
        urlHosts: [...urlHosts],
    };
}

function extractIssueKeys(text: string): string[] {
    const issueKeys = new Set<string>();
    for (const match of text.matchAll(ISSUE_KEY_REGEX)) {
        if (match[1]) {
            issueKeys.add(match[1].toUpperCase());
        }
    }

    return [...issueKeys];
}

function extractLinks(text: string): string[] {
    const links: string[] = [];
    for (const match of text.matchAll(URL_REGEX)) {
        if (match[0]) {
            links.push(match[0]);
        }
    }

    return uniqueNonEmpty(links);
}

function shouldUseAgenticTaskContextFallback(
    params: TaskContextReadParams,
    hasRegisteredTools: boolean,
): boolean {
    if (params.enableAgenticFallback === false) {
        return false;
    }

    return hasRegisteredTools;
}

function getRegisteredToolNames(toolCaller: ToolCaller): string[] {
    return toolCaller
        .getRegisteredTools()
        .map((tool) => tool.name ?? '')
        .filter((toolName) => toolName.trim().length > 0);
}

function getTaskContextToolSignatures(
    toolCaller: ToolCaller,
): Map<string, TaskContextToolSignature> {
    const signatures = new Map<string, TaskContextToolSignature>();
    const toolsForLLM = toolCaller.getToolsForLLM?.() ?? [];

    for (const tool of toolsForLLM) {
        const toolName =
            typeof tool?.name === 'string' && tool.name.trim().length > 0
                ? tool.name
                : undefined;
        if (!toolName) {
            continue;
        }

        const parameters = asRecord(tool.parameters);
        const requiredParams = Array.isArray(parameters.required)
            ? parameters.required.filter(
                  (item): item is string =>
                      typeof item === 'string' && item.trim().length > 0,
              )
            : [];
        const properties = asRecord(parameters.properties);
        const normalizedProperties = Object.entries(properties).reduce<
            Record<string, Record<string, unknown>>
        >((acc, [paramName, propertySchema]) => {
            acc[normalizeParamName(paramName)] = asRecord(propertySchema);
            return acc;
        }, {});

        signatures.set(toolName, {
            requiredParams,
            properties: Object.entries(properties).reduce<
                Record<string, Record<string, unknown>>
            >((acc, [paramName, propertySchema]) => {
                acc[paramName] = asRecord(propertySchema);
                return acc;
            }, {}),
            normalizedProperties,
        });
    }

    return signatures;
}

function getTaskContextCandidateTools(params: {
    registeredTools: string[];
    allowlist: string[];
    excludedTools: Array<string | undefined>;
    logger?: ReturnType<typeof createLogger>;
}): string[] {
    const allowlist = new Set(uniqueNonEmpty(params.allowlist));
    if (!allowlist.size) {
        return [];
    }

    const excluded = new Set(
        params.excludedTools.filter(
            (toolName): toolName is string =>
                typeof toolName === 'string' && toolName.trim().length > 0,
        ),
    );

    const candidates: string[] = [];
    for (const toolName of params.registeredTools) {
        if (!toolName.trim().length) {
            continue;
        }
        if (allowlist.size > 0 && !allowlist.has(toolName)) {
            params.logger?.debug({
                message: '[task.context.read] tool excluded: not in allowlist',
                context: 'TaskContextReadCapability',
                metadata: { toolName },
            });
            continue;
        }
        if (excluded.has(toolName)) {
            params.logger?.debug({
                message:
                    '[task.context.read] tool excluded: in explicit exclusion list',
                context: 'TaskContextReadCapability',
                metadata: { toolName },
            });
            continue;
        }
        candidates.push(toolName);
    }

    return candidates;
}

function buildTaskContextArgsCandidates(
    toolName: string,
    hints: TaskContextHints,
    signature?: TaskContextToolSignature,
): Record<string, unknown>[] {
    void toolName;
    const requiredParams = signature?.requiredParams ?? [];

    if (!requiredParams.length) {
        if (signature) {
            const supportsMaxResults = Boolean(
                signature.normalizedProperties.maxresults,
            );
            return [supportsMaxResults ? { maxResults: 1 } : {}];
        }
        return buildGenericTaskContextArgsCandidates(hints);
    }

    const valueByParam = new Map<string, string[]>();
    for (const requiredParam of requiredParams) {
        const candidates = getCandidateValuesForParam(
            requiredParam,
            hints,
            getParamSchema(signature, requiredParam),
        );
        if (!candidates.length) {
            return [];
        }
        valueByParam.set(requiredParam, candidates);
    }

    const combinations = combineRequiredParamValues(
        requiredParams,
        valueByParam,
        16,
    );
    if (!combinations.length) {
        return [];
    }

    const supportsMaxResults = Boolean(
        signature?.normalizedProperties?.maxresults,
    );

    return combinations.map((args) =>
        supportsMaxResults ? { ...args, maxResults: 1 } : args,
    );
}

function getCandidateValuesForParam(
    paramName: string,
    hints: TaskContextHints,
    paramSchema?: Record<string, unknown>,
): string[] {
    if (!supportsStringParam(paramSchema)) {
        return [];
    }

    const issueKeys = uniqueNonEmpty(hints.issueKeys).slice(0, 4);
    const issueLinks = uniqueNonEmpty(hints.issueLinks).slice(0, 4);
    const urlHosts = uniqueNonEmpty(hints.urlHosts).slice(0, 2);
    const queryTokens = uniqueNonEmpty([
        ...issueKeys,
        ...issueLinks,
        hints.queryText,
    ]).slice(0, 6);

    const intent = inferParamIntent(paramName, paramSchema);

    if (intent === 'issue') {
        return issueKeys.length ? issueKeys : queryTokens;
    }

    if (intent === 'query') {
        return queryTokens;
    }

    if (intent === 'context') {
        return urlHosts.length ? urlHosts : queryTokens;
    }

    if (intent === 'url') {
        return issueLinks.length ? issueLinks : queryTokens;
    }

    return queryTokens;
}

function getParamSchema(
    signature: TaskContextToolSignature | undefined,
    paramName: string,
): Record<string, unknown> | undefined {
    if (!signature) {
        return undefined;
    }

    const direct = signature.properties[paramName];
    if (direct) {
        return direct;
    }

    return signature.normalizedProperties[normalizeParamName(paramName)];
}

type ParamIntent = 'issue' | 'query' | 'context' | 'url' | 'generic';

function inferParamIntent(
    paramName: string,
    paramSchema: Record<string, unknown> | undefined,
): ParamIntent {
    const normalizedName = normalizeParamName(paramName);
    const descriptor = [
        paramName,
        readSchemaText(paramSchema, 'title'),
        readSchemaText(paramSchema, 'description'),
    ]
        .filter((value) => value.trim().length > 0)
        .join(' ')
        .toLowerCase();

    if (
        normalizedName.includes('cloud') ||
        normalizedName.includes('host') ||
        normalizedName.includes('domain') ||
        normalizedName.includes('site') ||
        normalizedName.includes('workspace')
    ) {
        return 'context';
    }

    if (
        descriptor.includes('issue') ||
        descriptor.includes('ticket') ||
        descriptor.includes('task') ||
        normalizedName.includes('issue') ||
        normalizedName.includes('ticket') ||
        normalizedName.includes('task') ||
        normalizedName.includes('key') ||
        normalizedName.endsWith('id')
    ) {
        return 'issue';
    }

    if (
        descriptor.includes('query') ||
        descriptor.includes('search') ||
        normalizedName.includes('query') ||
        normalizedName.includes('search') ||
        normalizedName === 'text' ||
        normalizedName === 'input'
    ) {
        return 'query';
    }

    if (
        descriptor.includes('url') ||
        descriptor.includes('link') ||
        descriptor.includes('resource') ||
        normalizedName.includes('url') ||
        normalizedName.includes('link')
    ) {
        return 'url';
    }

    return 'generic';
}

function readSchemaText(
    schema: Record<string, unknown> | undefined,
    key: 'title' | 'description',
): string {
    if (!schema) {
        return '';
    }
    const value = schema[key];
    return typeof value === 'string' ? value : '';
}

function supportsStringParam(
    schema: Record<string, unknown> | undefined,
): boolean {
    if (!schema || !Object.keys(schema).length) {
        return true;
    }

    const expectedTypes = extractSchemaTypes(schema);
    if (!expectedTypes.size) {
        return true;
    }

    return expectedTypes.has('string');
}

function extractSchemaTypes(schema: Record<string, unknown>): Set<string> {
    const types = new Set<string>();
    const normalized = asRecord(schema);
    const typeNode = normalized.type;

    if (typeof typeNode === 'string') {
        types.add(typeNode.toLowerCase());
    } else if (Array.isArray(typeNode)) {
        for (const value of typeNode) {
            if (typeof value === 'string') {
                types.add(value.toLowerCase());
            }
        }
    }

    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
        const variants = normalized[key];
        if (!Array.isArray(variants)) {
            continue;
        }

        for (const variant of variants) {
            if (!variant || typeof variant !== 'object') {
                continue;
            }
            for (const type of extractSchemaTypes(
                variant as Record<string, unknown>,
            )) {
                types.add(type);
            }
        }
    }

    if (!types.size && normalized.properties) {
        types.add('object');
    }

    return types;
}

function combineRequiredParamValues(
    requiredParams: string[],
    valueByParam: Map<string, string[]>,
    limit: number,
): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    const walk = (index: number, current: Record<string, unknown>) => {
        if (results.length >= limit) {
            return;
        }

        if (index >= requiredParams.length) {
            results.push({ ...current });
            return;
        }

        const param = requiredParams[index];
        const values = valueByParam.get(param) ?? [];
        for (const value of values) {
            current[param] = value;
            walk(index + 1, current);
            if (results.length >= limit) {
                return;
            }
        }
    };

    walk(0, {});
    return results;
}

function buildGenericTaskContextArgsCandidates(
    hints: TaskContextHints,
): Record<string, unknown>[] {
    const rawTokens = [...hints.issueLinks, ...hints.issueKeys, hints.queryText].filter(
        (value) => value.trim().length > 0,
    );

    const tokens = [...new Set(rawTokens)].slice(0, 4);
    const args: Record<string, unknown>[] = [];

    for (const token of tokens) {
        args.push(...buildArgsForToken(token));
    }

    const seen = new Set<string>();
    const deduped: Record<string, unknown>[] = [];
    for (const arg of args) {
        const key = JSON.stringify(arg);
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(arg);
        }
    }

    return deduped.slice(0, 16);
}

function applyTaskContextToolBoundary(params: {
    candidateTools: string[];
    seededTools: string[];
}): string[] {
    const seededSet = new Set(uniqueNonEmpty(params.seededTools));
    if (seededSet.size === 0) {
        return params.candidateTools;
    }

    return params.candidateTools.filter((toolName) => seededSet.has(toolName));
}

function resolveTaskContextDeterministicAllowlist(params: {
    seededTools: string[];
}): Set<string> {
    return new Set(uniqueNonEmpty(params.seededTools));
}

function resolveTaskContextProviders(params: {
    providerType: string;
    allProviderTypes?: string[];
}): string[] {
    const declaredProviders = uniqueNonEmpty(params.allProviderTypes ?? []);
    if (!declaredProviders.length) {
        return uniqueNonEmpty([params.providerType]);
    }

    return uniqueNonEmpty([params.providerType, ...declaredProviders]);
}

function buildArgsForToken(token: string): Record<string, unknown>[] {
    if (isLikelyUrl(token)) {
        return [
            { url: token },
            { resource: token },
            { link: token },
            { query: token },
            { input: token },
        ];
    }

    if (isLikelyIssueKey(token)) {
        return [
            { id: token },
            { key: token },
            { issueKey: token },
            { ticketId: token },
            { taskId: token },
            { query: token },
            { input: token },
        ];
    }

    return [
        { query: token },
        { text: token },
        { search: token },
        { input: token },
        { task: token },
        { issue: token },
    ];
}

async function executeAndTrace<T>(
    input: ExecuteAndTraceParams<T>,
): Promise<{ value: T; traces: CapabilityExecutionTrace[] }> {
    const startedAt = Date.now();
    const base = createBaseTrace(input.params, {
        capability: TASK_CONTEXT_CAPABILITY,
        mode: 'deterministic',
        provider: input.providerType,
        toolName: input.toolName,
    });

    let fallbackReason: DeterministicFallbackReason | undefined;
    let fallbackError: unknown;

    const value = await executeDeterministicTool({
        toolName: input.toolName,
        args: input.args,
        callTool: (toolName, args) => input.toolCaller.callTool(toolName, args),
        canExecute: () => input.canExecute,
        extract: (payload) => input.extract(payload),
        fallback: input.fallback,
        onError: 'fallback',
        onFallback: (reason, error) => {
            fallbackReason = reason;
            fallbackError = error;
        },
    });

    if (fallbackReason) {
        const trace: CapabilityExecutionTrace =
            fallbackReason === 'tool_unavailable' ||
            fallbackReason === 'precondition_failed'
                ? {
                      ...base,
                      status: 'skipped',
                      reason: fallbackReason,
                      latencyMs: Date.now() - startedAt,
                  }
                : {
                      ...base,
                      status: 'failed',
                      reason: fallbackReason,
                      latencyMs: Date.now() - startedAt,
                  };

        await input.hooks?.recordExecution?.(trace);

        if (fallbackReason === 'execution_error') {
            input.logger.warn({
                message: 'Capability execution failed',
                context: 'TaskContextReadCapability',
                metadata: {
                    capability: TASK_CONTEXT_CAPABILITY,
                    toolName: input.toolName,
                    errorMessage:
                        fallbackError instanceof Error
                            ? fallbackError.message
                            : String(fallbackError),
                },
            });
        }

        return { value: input.fallback, traces: [trace] };
    }

    const success = input.isSuccessful(value);
    const trace: CapabilityExecutionTrace = success
        ? {
              ...base,
              status: 'success',
              latencyMs: Date.now() - startedAt,
          }
        : {
              ...base,
              status: 'failed',
              reason: 'empty_result',
              latencyMs: Date.now() - startedAt,
          };

    await input.hooks?.recordExecution?.(trace);

    return {
        value: success ? value : input.fallback,
        traces: [trace],
    };
}

async function fetchTaskContextWithAgentFallback(
    input: AgentFallbackParams,
): Promise<
    {
        value: TaskContextNormalized | undefined;
        traces: CapabilityExecutionTrace[];
    } & {
        learnedTools: string[];
    }
> {
    const startedAt = Date.now();
    const base = createBaseTrace(input.params, {
        capability: TASK_CONTEXT_CAPABILITY,
        mode: 'agentic',
        provider: input.providerType,
    });

    if (!input.toolCaller.callAgent) {
        const unavailable: CapabilityExecutionTrace = {
            ...base,
            status: 'skipped',
            reason: 'agentic_unavailable',
            latencyMs: Date.now() - startedAt,
        };
        await input.hooks?.recordExecution?.(unavailable);

        return {
            value: undefined,
            traces: [unavailable],
            learnedTools: [],
        };
    }

    const hints = resolveTaskContextHints(input.params);
    const userLanguage =
        typeof input.params.userLanguage === 'string' &&
        input.params.userLanguage.trim().length > 0
            ? input.params.userLanguage.trim()
            : 'en-US';

    const prompt = `Resolve task context using available MCP tools.

AVAILABLE_TOOLS: ${input.candidateTools.join(', ') || '(none)'}
USER_QUESTION: ${input.params.userQuestion ?? ''}
PULL_REQUEST_DESCRIPTION:
${input.params.pullRequestDescription ?? ''}
KNOWN_TOKENS: ${[...hints.issueKeys, ...hints.issueLinks].join(', ') || '(none)'}
USER_LANGUAGE: ${userLanguage}

Return ONLY JSON:
{
  "taskContext": "string",
  "title": "optional",
  "id": "optional",
  "toolsUsed": ["toolName"]
}`;

    try {
        const response = await input.toolCaller.callAgent(
            `kodus-${input.params.skillName}-fetcher`,
            prompt,
            {
                thread: input.params.thread as any,
                userContext: {
                    organizationAndTeamData: {
                        organizationId: input.params.organizationId,
                        teamId: input.params.teamId,
                    },
                },
            },
        );

        const parsed = parseAgentTaskContextResult(response.result);
        const normalized = normalizeTaskPayload({
            taskContext: parsed.taskContext,
            id: parsed.id,
            title: parsed.title,
            sourceProvider: input.providerType,
        });

        const traces: CapabilityExecutionTrace[] = [];
        for (const toolName of parsed.toolsUsed.length
            ? parsed.toolsUsed
            : [undefined]) {
            const trace: CapabilityExecutionTrace = normalized
                ? {
                      ...base,
                      toolName,
                      status: 'success',
                      latencyMs: Date.now() - startedAt,
                  }
                : {
                      ...base,
                      toolName,
                      status: 'failed',
                      reason: 'agentic_empty_result',
                      latencyMs: Date.now() - startedAt,
                  };

            traces.push(trace);
            await input.hooks?.recordExecution?.(trace);
        }

        return {
            value: normalized,
            traces,
            learnedTools: parsed.toolsUsed,
        };
    } catch (error) {
        input.logger.warn({
            message: 'Agentic fallback failed',
            context: 'TaskContextReadCapability',
            metadata: {
                errorMessage: error instanceof Error ? error.message : String(error),
            },
        });

        const failed: CapabilityExecutionTrace = {
            ...base,
            status: 'failed',
            reason: 'agentic_execution_error',
            latencyMs: Date.now() - startedAt,
        };
        await input.hooks?.recordExecution?.(failed);

        return {
            value: undefined,
            traces: [failed],
            learnedTools: [],
        };
    }
}

function parseAgentTaskContextResult(value: unknown): {
    taskContext: string;
    title?: string;
    id?: string;
    toolsUsed: string[];
} {
    const parsed = asRecord(
        typeof value === 'string' ? safeJsonParse(value, {}) : value,
    );

    return {
        taskContext:
            typeof parsed.taskContext === 'string' ? parsed.taskContext : '',
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        id: typeof parsed.id === 'string' ? parsed.id : undefined,
        toolsUsed: Array.isArray(parsed.toolsUsed)
            ? parsed.toolsUsed.filter(
                  (item): item is string =>
                      typeof item === 'string' && item.trim().length > 0,
              )
            : [],
    };
}

function normalizeTaskPayload(value: {
    taskContext: string;
    id?: string;
    title?: string;
    sourceProvider: string;
}): TaskContextNormalized | undefined {
    if (value.taskContext.trim().length === 0) {
        return undefined;
    }

    return {
        id: value.id,
        title: value.title,
        description: value.taskContext,
        sourceProvider: value.sourceProvider,
    };
}

function orderCandidateTools(params: {
    candidateTools: string[];
    preferredTool?: string;
    cachedTools: string[];
    seededTools: string[];
    includeExploration: boolean;
}): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];

    const pushIfCandidate = (tool: string | undefined) => {
        if (!tool) {
            return;
        }
        if (!params.candidateTools.includes(tool)) {
            return;
        }
        if (seen.has(tool)) {
            return;
        }
        seen.add(tool);
        ordered.push(tool);
    };

    pushIfCandidate(params.preferredTool);
    params.cachedTools.forEach(pushIfCandidate);
    params.seededTools.forEach(pushIfCandidate);
    if (params.includeExploration) {
        params.candidateTools.forEach(pushIfCandidate);
    }

    return ordered;
}

async function maybePersistLearnedTools(
    hooks: TaskContextReadHooks | undefined,
    scope: CapabilityStrategyScope,
    learnedTools: string[],
    candidateTools: string[],
    registeredTools: string[],
    cachedTools: string[],
): Promise<void> {
    if (!hooks?.saveCachedTaskContextTools) {
        return;
    }

    const deterministicBoundary = new Set(candidateTools);
    const registeredBoundary = new Set(registeredTools);
    const filteredLearned = learnedTools.filter((toolName) => {
        if (!registeredBoundary.has(toolName)) {
            return false;
        }

        if (!deterministicBoundary.size) {
            return true;
        }

        return deterministicBoundary.has(toolName);
    });

    if (!filteredLearned.length) {
        return;
    }

    const merged = [...new Set([...filteredLearned, ...cachedTools])];
    await hooks.saveCachedTaskContextTools(scope, merged);
}

function buildScope(
    params: TaskContextReadParams,
    provider: string,
): CapabilityStrategyScope {
    return {
        organizationId: params.organizationId,
        teamId: params.teamId,
        skillName: params.skillName,
        capability: TASK_CONTEXT_CAPABILITY,
        provider,
    };
}

function createBaseTrace(
    params: TaskContextReadParams,
    input: {
        capability: string;
        mode: 'deterministic' | 'agentic';
        provider: string;
        toolName?: string;
    },
): Omit<CapabilityExecutionTrace, 'status' | 'latencyMs' | 'reason'> {
    return {
        organizationId: params.organizationId,
        teamId: params.teamId,
        skillName: params.skillName,
        capability: input.capability,
        provider: input.provider,
        mode: input.mode,
        toolName: input.toolName,
        occurredAt: new Date().toISOString(),
    };
}

function extractTaskContextFromToolResult(
    payload: unknown,
): TaskContextNormalized | undefined {
    const issue = extractIssuePayload(payload);
    const fields = asRecord(issue.fields);
    const key = firstNonEmptyString([
        issue.key,
        issue.issueKey,
        issue.taskKey,
        issue.ticketKey,
        issue.id,
        issue.taskId,
        issue.issueId,
        fields.key,
        fields.id,
    ]);
    const summary = firstNonEmptyString([
        fields.summary,
        fields.title,
        fields.name,
        issue.summary,
        issue.title,
        issue.name,
    ]);
    const description = firstNonEmptyValue([
        fields.description,
        fields.body,
        fields.content,
        fields.text,
        issue.description,
        issue.body,
        issue.content,
        issue.text,
    ]);

    const acceptanceCriteria = extractStringArray(
        fields.acceptanceCriteria ??
            fields.acceptance_criteria ??
            fields.criteria ??
            issue.acceptanceCriteria ??
            issue.acceptance_criteria ??
            issue.criteria,
    );
    const links = uniqueNonEmpty([
        ...(extractStringArray(issue.links) ?? []),
        ...(extractStringArray(fields.links) ?? []),
        ...(extractStringArray(issue.references) ?? []),
        ...(extractStringArray(fields.references) ?? []),
        ...(extractStringArray(issue.urls) ?? []),
        ...(extractStringArray(fields.urls) ?? []),
        ...[
            firstNonEmptyString([
                issue.url,
                issue.webUrl,
                issue.htmlUrl,
                issue.permalink,
                fields.url,
                fields.webUrl,
                fields.htmlUrl,
                fields.permalink,
            ]),
        ].filter((value): value is string => typeof value === 'string'),
    ]);

    const normalized: TaskContextNormalized = {
        id: key,
        title: summary,
        description: safeStringify(description),
        acceptanceCriteria,
        links: links.length ? links : undefined,
    };

    const hasCoreContent =
        Boolean(normalized.title?.trim()) ||
        Boolean(normalized.description?.trim());
    return hasCoreContent ? normalized : undefined;
}

function extractIssuePayload(payload: unknown): Record<string, unknown> {
    const root = asRecord(payload);
    const nestedResult = asRecord(root.result);
    const rootData = asRecord(root.data);
    const nestedData = asRecord(nestedResult.data);

    if (Object.keys(rootData).length > 0) {
        return rootData;
    }
    if (Object.keys(nestedData).length > 0) {
        return nestedData;
    }

    return root;
}

function extractStringArray(value: unknown): string[] | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
        return [value];
    }

    if (!Array.isArray(value)) {
        const record = asRecord(value);
        const nestedValue = firstNonEmptyString([
            record.text,
            record.content,
            record.value,
            record.name,
            record.title,
            record.url,
            record.webUrl,
            record.htmlUrl,
            record.permalink,
        ]);
        return nestedValue ? [nestedValue] : undefined;
    }

    const values = value
        .map((item) => {
            if (typeof item === 'string' && item.trim().length > 0) {
                return item;
            }

            const record = asRecord(item);
            return firstNonEmptyString([
                record.text,
                record.content,
                record.value,
                record.name,
                record.title,
                record.url,
                record.webUrl,
                record.htmlUrl,
                record.permalink,
            ]);
        })
        .filter((item): item is string => typeof item === 'string');

    return values.length ? values : undefined;
}

function firstNonEmptyString(values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }
    return undefined;
}

function firstNonEmptyValue(values: unknown[]): unknown {
    for (const value of values) {
        if (typeof value === 'string') {
            if (value.trim().length > 0) {
                return value;
            }
            continue;
        }

        if (value !== undefined && value !== null) {
            return value;
        }
    }

    return undefined;
}

function normalizeParamName(value: string): string {
    return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function uniqueNonEmpty(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function isLikelyIssueKey(value: string): boolean {
    return /^[A-Z][A-Z0-9]+-\d+$/.test(value);
}

function isLikelyUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}
