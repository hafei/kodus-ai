import type { LicenseMode, RunContext, Scenario } from "../lib/types.js";

// Fixture branch pair per provider. Each pair is a persistent head/base
// pre-committed in the test repo with a small but realistic diff. The
// scenario opens an ephemeral PR per run between them so each run gets a
// fresh PR number — the `validate-new-commits` pipeline stage would
// otherwise short-circuit re-runs against a standing PR as "already
// reviewed the latest changes".
//
// We deliberately use a different pair from `code-review-basic.ts` and
// `kody-rules.ts` so the three scenarios can run in parallel without
// GitHub rejecting "second open PR for the same head→base".
const FIXTURE_BRANCHES: Record<
    string,
    { head: string; base: string } | undefined
> = {
    github: {
        // 4 files / 28 lines — small enough to review in well under the
        // 600s poll window for `paid` cases, but large enough to be a
        // realistic diff for the pipeline to chew on.
        head: "buffer-trace-processing-after",
        base: "buffer-trace-processing-before",
    },
};

export const licenseAttribution: Scenario = {
    id: "license-attribution",
    title:
        "Entitlement gate honors the active license/plan: paid reviews; free does not",
    priority: "P0",
    appliesTo: {
        target: ["cloud", "self-hosted"],
        provider: ["github"],
        license: ["free", "trial", "paid", "license-paid", "license-free"],
    },
    timeoutSec: 900,
    async run(ctx: RunContext) {
        ctx.assert(ctx.tenant, "scenario requires a tenant");

        const fixture = FIXTURE_BRANCHES[ctx.provider.name];
        ctx.assert(
            fixture,
            `No fixture branch pair configured for provider ${ctx.provider.name} in license-attribution.ts`,
        );
        if (!ctx.provider.openPRFromBranches) {
            throw new Error(
                `Provider ${ctx.provider.name} does not implement openPRFromBranches yet`,
            );
        }

        const session = await ctx.kodus.login(ctx.tenant!);
        await ctx.kodus.registerIntegration(session);
        const repo = await ctx.kodus.registerRepo(session);
        await ctx.kodus.finishOnboarding(session, repo);

        const noReviewLicenses: LicenseMode[] = ["free", "license-free"];
        const expectReview = !noReviewLicenses.includes(ctx.license);

        const sinceIso = new Date().toISOString();
        const pr = await ctx.provider.openPRFromBranches({
            head: fixture!.head,
            base: fixture!.base,
            title: `[e2e] license-attribution ${ctx.license} ${ctx.runId.slice(0, 8)}`,
            body: `Automated PR opened by Kodus E2E run ${ctx.runId} to validate the license=${ctx.license} entitlement gate. Auto-closed by the scenario; branches are persistent fixtures and are not deleted.`,
        });

        try {
            // `paid` paths get the full 600s poll budget — fresh tenant +
            // sentry-sized repo review takes a few minutes on Kimi K2.6.
            // `free` paths only need to confirm NO review activity within
            // a short window — anything longer just delays the false-positive
            // case where the gate fails open and Kody starts to review.
            const pollWindow = expectReview ? 600 : 90;
            const review = await ctx.provider.pollForReview(
                { number: pr.number },
                { sinceIso, timeoutSec: pollWindow },
            );

            // Trust per-provider filter (excludes Kody's status placeholder
            // by `<!-- kody-codereview -->` marker, keeps `kody-codereview-
            // completed` notifications and real findings).
            const sawReview =
                review.reviewComments +
                    review.issueComments +
                    review.reviews >
                0;

            if (expectReview) {
                ctx.assert(
                    sawReview,
                    `Expected review for license=${ctx.license} but none arrived within ${pollWindow}s`,
                );
            } else {
                ctx.assert(
                    !sawReview,
                    `Expected NO review for license=${ctx.license} but found activity: ${JSON.stringify(review)}`,
                );
            }

            return {
                license: ctx.license,
                expectReview,
                actuallySawReview: sawReview,
                review,
                prNumber: pr.number,
                prUrl: pr.url,
                fixture,
                sinceIso,
            };
        } finally {
            try {
                await ctx.provider.closePR(pr);
            } catch (err) {
                // best-effort cleanup — leaving the PR open is recoverable
            }
        }
    },
};

export default licenseAttribution;
