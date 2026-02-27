export interface DeterministicToolCallResponse {
    result?: unknown;
}

export type DeterministicFallbackReason =
    | 'tool_unavailable'
    | 'precondition_failed'
    | 'missing_result'
    | 'execution_error';

export interface ExecuteDeterministicToolParams<TOutput> {
    toolName: string | undefined;
    args: Record<string, unknown>;
    callTool: (
        toolName: string,
        args: Record<string, unknown>,
    ) => Promise<DeterministicToolCallResponse>;
    extract: (payload: unknown) => TOutput;
    fallback: TOutput;
    canExecute?: () => boolean;
    onError?: 'throw' | 'fallback';
    onFallback?: (reason: DeterministicFallbackReason, error?: unknown) => void;
}

/**
 * Shared deterministic MCP tool execution helper.
 * Returns fallback when tool is unavailable or preconditions fail.
 */
export async function executeDeterministicTool<TOutput>(
    params: ExecuteDeterministicToolParams<TOutput>,
): Promise<TOutput> {
    if (!params.toolName?.trim()) {
        params.onFallback?.('tool_unavailable');
        return params.fallback;
    }

    if (params.canExecute && !params.canExecute()) {
        params.onFallback?.('precondition_failed');
        return params.fallback;
    }

    try {
        const toolResult = await params.callTool(params.toolName, params.args);
        if (toolResult.result === undefined) {
            params.onFallback?.('missing_result');
            return params.fallback;
        }
        return params.extract(toolResult.result);
    } catch (error) {
        if (params.onError === 'fallback') {
            params.onFallback?.('execution_error', error);
            return params.fallback;
        }
        throw error;
    }
}
