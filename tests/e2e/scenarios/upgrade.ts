import type { RunContext, Scenario } from "../lib/types.js";

export const upgradeNMinusOneToN: Scenario = {
    id: "upgrade-n-1-to-n",
    title:
        "Self-hosted stack upgraded from N-1 to N preserves state and still reviews PRs",
    priority: "P0",
    appliesTo: {
        target: ["self-hosted"],
        provider: ["github"],
        license: ["license-paid"],
    },
    timeoutSec: 1800,
    async run(ctx: RunContext) {
        ctx.assert(
            process.env.UPGRADE_PRE_VALIDATED === "1",
            "upgrade-n-1-to-n must be invoked by the upgrade provisioning script. It validates that the stack provisioned at tag N-1 was already exercised before the upgrade ran.",
        );

        ctx.assert(ctx.tenant, "scenario requires a tenant");

        const session = await ctx.kodus.login(ctx.tenant!);

        const { triggerId, sinceIso } = await ctx.provider.triggerReviewOnExistingPR(0);
        const prNumber = Number(process.env.GH_TEST_PR_NUMBER ?? "0");
        ctx.assert(prNumber > 0, "GH_TEST_PR_NUMBER is required");

        const review = await ctx.provider.pollForReview(
            { number: prNumber },
            { sinceIso, triggerId, timeoutSec: 600 },
        );

        ctx.assert(
            review.reviewComments + review.issueComments + review.reviews > 0,
            "Post-upgrade review did not arrive — upgrade broke the review pipeline",
        );

        return {
            preUpgradeTag: process.env.UPGRADE_FROM_TAG ?? "unknown",
            postUpgradeTag: process.env.UPGRADE_TO_TAG ?? "unknown",
            tenant: ctx.tenant?.email,
            review,
            triggerId,
            sinceIso,
            note: "Login on the upgraded stack succeeded, meaning the tenant created at N-1 survived migrations.",
            sessionOrg: session.organizationId,
        };
    },
};

export default upgradeNMinusOneToN;
