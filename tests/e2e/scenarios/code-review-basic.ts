import type { RunContext, Scenario } from "../lib/types.js";

export const codeReviewBasic: Scenario = {
    id: "code-review-basic",
    title: "Kody reviews a PR opened on the configured fixture repo",
    priority: "P0",
    appliesTo: {
        target: ["cloud", "self-hosted"],
        provider: ["github", "gitlab", "bitbucket", "azure-devops"],
        license: ["paid", "trial", "license-paid"],
    },
    timeoutSec: 900,
    async run(ctx: RunContext) {
        ctx.assert(ctx.tenant, "scenario requires a tenant (set CLOUD_TENANT_*_EMAIL or SH_TENANT_EMAIL)");

        const session = await ctx.kodus.login(ctx.tenant!);
        await ctx.kodus.registerIntegration(session);
        const repo = await ctx.kodus.registerRepo(session);
        await ctx.kodus.finishOnboarding(session, repo);

        const { triggerId, sinceIso } = await ctx.provider.triggerReviewOnExistingPR(0);

        const prNumberRaw =
            process.env[`${envKey(ctx.provider.name)}_TEST_PR_NUMBER`] ??
            process.env[`${envKey(ctx.provider.name)}_TEST_MR_IID`] ??
            process.env[`${envKey(ctx.provider.name)}_TEST_PR_ID`];
        const prNumber = Number(prNumberRaw);
        ctx.assert(
            !Number.isNaN(prNumber) && prNumber > 0,
            `Set ${envKey(ctx.provider.name)}_TEST_PR_NUMBER / _MR_IID / _PR_ID for ${ctx.provider.name}`,
        );

        const review = await ctx.provider.pollForReview(
            { number: prNumber },
            { sinceIso, triggerId, timeoutSec: 600 },
        );

        ctx.assert(
            review.reviewComments + review.issueComments + review.reviews > 0,
            `No review activity detected on PR/MR #${prNumber} within timeout`,
        );

        return {
            prNumber,
            triggerId,
            sinceIso,
            review,
        };
    },
};

function envKey(name: string): string {
    switch (name) {
        case "github":
            return "GH";
        case "gitlab":
            return "GL";
        case "bitbucket":
            return "BB";
        case "azure-devops":
            return "AZ";
        default:
            return name.toUpperCase();
    }
}

export default codeReviewBasic;
