/* eslint-disable no-console */
/**
 * Seeds the persistent E2E tenants on the QA cloud (qa.web.kodus.io)
 * that the cloud matrix smoke runs against. Each tenant is
 * single-provider and single-tier so it mirrors the self-hosted
 * isolation pattern.
 *
 * Usage:
 *   yarn cloud:setup-tenants                    # all tenants
 *   CLOUD_SETUP_ONLY=e2e-paid-gh@kodus.io \     # one tenant
 *     yarn cloud:setup-tenants
 *
 * Idempotent: signUp() returns silently on 409, integration POST
 * upserts in place, repo registration is idempotent on the Kodus side.
 *
 * Output: ~/.kodus-dev/cloud-tenants.json — one JSON object per
 * tenant with email/password/organizationId/teamId. Read by the
 * matrix runner in lib/runner.ts:resolveTenantForCell.
 *
 * Stripe upgrade (paid/trial tiers): NOT yet automated — see TODO in
 * ensureLicenseTier(). For now, the script seeds the tenant on the
 * default free tier. The matrix cell for paid will fail until upgrade
 * is implemented OR an admin endpoint to set tier is exposed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
    finishOnboarding,
    login,
    registerIntegration,
    registerRepo,
    signUp,
} from "../../lib/onboarding.js";
import { makeProvider } from "../../providers/index.js";
import type {
    KodusSession,
    ProviderName,
    TargetContext,
} from "../../lib/types.js";

const QA_WEB_URL =
    process.env.CLOUD_WEB_URL?.replace(/\/$/, "") ?? "https://qa.web.kodus.io";

// Cloud QA proxies API calls through `/api/proxy/api/<path>`. The
// helpers in lib/onboarding.ts append paths like `/auth/signUp` to the
// configured apiBaseUrl, so the base must end at `/api` (not `/api/proxy`).
const QA_API_BASE_URL =
    process.env.CLOUD_API_URL?.replace(/\/$/, "") ??
    `${QA_WEB_URL}/api/proxy/api`;

const CREDS_FILE = join(homedir(), ".kodus-dev", "cloud-tenants.json");

// Shared password for all seeded tenants. Stored in plaintext in the
// gitignored creds file — fine for QA, never use for prod.
const SHARED_PASSWORD =
    process.env.CLOUD_SETUP_PASSWORD ?? "E2eCloud!2026Smoke";

type TenantLicense = "paid" | "trial" | "free";

interface TenantSpec {
    email: string;
    name: string;
    license: TenantLicense;
    provider: ProviderName;
    repoFullName: string;
}

// Tenant registry. Names can only contain letters / spaces / hyphens /
// apostrophes (Kodus validates `^[A-Za-z\s\-']+$` server-side), so no
// digits in the visible name.
//
// Repos are shared across tiers of the same provider — license tier is
// per-org on cloud (Stripe-driven), so each tier needs its own
// organization, but webhooks from a single repo can be disambiguated
// by Kodus per integration (App installation id for GitHub, OAuth/PAT
// integration uuid for GitLab/Bitbucket/Azure). One downside: the
// `generateKodyRulesUseCase` step at finish-onboarding reads the
// repo's PR history regardless of which org is onboarding, so the
// rules generated for tier B can be shaped by traffic from tier A —
// acceptable for the QA matrix where the license-attribution and
// per-seat gates are the real signal; revisit if a scenario needs
// strictly isolated rule histories.
const TENANTS: TenantSpec[] = [
    {
        email: "e2e-paid-gh@kodus.io",
        name: "Smoke Paid GitHub",
        license: "paid",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url",
    },
    {
        email: "e2e-free-gh@kodus.io",
        name: "Smoke Free GitHub",
        license: "free",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url",
    },
    {
        email: "e2e-trial-gh@kodus.io",
        name: "Smoke Trial GitHub",
        license: "trial",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url",
    },
    {
        email: "e2e-paid-gl@kodus.io",
        name: "Smoke Paid GitLab",
        license: "paid",
        provider: "gitlab",
        repoFullName: "kodus-e2e/tiny-url",
    },
    {
        email: "e2e-paid-bb@kodus.io",
        name: "Smoke Paid Bitbucket",
        license: "paid",
        provider: "bitbucket",
        repoFullName: "kodustech/tiny-url",
    },
    {
        email: "e2e-paid-az@kodus.io",
        name: "Smoke Paid Azure",
        license: "paid",
        provider: "azure-devops",
        repoFullName: "kodustech/kodus-e2e/tiny-url",
    },
];

interface SavedTenant extends TenantSpec {
    password: string;
    organizationId?: string;
    teamId?: string;
    integrationConnected?: boolean;
    repoRegistered?: boolean;
    onboardingFinished?: boolean;
    tierUpgraded?: boolean;
    seededAt: string;
}

function readSavedCreds(): SavedTenant[] {
    if (!existsSync(CREDS_FILE)) return [];
    try {
        const raw = readFileSync(CREDS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as SavedTenant[]) : [];
    } catch (err) {
        console.warn(
            `[warn] could not parse ${CREDS_FILE}: ${(err as Error).message}. Starting fresh.`,
        );
        return [];
    }
}

function writeSavedCreds(creds: SavedTenant[]): void {
    mkdirSync(dirname(CREDS_FILE), { recursive: true });
    writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

function upsertCreds(creds: SavedTenant[], next: SavedTenant): SavedTenant[] {
    const idx = creds.findIndex((c) => c.email === next.email);
    if (idx >= 0) {
        creds[idx] = { ...creds[idx], ...next };
        return creds;
    }
    return [...creds, next];
}

function targetForCloud(): TargetContext {
    return {
        target: "cloud",
        apiBaseUrl: QA_API_BASE_URL,
        webBaseUrl: QA_WEB_URL,
    };
}

// TODO(cloud-setup): Drive Stripe Checkout via Playwright to upgrade
// `paid` and `trial` tenants. Until then, those tiers stay on the
// default (free), and the cloud × paid matrix cells will fail the
// license-attribution scenario for the right reason — the gate
// reports "free" instead of "paid". Track upgrade automation
// separately from this loop so signup/integration progress isn't
// blocked on the Stripe iframe.
async function ensureLicenseTier(tenant: TenantSpec): Promise<boolean> {
    if (tenant.license === "free") return true;
    console.log(
        `  [todo] license-tier upgrade for ${tenant.email} (${tenant.license}) — not implemented yet, staying on default tier`,
    );
    return false;
}

async function connectProvider(
    target: TargetContext,
    session: KodusSession,
    tenant: TenantSpec,
): Promise<{ integrationConnected: boolean; repoRegistered: boolean }> {
    // Build a Provider from env (GH_TEST_TOKEN / GL_TEST_TOKEN / etc.).
    // For cloud QA we reuse the same tokens that drive the self-hosted
    // matrix — the test repos in kodus-e2e org are reachable from both
    // targets with the same PAT. `repoFullName` on the tenant overrides
    // the env-driven GH_TEST_REPO etc. so each cloud tenant owns its
    // own isolated repo and PR history.
    const savedEnv = process.env;
    const overrideKey = ({
        github: "GH_TEST_REPO",
        gitlab: "GL_TEST_REPO",
        bitbucket: "BB_TEST_REPO",
        "azure-devops": "AZ_TEST_REPO",
    } as Record<ProviderName, string>)[tenant.provider];
    const previous = savedEnv[overrideKey];
    process.env[overrideKey] = tenant.repoFullName;
    try {
        const provider = makeProvider(tenant.provider);
        await registerIntegration(target, provider, session);
        // Wait for /code-management/auth-integration's async post-processing
        // to land before /repositories queries depend on it. The UI flow takes
        // 8-33s between these steps (user clicks Continue, fills forms, etc.).
        // Our HTTP script previously ran them in ~2s on QA cloud and hit the
        // bug at active-code-review-automation.use-case.ts:43 where
        // `const [teamAutomation] = teamAutomationService.find(...)` returns
        // null on empty — confirmed deterministic race in QA's Mongo logs
        // (single occurrence in 30d, ours, only when gap < 8s).
        await new Promise((r) => setTimeout(r, 10_000));
        const repo = await registerRepo(target, provider, session);
        await finishOnboarding(target, session, repo);
        return { integrationConnected: true, repoRegistered: true };
    } finally {
        if (previous === undefined) delete process.env[overrideKey];
        else process.env[overrideKey] = previous;
    }
}

async function seedTenant(
    tenant: TenantSpec,
    existing: SavedTenant | undefined,
): Promise<SavedTenant> {
    const target = targetForCloud();
    const password = SHARED_PASSWORD;

    await signUp(target, {
        email: tenant.email,
        password,
        name: tenant.name,
    });

    const session = await login(target, { email: tenant.email, password });

    const { integrationConnected, repoRegistered } = await connectProvider(
        target,
        session,
        tenant,
    );
    const onboardingFinished = repoRegistered; // connectProvider runs finishOnboarding too

    const tierUpgraded = await ensureLicenseTier(tenant);

    return {
        ...tenant,
        password,
        organizationId: session.organizationId,
        teamId: session.teamId,
        integrationConnected,
        repoRegistered,
        onboardingFinished,
        tierUpgraded,
        seededAt: new Date().toISOString(),
        ...(existing ?? {}),
        // Preserve newly resolved org/team ids even if existing had stale ones.
        ...(session.organizationId
            ? { organizationId: session.organizationId }
            : {}),
        ...(session.teamId ? { teamId: session.teamId } : {}),
    };
}

async function main(): Promise<void> {
    const saved = readSavedCreds();
    const onlyEmails = (process.env.CLOUD_SETUP_ONLY ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const todo = onlyEmails.length
        ? TENANTS.filter((t) => onlyEmails.includes(t.email))
        : TENANTS;
    if (onlyEmails.length && todo.length === 0) {
        console.error(
            `[cloud-setup] CLOUD_SETUP_ONLY=${onlyEmails.join(",")} matched no tenants in the registry`,
        );
        process.exit(2);
    }

    console.log(`[cloud-setup] target: ${QA_API_BASE_URL}`);
    console.log(
        `[cloud-setup] tenants to seed: ${todo.length}${onlyEmails.length ? " (filtered)" : ""}`,
    );
    console.log(
        `[cloud-setup] creds file: ${CREDS_FILE} (${saved.length} existing entries)`,
    );

    const failures: Array<{ email: string; error: string }> = [];

    let current = saved;
    for (const tenant of todo) {
        console.log(
            `\n[cloud-setup] ▶ ${tenant.email} (${tenant.license} × ${tenant.provider})`,
        );
        const existing = current.find((c) => c.email === tenant.email);
        try {
            const next = await seedTenant(tenant, existing);
            current = upsertCreds(current, next);
            writeSavedCreds(current);
            console.log(`  ✓ saved (org=${next.organizationId}, team=${next.teamId})`);
        } catch (err) {
            const message = (err as Error).message ?? String(err);
            console.error(`  ✗ failed: ${message}`);
            failures.push({ email: tenant.email, error: message });
        }
    }

    console.log(
        `\n[cloud-setup] done. ${todo.length - failures.length}/${todo.length} ok`,
    );
    if (failures.length) {
        for (const f of failures) {
            console.error(`  ✗ ${f.email}: ${f.error}`);
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("[cloud-setup] failed:", err);
    process.exit(1);
});
