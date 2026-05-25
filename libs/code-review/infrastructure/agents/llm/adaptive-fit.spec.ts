import {
    resolveAdaptiveProfile,
    type AdaptiveProfile,
    type AdaptiveProfileKind,
} from './adaptive-fit';

describe('resolveAdaptiveProfile', () => {
    const expectFlags = (
        profile: AdaptiveProfile,
        overrides: Partial<AdaptiveProfile>,
    ) => {
        const fullDefaults: AdaptiveProfile = {
            kind: 'full',
            contextWindowTokens: 1,
            compactPrompt: false,
            dropCallGraph: false,
            allOptional: false,
            maxDiffChars: undefined,
            skipHeavyPasses: false,
            lowSignalFilterUnconditional: false,
        };
        expect(profile).toEqual({ ...fullDefaults, ...overrides });
    };

    describe('threshold mapping (each band picks the lowest-cost profile)', () => {
        it.each<[number, AdaptiveProfileKind]>([
            [1_048_576, 'full'],
            [200_000, 'full'],
            [128_000, 'full'],
            [64_000, 'full'],
            [63_999, 'light'],
            [32_000, 'light'],
            [31_999, 'compact'],
            [16_000, 'compact'],
            [15_999, 'minimal'],
            [8_000, 'minimal'],
            [7_999, 'unviable'],
            [4_096, 'unviable'],
        ])('window=%i → profile=%s', (contextWindowTokens, expectedKind) => {
            const profile = resolveAdaptiveProfile(contextWindowTokens);
            expect(profile.kind).toBe(expectedKind);
            expect(profile.contextWindowTokens).toBe(contextWindowTokens);
        });
    });

    describe('PR1 contract: every profile returns full-fidelity flags (no behavior change yet)', () => {
        it.each([1_048_576, 200_000, 64_000, 32_000, 16_000, 12_288, 8_000])(
            'window=%i → all adaptive flags off',
            (contextWindowTokens) => {
                const profile = resolveAdaptiveProfile(contextWindowTokens);
                expectFlags(profile, {
                    kind: profile.kind,
                    contextWindowTokens,
                });
            },
        );
    });

    describe('input sanitization', () => {
        it('treats 0 as unviable (model effectively has no window)', () => {
            expect(resolveAdaptiveProfile(0).kind).toBe('unviable');
        });

        it('treats negative as unviable (caller misconfigured BYOK)', () => {
            expect(resolveAdaptiveProfile(-1).kind).toBe('unviable');
        });

        it('handles NaN/undefined by defaulting to full (caller bypassed window resolution)', () => {
            expect(resolveAdaptiveProfile(NaN).kind).toBe('full');
            expect(
                resolveAdaptiveProfile(undefined as unknown as number).kind,
            ).toBe('full');
        });
    });
});
