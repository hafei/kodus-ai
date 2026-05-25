/**
 * Structured warnings emitted when the pipeline drops review fidelity to
 * fit a small model context window. Surfaced to the user as a collapsible
 * notice in the end-review PR comment; also captured in telemetry so we
 * can roll up "how often does each kind fire" per provider.
 *
 * PR1 ships the types + dedup helper but does NOT emit warnings anywhere
 * yet — `resolveAdaptiveProfile` still returns full-fidelity flags so no
 * strategy fires. PR2/PR3 wire emission per strategy.
 */

export type ReviewWarningKind =
    /** Compact system prompt was used (workflow/rules trimmed). */
    | 'PROMPT_COMPACTED'
    /** Pre-computed call graph was omitted from the user prompt. */
    | 'CALLGRAPH_DROPPED'
    /** All file diffs rendered as hunk headers only. */
    | 'HUNK_HEADERS_ONLY'
    /** At least one file's diff was truncated to the max-chars cap. */
    | 'DIFF_TRUNCATED'
    /** Low-signal files (tests/md/css) dropped even in deep mode. */
    | 'LOW_SIGNAL_FILES_DROPPED'
    /** Verifier / second-chance / rescue passes skipped. */
    | 'HEAVY_PASSES_SKIPPED';

export type ReviewWarningReason = 'small_context_window';

export interface ReviewWarning {
    kind: ReviewWarningKind;
    reason: ReviewWarningReason;
    contextWindowTokens: number;
    modelName: string;
    /** Optional free-form context (e.g. "3 files dropped: foo.test.ts, ..."). */
    detail?: string;
    /** Agent that emitted the warning. Cleared on dedup when multiple agents
     *  emit the same warning, since the underlying cause is pipeline-wide. */
    agentName?: string;
}

/**
 * Fold duplicate warnings across the per-agent fan-out. Without this the
 * end-review comment would render the same `PROMPT_COMPACTED` notice 4
 * times (bug + security + performance + kody-rules).
 *
 * Dedup key: (kind, modelName, contextWindowTokens). Within a group,
 * `detail` strings are deduped and comma-joined, and `agentName` is
 * cleared because the warning is no longer agent-specific.
 *
 * Order is preserved by first occurrence so the user sees them in the
 * order strategies fired.
 */
export function dedupReviewWarnings(
    warnings: ReviewWarning[],
): ReviewWarning[] {
    if (warnings.length === 0) return [];

    const byKey = new Map<string, ReviewWarning>();
    const detailsByKey = new Map<string, string[]>();

    for (const w of warnings) {
        const key = `${w.kind}::${w.modelName}::${w.contextWindowTokens}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...w });
            if (w.detail) detailsByKey.set(key, [w.detail]);
            continue;
        }
        // Merging a second occurrence: warning is no longer agent-specific.
        existing.agentName = undefined;
        if (w.detail) {
            const seen = detailsByKey.get(key) ?? [];
            if (!seen.includes(w.detail)) {
                seen.push(w.detail);
                detailsByKey.set(key, seen);
            }
        }
    }

    // Stitch comma-joined details back onto the surviving entries.
    for (const [key, entry] of byKey) {
        const details = detailsByKey.get(key);
        if (details && details.length > 0) {
            entry.detail = details.join(', ');
        }
    }

    return Array.from(byKey.values());
}

/**
 * Human-readable line for each warning kind. Used by the renderer to
 * tell the user *what* fidelity step kicked in. English-only in PR1;
 * once strategies are emitting these, callers can plumb a translation
 * lookup through the existing TranslationsCategory infra.
 */
const WARNING_KIND_LABEL: Record<ReviewWarning['kind'], string> = {
    PROMPT_COMPACTED:
        'System prompt was compacted (workflow + most rules trimmed).',
    CALLGRAPH_DROPPED:
        'Pre-computed call graph was omitted from the prompt.',
    HUNK_HEADERS_ONLY:
        'File diffs were sent as hunk headers only; the agent had to read each file on demand.',
    DIFF_TRUNCATED:
        'Long file diffs were truncated to fit the context window.',
    LOW_SIGNAL_FILES_DROPPED:
        'Low-signal files (tests, docs, styles) were dropped from review.',
    HEAVY_PASSES_SKIPPED:
        'Verifier / second-chance / rescue passes were skipped.',
};

/**
 * Build the Markdown notice appended to the end-review PR comment when
 * adaptive-fit dropped review fidelity. Returns `undefined` when the
 * warning list is absent or empty so callers can `if (notice) append`.
 *
 * Pure function — keeps the renderer testable without spinning up the
 * comment-manager service.
 *
 * Output shape (collapsible so it doesn't bury the main summary):
 *
 *   ---
 *   <details>
 *   <summary>⚠ Review fidelity reduced — model context window too small</summary>
 *
 *   - System prompt was compacted (...).
 *   - Pre-computed call graph was omitted from the prompt.
 *
 *   Model: `llama` · Context window: 16,000 tokens.
 *   Consider switching to a model with at least 32K context for full-fidelity reviews.
 *   </details>
 */
export function renderFidelityWarningsNotice(
    warnings: ReviewWarning[] | undefined,
): string | undefined {
    if (!warnings || warnings.length === 0) return undefined;

    const bullets = warnings
        .map((w) => {
            const label = WARNING_KIND_LABEL[w.kind] ?? w.kind;
            return w.detail ? `- ${label} (${w.detail})` : `- ${label}`;
        })
        .join('\n');

    // All warnings share the same reason (small_context_window) today;
    // pull modelName + contextWindowTokens off the first for the footer.
    // If they differ across entries (multi-model orgs) we still surface
    // the first since the rest of the list explains the rest.
    const head = warnings[0];
    const formattedWindow = head.contextWindowTokens.toLocaleString('en-US');

    return [
        '',
        '---',
        '<details>',
        '<summary>⚠ Review fidelity reduced — model context window too small</summary>',
        '',
        bullets,
        '',
        `Model: \`${head.modelName}\` · Context window: ${formattedWindow} tokens.`,
        `Consider switching to a model with at least 32,000 tokens of context for full-fidelity reviews.`,
        '</details>',
        '',
    ].join('\n');
}
