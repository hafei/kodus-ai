import { readFileSync } from "node:fs";
import { http, ensureOk } from "../lib/http.js";
import type { RunContext, Scenario } from "../lib/types.js";

// Fixture branch pair on kodus-e2e/tiny-url. Different from other scenarios
// so all three GitHub fixtures can have open PRs in parallel without GitHub
// rejecting "second open PR for the same head→base".
const GITHUB_FIXTURE = {
    head: "feature/add-stats",
    base: "main",
};

// Per-seat license gate validates three states on a single tenant with
// seats=1:
//   (1) license activated, no users assigned, auto-assign default OFF →
//       PR must NOT be reviewed (USER_NOT_LICENSED blocks the pipeline).
//   (2) PAT user manually assigned a seat → PR MUST be reviewed.
//   (3) PAT user unassigned again → PR must NOT be reviewed.
//
// We open three sequential PRs from the same persistent head→base fixture
// branch. Each PR gets a fresh number, so the `validate-new-commits` stage
// always treats it as a new review.
//
// Inputs:
//   SH_LICENSE_KEY_PATH   file containing the seats=1 JWT to activate
//                          (defaults to ~/.kodus-dev/license-seats1.jwt)
//
// We deliberately do NOT consume `SH_LICENSE_KEY` directly because we want
// the dev to keep the key in a chmod-600 file, not in their shell env.
export const perSeatLicenseToggle: Scenario = {
    id: "per-seat-license-toggle",
    title:
        "Per-seat license gate: review fires only when the PR author has a seat",
    priority: "P0",
    appliesTo: {
        target: ["self-hosted"],
        provider: ["github"],
        license: ["license-paid"],
    },
    timeoutSec: 2100,
    async run(ctx: RunContext) {
        ctx.assert(ctx.tenant, "scenario requires a tenant");
        const baseUrl = ctx.target.apiBaseUrl;

        const jwtPath =
            process.env.SH_LICENSE_KEY_PATH ??
            `${process.env.HOME}/.kodus-dev/license-seats1.jwt`;
        const licenseJwt = readFileSync(jwtPath, "utf-8")
            .replace(/\s+/g, "");
        ctx.assert(
            licenseJwt.split(".").length === 3,
            `License JWT at ${jwtPath} does not look like a 3-part token`,
        );

        const session = await ctx.kodus.login(ctx.tenant!);
        await ctx.kodus.registerIntegration(session);
        const repo = await ctx.kodus.registerRepo(session);
        await ctx.kodus.finishOnboarding(session, repo);

        const authHeader = {
            Authorization: `Bearer ${session.accessToken}`,
        };

        // Activate the seats=1 license on this tenant's org. Idempotent —
        // POST /license/activate just overwrites the organization parameter.
        const activate = await http<{ data: { valid: boolean; seats?: number } }>(
            `${baseUrl}/license/activate`,
            {
                method: "POST",
                headers: authHeader,
                body: { licenseKey: licenseJwt },
                timeoutMs: 20_000,
            },
        );
        ensureOk(activate, "per-seat:activate");
        ctx.assert(
            activate.body.data?.valid === true,
            `License activate returned valid=false: ${activate.raw.slice(0, 300)}`,
        );

        // GH user.id of the PAT — this is exactly what Kodus's
        // validate-prerequisites stage reads from `pullRequest.user.id` when
        // it decides whether to gate.
        const userId = await fetchGithubUserId(
            ctx.provider.authToken(),
        );

        // Force `assignedUsers = []` from the start. POST /license/assign
        // with licenseStatus=inactive is idempotent — if the user isn't in
        // the list it's a no-op.
        await toggleSeat(baseUrl, authHeader, userId, "inactive");
        await assertSeatCount(baseUrl, authHeader, 0, ctx);

        const phase1 = await runReviewPhase(ctx, {
            label: "unassigned-before",
            expectReview: false,
            pollTimeoutSec: 120,
        });

        await toggleSeat(baseUrl, authHeader, userId, "active");
        await assertSeatCount(baseUrl, authHeader, 1, ctx);

        const phase2 = await runReviewPhase(ctx, {
            label: "assigned",
            expectReview: true,
            // Real review on tiny-url fixture (Kimi K2.6) measured at
            // ~10–11 min end-to-end. Give it 900s like code-review-basic.
            pollTimeoutSec: 900,
        });

        await toggleSeat(baseUrl, authHeader, userId, "inactive");
        await assertSeatCount(baseUrl, authHeader, 0, ctx);

        const phase3 = await runReviewPhase(ctx, {
            label: "unassigned-after",
            expectReview: false,
            pollTimeoutSec: 120,
        });

        return {
            userGitId: userId,
            phases: [phase1, phase2, phase3],
        };
    },
};

async function fetchGithubUserId(token: string): Promise<string> {
    const resp = await http<{ id: number; login: string }>(
        "https://api.github.com/user",
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeoutMs: 15_000,
        },
    );
    ensureOk(resp, "per-seat:fetchGithubUserId");
    return String(resp.body.id);
}

async function toggleSeat(
    baseUrl: string,
    authHeader: Record<string, string>,
    gitId: string,
    licenseStatus: "active" | "inactive",
): Promise<void> {
    const resp = await http<{ data: { successful: unknown[]; failed: unknown[] } }>(
        `${baseUrl}/license/assign`,
        {
            method: "POST",
            headers: authHeader,
            body: {
                users: [{ gitId, gitTool: "github", licenseStatus }],
            },
            timeoutMs: 15_000,
        },
    );
    ensureOk(resp, `per-seat:toggleSeat:${licenseStatus}`);
}

async function assertSeatCount(
    baseUrl: string,
    authHeader: Record<string, string>,
    expected: number,
    ctx: RunContext,
): Promise<void> {
    const resp = await http<{ data: Array<{ git_id: string }> }>(
        `${baseUrl}/license/users`,
        { headers: authHeader, timeoutMs: 15_000 },
    );
    ensureOk(resp, "per-seat:listSeats");
    const count = resp.body.data?.length ?? 0;
    ctx.assert(
        count === expected,
        `Expected ${expected} licensed user(s) but got ${count}: ${resp.raw.slice(0, 300)}`,
    );
}

async function runReviewPhase(
    ctx: RunContext,
    opts: {
        label: string;
        expectReview: boolean;
        pollTimeoutSec: number;
    },
): Promise<Record<string, unknown>> {
    if (!ctx.provider.openPRFromBranches) {
        throw new Error(
            `Provider ${ctx.provider.name} does not implement openPRFromBranches`,
        );
    }
    const sinceIso = new Date().toISOString();
    const pr = await ctx.provider.openPRFromBranches({
        head: GITHUB_FIXTURE.head,
        base: GITHUB_FIXTURE.base,
        title: `[e2e] per-seat ${opts.label} ${ctx.runId.slice(0, 8)}`,
        body: `Automated PR for per-seat license test (phase: ${opts.label}). Run ${ctx.runId}.`,
    });
    try {
        const review = await ctx.provider.pollForReview(
            { number: pr.number },
            { sinceIso, timeoutSec: opts.pollTimeoutSec },
        );
        const sawReview =
            review.reviewComments + review.issueComments + review.reviews > 0;
        if (opts.expectReview) {
            ctx.assert(
                sawReview,
                `[${opts.label}] expected a review on PR #${pr.number} within ${opts.pollTimeoutSec}s but saw none`,
            );
        } else {
            ctx.assert(
                !sawReview,
                `[${opts.label}] expected NO review on PR #${pr.number} but saw: ${JSON.stringify(review)}`,
            );
        }
        return {
            phase: opts.label,
            prNumber: pr.number,
            prUrl: pr.url,
            expectReview: opts.expectReview,
            sawReview,
            review,
        };
    } finally {
        try {
            await ctx.provider.closePR(pr);
        } catch {
            // Best-effort cleanup — leaving the PR open is recoverable.
        }
    }
}

export default perSeatLicenseToggle;
