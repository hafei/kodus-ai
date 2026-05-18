/* eslint-disable no-console */
/**
 * Seeds the persistent E2E tenants on the QA cloud (qa.web.kodus.io) the
 * cloud matrix smoke runs against. Each tenant is single-provider and
 * single-tier so it mirrors the self-hosted isolation pattern.
 *
 * Usage:
 *   yarn cloud:setup-tenants
 *
 * Idempotent. Safe to re-run after a partial failure — signup returns
 * "already exists" for known emails, upgrade is skipped when the tier
 * already matches, integration is updated in place.
 *
 * Output: appended to `~/.kodus-dev/cloud-tenants.json` so the matrix
 * runner can read credentials per cell.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const QA_WEB_URL =
    process.env.CLOUD_WEB_URL?.replace(/\/$/, "") ?? "https://qa.web.kodus.io";
const HEADLESS = process.env.CLOUD_SETUP_HEADLESS !== "false"; // default headless; set =false to watch
const SCREENSHOT_DIR = process.env.CLOUD_SETUP_SCREENSHOTS ?? "/tmp/kodus-cloud-setup";
const CREDS_FILE = join(homedir(), ".kodus-dev", "cloud-tenants.json");

// Shared password for all seeded tenants. Stored in plaintext in the
// gitignored creds file — fine for QA, never use for prod.
const SHARED_PASSWORD = "E2eCloud!2026Smoke";

type TenantLicense = "paid" | "trial" | "free";
type TenantProvider = "github" | "gitlab" | "bitbucket" | "azure-devops";

interface TenantSpec {
    email: string;
    name: string;
    license: TenantLicense;
    provider: TenantProvider;
    repoFullName: string;
}

// Name field is validated as `^[A-Za-z\s\-']+$` server-side, so no
// digits — "E2E" gets rejected. Stay with plain letters.
const TENANTS: TenantSpec[] = [
    {
        email: "e2e-paid-gh@kodus.io",
        name: "Smoke Paid GitHub",
        license: "paid",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url-qa-paid",
    },
    {
        email: "e2e-free-gh@kodus.io",
        name: "Smoke Free GitHub",
        license: "free",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url-qa-free",
    },
    {
        email: "e2e-trial-gh@kodus.io",
        name: "Smoke Trial GitHub",
        license: "trial",
        provider: "github",
        repoFullName: "kodus-e2e/tiny-url-qa-trial",
    },
    {
        email: "e2e-paid-gl@kodus.io",
        name: "Smoke Paid GitLab",
        license: "paid",
        provider: "gitlab",
        repoFullName: "kodus-e2e/tiny-url-qa",
    },
    {
        email: "e2e-paid-bb@kodus.io",
        name: "Smoke Paid Bitbucket",
        license: "paid",
        provider: "bitbucket",
        repoFullName: "kodustech/tiny-url-qa",
    },
    {
        email: "e2e-paid-az@kodus.io",
        name: "Smoke Paid Azure",
        license: "paid",
        provider: "azure-devops",
        repoFullName: "kodustech/kodus-e2e/tiny-url-qa",
    },
];

interface SavedTenant extends TenantSpec {
    password: string;
    organizationId?: string;
    teamId?: string;
    seededAt: string;
}

function readSavedCreds(): SavedTenant[] {
    if (!existsSync(CREDS_FILE)) return [];
    try {
        const raw = readFileSync(CREDS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as SavedTenant[]) : [];
    } catch (err) {
        console.warn(`[warn] could not parse ${CREDS_FILE}: ${(err as Error).message}. Starting fresh.`);
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

async function withPage<T>(
    browser: Browser,
    label: string,
    fn: (page: Page) => Promise<T>,
): Promise<T> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
        return await fn(page);
    } catch (err) {
        // Snapshot on failure for post-mortem. Always created at the same
        // place so re-runs overwrite; this is meant for the latest failure,
        // not historical archiving.
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        const path = join(SCREENSHOT_DIR, `${label}.png`);
        try {
            await page.screenshot({ path, fullPage: true });
            console.error(`[err] screenshot saved to ${path}`);
        } catch {
            /* ignore screenshot failure */
        }
        throw err;
    } finally {
        await context.close();
    }
}

/**
 * Drives the multi-step signup form on qa.web.kodus.io:
 *   step 1: email → click Continue
 *   step 2: name + password → submit, redirects to /setup
 *
 * Resolves with `{alreadyExisted: boolean}` so callers can decide whether
 * to skip upgrade/connect steps that would otherwise duplicate work.
 */
async function signUpTenant(
    page: Page,
    tenant: TenantSpec,
    password: string,
): Promise<{ alreadyExisted: boolean }> {
    // Log any non-2xx API response we see during signup so failures
    // surface in the console even when the UI swallows them.
    page.on("response", async (resp) => {
        const status = resp.status();
        const url = resp.url();
        if (status >= 400 && /api|auth/.test(url)) {
            const body = await resp.text().catch(() => "(no body)");
            console.error(
                `  [http ${status}] ${resp.request().method()} ${url}\n    ${body.slice(0, 400)}`,
            );
        }
    });

    await page.goto(`${QA_WEB_URL}/sign-up`, { waitUntil: "domcontentloaded" });

    // Step 1: email. The form's <Input> is uncontrolled (`value=undefined`,
    // `defaultValue={field.value}`) and pipes onChange through a
    // ~300ms debounce before it calls react-hook-form's setValue. A
    // single `fill()` (which dispatches one synthetic change event)
    // doesn't reliably drive the debounce — the form stays "untouched"
    // and the Continue button never enables. Use `pressSequentially`
    // to emit one event per character so onChange fires repeatedly,
    // then sleep past the debounce window before clicking.
    const emailInput = page.getByLabel("Email", { exact: true });
    await emailInput.click();
    await emailInput.pressSequentially(tenant.email, { delay: 20 });
    // Debounce is configured at ~300ms; pad to 600ms to absorb noise.
    await page.waitForTimeout(600);

    const continueButton = page.getByRole("button", { name: "Continue" });
    await continueButton.click({ timeout: 15_000 });

    // Step 2: name + password + confirm password. Labels in the UI:
    //   "How can we call you?" → name field (placeholder "Enter your name")
    //   "Password"             → password
    //   "Confirm Password"     → re-enter password
    // Use placeholder selectors for the name field — its visible label
    // is a sentence rather than a single word, and placeholder is the
    // most stable handle.
    const nameInput = page.getByPlaceholder("Enter your name");
    await nameInput.waitFor({ state: "visible", timeout: 15_000 });
    // Same debounce pattern as the email step.
    await nameInput.click();
    await nameInput.pressSequentially(tenant.name, { delay: 20 });

    const passwordInput = page.getByPlaceholder("Create your password");
    await passwordInput.click();
    await passwordInput.pressSequentially(password, { delay: 20 });

    const confirmPasswordInput = page.getByPlaceholder("Re-enter your password");
    await confirmPasswordInput.click();
    await confirmPasswordInput.pressSequentially(password, { delay: 20 });

    // Let any debounced setValue calls flush before submitting.
    await page.waitForTimeout(600);

    const submitButton = page.getByRole("button", { name: "Sign up", exact: true });
    await submitButton.click({ timeout: 15_000 });

    // After submit one of three things happens:
    //  (a) navigation away from /sign-up — fresh signup succeeded
    //  (b) inline error "already registered" — re-run on existing tenant
    //  (c) other failure — surface URL + visible errors
    //
    // We wait up to 60s for either a URL change OR a duplicate-email
    // error to appear. Watching for ANY navigation off /sign-up is more
    // robust than hard-coding `/setup` — the post-signup landing has
    // moved before and may move again.
    const startedAt = Date.now();
    const deadline = startedAt + 60_000;
    while (Date.now() < deadline) {
        const url = page.url();
        if (!url.includes("/sign-up")) {
            return { alreadyExisted: false };
        }
        const dupVisible = await page
            .getByText(/already\s+registered|already\s+exists/i)
            .first()
            .isVisible()
            .catch(() => false);
        if (dupVisible) {
            return { alreadyExisted: true };
        }
        await page.waitForTimeout(500);
    }
    const finalUrl = page.url();
    const visibleText = (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
        .slice(0, 500);
    throw new Error(
        `signup for ${tenant.email}: stuck on ${finalUrl} after 60s. ` +
            `Visible text snapshot: ${JSON.stringify(visibleText)}`,
    );
}

/**
 * Placeholder. Drives the /settings/subscription upgrade via Stripe
 * Checkout (test card 4242 4242 4242 4242). Skipped when the tenant is
 * already on the desired tier.
 *
 * TODO(cloud-setup): implement against the actual checkout iframe shape
 * once `qa.web.kodus.io/settings/subscription` is reachable from this
 * machine and the Stripe price IDs are confirmed.
 */
async function ensureLicenseTier(
    _page: Page,
    tenant: TenantSpec,
): Promise<void> {
    if (tenant.license === "free") {
        // No action — fresh signup defaults to free/trial; we treat the
        // tenant slot as "free" once trial expires. For QA this is fine
        // because the entitlement gate fires on "free" identically.
        return;
    }
    console.log(`[todo] license-tier upgrade for ${tenant.email} (${tenant.license}) — not implemented yet`);
}

/**
 * Placeholder. Drives the connect-provider flow in /settings/integrations
 * for the tenant's provider. Uses the same PAT/app-password the
 * self-hosted matrix uses (so the same fixture repo is reachable).
 *
 * TODO(cloud-setup): implement per-provider once the page selectors are
 * inspected. GitHub uses an App install — that flow is the most
 * complex; GitLab/Azure/Bitbucket accept a pasted PAT.
 */
async function connectProvider(_page: Page, tenant: TenantSpec): Promise<void> {
    console.log(`[todo] connect ${tenant.provider} for ${tenant.email} (repo: ${tenant.repoFullName}) — not implemented yet`);
}

async function main() {
    const saved = readSavedCreds();
    // Filter for iterative debugging: `CLOUD_SETUP_ONLY=e2e-paid-gh@kodus.io`
    // runs just that tenant. Without the filter, all TENANTS are seeded.
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
    console.log(`[cloud-setup] target: ${QA_WEB_URL}`);
    console.log(`[cloud-setup] tenants to seed: ${todo.length}${onlyEmails.length ? ` (filtered)` : ""}`);
    console.log(`[cloud-setup] creds file: ${CREDS_FILE} (${saved.length} existing entries)`);

    const browser = await chromium.launch({ headless: HEADLESS });
    try {
        for (const tenant of todo) {
            console.log(`\n[cloud-setup] ▶ ${tenant.email} (${tenant.license} × ${tenant.provider})`);

            const password = SHARED_PASSWORD;
            const existingCred = saved.find((c) => c.email === tenant.email);

            // 1. Signup (idempotent)
            const { alreadyExisted } = await withPage(
                browser,
                `signup-${tenant.email}`,
                (page) => signUpTenant(page, tenant, password),
            );
            console.log(`  signup: ${alreadyExisted ? "already existed" : "created"}`);

            // 2. License tier (TODO)
            await withPage(browser, `tier-${tenant.email}`, (page) =>
                ensureLicenseTier(page, tenant),
            );

            // 3. Connect provider (TODO)
            await withPage(browser, `provider-${tenant.email}`, (page) =>
                connectProvider(page, tenant),
            );

            // 4. Persist
            const next: SavedTenant = {
                ...tenant,
                password,
                organizationId: existingCred?.organizationId,
                teamId: existingCred?.teamId,
                seededAt: new Date().toISOString(),
            };
            writeSavedCreds(upsertCreds(saved, next));
            console.log(`  ✓ saved to ${CREDS_FILE}`);
        }
    } finally {
        await browser.close();
    }

    console.log(`\n[cloud-setup] done. Inspect ${CREDS_FILE} for the seeded creds.`);
}

main().catch((err) => {
    console.error("[cloud-setup] failed:", err);
    process.exit(1);
});
