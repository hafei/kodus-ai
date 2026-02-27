import {
    executeDeterministicTool,
    DeterministicFallbackReason,
} from '../runtime/deterministic-tool-executor';
import {
    CapabilityExecutionTrace,
    ToolCaller,
} from '../runtime/skill-runtime.types';
import { asRecord } from '../runtime/value-utils';

const PR_DIFF_CAPABILITY = 'pr.diff.read';

export interface PrDiffReadParams {
    organizationId: string;
    teamId: string;
    repositoryId: string;
    repositoryName?: string;
    pullRequestNumber: number;
}

export interface PrDiffReadResult {
    diff: string;
    traces: CapabilityExecutionTrace[];
}

interface CapabilityExecutionContext {
    skillName: string;
    organizationId: string;
    teamId: string;
    provider?: string;
}

export async function fetchPullRequestDiff(
    toolCaller: ToolCaller,
    toolName: string | undefined,
    params: PrDiffReadParams | undefined,
    ctx: CapabilityExecutionContext,
): Promise<PrDiffReadResult> {
    const startedAt = Date.now();
    const base = createBaseTrace(ctx, toolName);
    let fallbackReason: DeterministicFallbackReason | undefined;

    const diff = await executeDeterministicTool({
        toolName,
        args: params
            ? {
                  organizationId: params.organizationId,
                  teamId: params.teamId,
                  repositoryId: params.repositoryId,
                  repositoryName: params.repositoryName,
                  prNumber: params.pullRequestNumber,
              }
            : {},
        callTool: (selectedTool, args) => toolCaller.callTool(selectedTool, args),
        canExecute: () => Boolean(params),
        extract: extractDiffFromToolResult,
        fallback: '',
        onError: 'fallback',
        onFallback: (reason) => {
            fallbackReason = reason;
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

        return { diff: '', traces: [trace] };
    }

    const success = typeof diff === 'string' && diff.length > 0;
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

    return {
        diff: success ? diff : '',
        traces: [trace],
    };
}

function createBaseTrace(
    ctx: CapabilityExecutionContext,
    toolName: string | undefined,
): Omit<CapabilityExecutionTrace, 'status' | 'latencyMs' | 'reason'> {
    return {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        skillName: ctx.skillName,
        capability: PR_DIFF_CAPABILITY,
        provider: ctx.provider ?? 'external',
        mode: 'deterministic',
        toolName,
        occurredAt: new Date().toISOString(),
    };
}

function extractDiffFromToolResult(payload: unknown): string {
    const root = asRecord(payload);
    const nestedResult = asRecord(root.result);

    const directData = root.data;
    if (typeof directData === 'string') {
        return directData;
    }

    const nestedData = nestedResult.data;
    if (typeof nestedData === 'string') {
        return nestedData;
    }

    return '';
}
