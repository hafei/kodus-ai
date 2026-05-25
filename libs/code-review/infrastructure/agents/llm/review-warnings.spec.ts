import {
    dedupReviewWarnings,
    renderFidelityWarningsNotice,
    type ReviewWarning,
} from './review-warnings';

const w = (
    kind: ReviewWarning['kind'],
    overrides: Partial<ReviewWarning> = {},
): ReviewWarning => ({
    kind,
    reason: 'small_context_window',
    contextWindowTokens: 16_000,
    modelName: 'llama',
    ...overrides,
});

describe('dedupReviewWarnings', () => {
    it('returns empty array unchanged', () => {
        expect(dedupReviewWarnings([])).toEqual([]);
    });

    it('folds identical (kind, modelName, contextWindowTokens) into one entry', () => {
        const out = dedupReviewWarnings([
            w('PROMPT_COMPACTED'),
            w('PROMPT_COMPACTED'),
            w('PROMPT_COMPACTED'),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].kind).toBe('PROMPT_COMPACTED');
    });

    it('keeps separate entries when modelName differs (multi-agent runs with different BYOK roles)', () => {
        const out = dedupReviewWarnings([
            w('PROMPT_COMPACTED', { modelName: 'llama-a' }),
            w('PROMPT_COMPACTED', { modelName: 'llama-b' }),
        ]);
        expect(out).toHaveLength(2);
    });

    it('preserves order of first occurrence', () => {
        const out = dedupReviewWarnings([
            w('HEAVY_PASSES_SKIPPED'),
            w('PROMPT_COMPACTED'),
            w('HEAVY_PASSES_SKIPPED'),
        ]);
        expect(out.map((x) => x.kind)).toEqual([
            'HEAVY_PASSES_SKIPPED',
            'PROMPT_COMPACTED',
        ]);
    });

    it('merges `detail` strings when folding — distinct details preserved, comma-joined', () => {
        const out = dedupReviewWarnings([
            w('LOW_SIGNAL_FILES_DROPPED', {
                detail: 'foo.test.ts',
                agentName: 'bug',
            }),
            w('LOW_SIGNAL_FILES_DROPPED', {
                detail: 'bar.test.ts',
                agentName: 'security',
            }),
            w('LOW_SIGNAL_FILES_DROPPED', {
                detail: 'foo.test.ts',
                agentName: 'performance',
            }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].detail).toBe('foo.test.ts, bar.test.ts');
    });

    it('drops agentName on merged entries (cross-agent warning is not agent-specific)', () => {
        const out = dedupReviewWarnings([
            w('PROMPT_COMPACTED', { agentName: 'bug' }),
            w('PROMPT_COMPACTED', { agentName: 'security' }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].agentName).toBeUndefined();
    });
});

describe('renderFidelityWarningsNotice', () => {
    it('returns undefined when warnings array is empty (PR1 default)', () => {
        expect(renderFidelityWarningsNotice([])).toBeUndefined();
    });

    it('returns undefined when warnings is undefined (caller passed nothing)', () => {
        expect(renderFidelityWarningsNotice(undefined)).toBeUndefined();
    });

    it('renders a collapsible <details> block with one bullet per warning', () => {
        const out = renderFidelityWarningsNotice([
            w('PROMPT_COMPACTED'),
            w('CALLGRAPH_DROPPED'),
        ]);
        expect(out).toContain('<details>');
        expect(out).toContain('</details>');
        expect(out).toContain('Review fidelity reduced');
        expect(out).toContain('System prompt was compacted');
        expect(out).toContain('Pre-computed call graph was omitted');
    });

    it('includes modelName and contextWindowTokens in the footer for actionability', () => {
        const out = renderFidelityWarningsNotice([
            w('PROMPT_COMPACTED', {
                modelName: 'meta-llama/Llama-3.3-70B',
                contextWindowTokens: 16_000,
            }),
        ]);
        expect(out).toContain('meta-llama/Llama-3.3-70B');
        expect(out).toContain('16,000');
    });

    it('appends `detail` text in parens when present', () => {
        const out = renderFidelityWarningsNotice([
            w('LOW_SIGNAL_FILES_DROPPED', {
                detail: '3 files dropped: foo.test.ts, bar.test.ts',
            }),
        ]);
        expect(out).toContain('(3 files dropped: foo.test.ts, bar.test.ts)');
    });

    it('starts with a horizontal rule so it visually separates from the main summary', () => {
        const out = renderFidelityWarningsNotice([w('PROMPT_COMPACTED')]);
        expect(out?.split('\n').slice(0, 3).join('\n')).toContain('---');
    });
});
