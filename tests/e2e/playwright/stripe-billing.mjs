// Stripe billing E2E driver — Playwright × QA cloud (qa.web.kodus.io).
//
// Validates the 4 billing lifecycle moves that customers exercise:
//
//   1. free  → paid   via Stripe Checkout
//   2. trial → paid   via Stripe Checkout
//   3. paid  → cancel via Stripe Customer Portal
//   4. paid  → free   via /api/proxy/billing/migrate-to-free
//
// The 2 dedicated tenants are seeded by cli/cloud/setup-tenants.ts:
//   - e2e-stripe-checkout-free@kodus.io  (covers #1 then #3)
//   - e2e-stripe-checkout-trial@kodus.io (covers #2 then #4)
//
// Stripe Checkout / Portal run in TEST MODE. Card 4242 4242 4242 4242
// with any future expiry + any 3-digit CVC completes the purchase
// synchronously. Webhooks flip the subscription record server-side
// within a few seconds, so each sub-flow polls the billing API until
// the tier matches the expected state (or times out at 60s).
//
// Required env:
//   STRIPE_E2E_WEB_URL       https://qa.web.kodus.io
//   STRIPE_E2E_FREE_EMAIL    e2e-stripe-checkout-free@kodus.io
//   STRIPE_E2E_TRIAL_EMAIL   e2e-stripe-checkout-trial@kodus.io
//   STRIPE_E2E_PASSWORD      shared QA password
//   STRIPE_E2E_HEADLESS=0    for a visible Chromium window
//
// Exits 0 only when ALL 4 sub-flows pass. Prints
// `[stripe-billing] PASS sub-flow-N: …` per success or
// `[stripe-billing] FAIL sub-flow-N: …` on the first failure.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const {
    STRIPE_E2E_WEB_URL = "https://qa.web.kodus.io",
    STRIPE_E2E_FREE_EMAIL = "e2e-stripe-checkout-free@kodus.io",
    STRIPE_E2E_TRIAL_EMAIL = "e2e-stripe-checkout-trial@kodus.io",
    STRIPE_E2E_PASSWORD,
    STRIPE_E2E_HEADLESS = "1",
} = process.env;

if (!STRIPE_E2E_PASSWORD) {
    console.error("error: STRIPE_E2E_PASSWORD must be set");
    process.exit(2);
}

const WEB = STRIPE_E2E_WEB_URL.replace(/\/$/, "");
const API = `${WEB}/api/proxy/api`;
const BILLING = `${WEB}/api/proxy/billing`;
const headless = STRIPE_E2E_HEADLESS !== "0";

// Stripe test-mode card. Any future expiry + any 3-digit CVC completes
// the purchase. Documented at https://stripe.com/docs/testing#cards.
const TEST_CARD = "4242424242424242";
const TEST_EXPIRY = "1234"; // MM/YY → 12/34
const TEST_CVC = "123";
const TEST_ZIP = "12345";

const log = (...a) => console.log("[stripe-billing]", ...a);
const pass = (sub, msg) => console.log(`[stripe-billing] PASS sub-flow-${sub}: ${msg}`);
const fail = (sub, msg, extra) => {
    console.error(`[stripe-billing] FAIL sub-flow-${sub}: ${msg}`);
    if (extra) console.error(extra);
    process.exit(1);
};

// ---------- API helpers ----------

async function login(email, password) {
    const resp = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const body = await resp.json().catch(() => null);
    if (resp.status >= 300) {
        throw new Error(`login HTTP ${resp.status} body=${JSON.stringify(body).slice(0, 200)}`);
    }
    const token = body?.accessToken ?? body?.data?.accessToken;
    if (!token) throw new Error(`login: no accessToken in response`);
    return token;
}

async function userInfo(token) {
    const resp = await fetch(`${API}/user/info`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status !== 200) {
        throw new Error(`/user/info HTTP ${resp.status}`);
    }
    const body = await resp.json();
    const find = (o, ...keys) => {
        if (!o || typeof o !== "object") return null;
        for (const k of keys) if (o[k]) return o[k];
        for (const v of Object.values(o)) {
            const r = find(v, ...keys);
            if (r) return r;
        }
        return null;
    };
    const data = body?.data ?? body;
    return {
        userId: find(data, "uuid", "id"),
        organizationId: find(data, "organizationId") || find(data?.organization, "uuid"),
        teamId: find(data, "teamId") || find(data?.team, "uuid"),
    };
}

async function billingFetch(token, path, init = {}) {
    const url = `${BILLING}${path}`;
    const resp = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
        },
    });
    const text = await resp.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: resp.status, body };
}

async function getSubscriptionStatus(token, organizationId, teamId) {
    // The status endpoint lives under /api/proxy/billing — the same
    // service the web's use-subscription-status hook polls. We accept
    // a few shape variations because billing responses have drifted.
    const resp = await billingFetch(
        token,
        `/subscription/${organizationId}/${teamId}`,
    );
    if (resp.status !== 200) return null;
    const body = resp.body?.data ?? resp.body;
    // Subscription record can be at the root, .subscription, or .data.
    const sub = body?.subscription ?? body;
    return {
        status: sub?.subscriptionStatus ?? sub?.status ?? null,
        planType: sub?.planType ?? sub?.plan?.type ?? null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        raw: body,
    };
}

async function pollUntil(predicate, { timeoutMs = 60_000, intervalMs = 3_000, label }) {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
        lastValue = await predicate().catch((err) => ({ error: err.message }));
        if (lastValue && lastValue.match) return lastValue;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
        `poll timeout for ${label}: last=${JSON.stringify(lastValue).slice(0, 300)}`,
    );
}

// ---------- Stripe Checkout / Portal helpers ----------

// Fill the Stripe Checkout form and submit. Test-mode pages render
// stable inputs by name; we don't rely on iframe penetration because
// hosted Checkout uses native inputs (Elements is the iframe one).
async function completeStripeCheckout(page) {
    // Wait for the Stripe page to be on its own origin. checkout.stripe.com
    // (live + test) is the canonical host.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Fill card number — Stripe Elements use `input[name="cardNumber"]`
    // OR an iframe-mounted Element. Hosted Checkout uses native inputs.
    const cardField = page.locator('input[name="cardNumber"], input[autocomplete="cc-number"]').first();
    await cardField.waitFor({ timeout: 20_000 });
    await cardField.fill(TEST_CARD);

    const expiry = page.locator('input[name="cardExpiry"], input[autocomplete="cc-exp"]').first();
    await expiry.fill(TEST_EXPIRY);

    const cvc = page.locator('input[name="cardCvc"], input[autocomplete="cc-csc"]').first();
    await cvc.fill(TEST_CVC);

    // Billing name — required by Stripe Checkout. Use a deterministic value.
    const name = page.locator('input[name="billingName"], input[autocomplete="cc-name"]').first();
    if (await name.count()) {
        await name.fill("Kodus E2E");
    }

    // Postal code — only shown in some configurations. Best-effort.
    const zip = page
        .locator(
            'input[name="billingPostalCode"], input[autocomplete="postal-code"]',
        )
        .first();
    if (await zip.count()) {
        await zip.fill(TEST_ZIP);
    }

    // Submit. Hosted Checkout's submit button is the primary CTA at
    // the bottom; it labels itself "Subscribe", "Pay", or similar
    // depending on plan type.
    const submit = page
        .locator(
            'button[type="submit"][data-testid="hosted-payment-submit-button"], button:has-text("Subscribe"), button:has-text("Pay")',
        )
        .first();
    await submit.waitFor({ timeout: 10_000 });
    await submit.click();

    // After submit, Stripe routes through 3DS (rare in test mode for
    // 4242) and then back to the success_url. Wait for the URL to
    // leave checkout.stripe.com.
    await page.waitForURL((u) => !u.toString().includes("checkout.stripe.com"), {
        timeout: 60_000,
    });
}

// Confirm cancellation in the Stripe Customer Portal. The portal has
// stable text labels but no test-ids; we match by visible text and
// fall through several variants.
async function cancelInStripePortal(page) {
    await page.waitForURL(/billing\.stripe\.com/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // The "Cancel plan" / "Cancel subscription" link appears next to
    // the active subscription.
    const cancelLink = page
        .locator('a:has-text("Cancel plan"), a:has-text("Cancel subscription"), button:has-text("Cancel plan"), button:has-text("Cancel subscription")')
        .first();
    await cancelLink.waitFor({ timeout: 20_000 });
    await cancelLink.click();

    // Cancellation reason step (Stripe asks one of these). Click the
    // first "Cancel" confirmation button we see.
    const confirm = page
        .locator('button:has-text("Cancel subscription"), button:has-text("Confirm cancellation"), button[type="submit"]:has-text("Cancel")')
        .first();
    await confirm.waitFor({ timeout: 15_000 });
    await confirm.click();

    // Wait for the portal to flash success + return to the dashboard
    // OR for the redirect back to Kodus. Either works.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

// ---------- Sub-flows ----------

async function subFlow1Checkout(ctx, email, sub) {
    log(`sub-flow-${sub}: ${email} runs Stripe Checkout → paid`);
    const token = await login(email, STRIPE_E2E_PASSWORD);
    const { organizationId, teamId } = await userInfo(token);
    if (!organizationId || !teamId) {
        throw new Error(`could not resolve org/team for ${email}`);
    }

    // Fetch the canonical plan id from /billing/plans. The cheapest
    // active plan is fine for the smoke — we're testing the lifecycle,
    // not the price.
    const plansResp = await billingFetch(token, `/plans`);
    if (plansResp.status !== 200) {
        throw new Error(
            `GET /billing/plans HTTP ${plansResp.status} body=${JSON.stringify(plansResp.body).slice(0, 200)}`,
        );
    }
    const plans = plansResp.body?.plans ?? plansResp.body?.data?.plans ?? [];
    const plan = plans.find((p) => /pro|team|paid/i.test(p?.type ?? p?.id ?? "")) ?? plans[0];
    if (!plan) {
        throw new Error(`no plans returned from /billing/plans`);
    }
    const planType = plan.type ?? plan.id;

    const sessionResp = await billingFetch(token, `/create-checkout-session`, {
        method: "POST",
        body: JSON.stringify({
            organizationId,
            teamId,
            quantity: 1,
            planType,
        }),
    });
    if (sessionResp.status !== 200 && sessionResp.status !== 201) {
        throw new Error(
            `create-checkout-session HTTP ${sessionResp.status} body=${JSON.stringify(sessionResp.body).slice(0, 200)}`,
        );
    }
    const checkoutUrl = sessionResp.body?.url ?? sessionResp.body?.data?.url;
    if (!checkoutUrl) {
        throw new Error(`create-checkout-session: no url in response`);
    }

    const page = await ctx.newPage();
    try {
        await page.goto(checkoutUrl, { waitUntil: "domcontentloaded" });
        await completeStripeCheckout(page);

        // Poll until billing reports active. Webhook delivery is
        // usually <10s but allow 60s for QA jitter.
        await pollUntil(
            async () => {
                const status = await getSubscriptionStatus(token, organizationId, teamId);
                return {
                    match: status?.status === "active" || status?.status === "paid",
                    snapshot: status,
                };
            },
            { timeoutMs: 60_000, intervalMs: 3_000, label: `${email} subscription=active` },
        );
        pass(sub, `${email} Checkout completed and tier flipped to active (planType=${planType})`);
        return { token, organizationId, teamId };
    } finally {
        await page.close();
    }
}

async function subFlow3Cancel(ctx, email, deps, sub) {
    log(`sub-flow-${sub}: ${email} cancels via Customer Portal`);
    const { token, organizationId, teamId } = deps;

    const portalResp = await billingFetch(token, `/portal/${organizationId}/${teamId}`);
    if (portalResp.status !== 200) {
        throw new Error(
            `portal HTTP ${portalResp.status} body=${JSON.stringify(portalResp.body).slice(0, 200)}`,
        );
    }
    const portalUrl = portalResp.body?.url ?? portalResp.body?.data?.url;
    if (!portalUrl) {
        throw new Error(`portal: no url in response`);
    }

    const page = await ctx.newPage();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded" });
        await cancelInStripePortal(page);

        // Stripe flips `cancel_at_period_end=true` immediately, then
        // the subscription stays `active` until period end. Accept
        // either signal (cancelAtPeriodEnd=true, status=canceled).
        await pollUntil(
            async () => {
                const status = await getSubscriptionStatus(token, organizationId, teamId);
                return {
                    match:
                        status?.cancelAtPeriodEnd === true ||
                        status?.status === "canceled" ||
                        status?.status === "cancelled",
                    snapshot: status,
                };
            },
            { timeoutMs: 60_000, intervalMs: 3_000, label: `${email} subscription=cancel*` },
        );
        pass(sub, `${email} cancellation reflected in Kodus subscription record`);
    } finally {
        await page.close();
    }
}

async function subFlow4Downgrade(token, organizationId, teamId, email, sub) {
    log(`sub-flow-${sub}: ${email} downgrade paid → free via migrate-to-free`);

    const resp = await billingFetch(token, `/migrate-to-free`, {
        method: "POST",
        body: JSON.stringify({ organizationId, teamId }),
    });
    if (resp.status !== 200 && resp.status !== 201 && resp.status !== 204) {
        throw new Error(
            `migrate-to-free HTTP ${resp.status} body=${JSON.stringify(resp.body).slice(0, 200)}`,
        );
    }
    // Poll until billing reports the downgraded state.
    await pollUntil(
        async () => {
            const status = await getSubscriptionStatus(token, organizationId, teamId);
            return {
                match:
                    /free/i.test(status?.planType ?? "") ||
                    status?.status === "free" ||
                    /free/i.test(status?.status ?? ""),
                snapshot: status,
            };
        },
        { timeoutMs: 60_000, intervalMs: 3_000, label: `${email} planType=free` },
    );
    pass(sub, `${email} downgraded to free`);
}

// ---------- Driver ----------

const browser = await chromium.launch({ headless });

try {
    // Sub-flow #1: free → paid via Checkout (sets up sub-flow #3).
    const ctxFree = await browser.newContext();
    let freeDeps;
    try {
        freeDeps = await subFlow1Checkout(ctxFree, STRIPE_E2E_FREE_EMAIL, "1");
    } catch (err) {
        await dumpDiagnostics(ctxFree, "sub-flow-1");
        await ctxFree.close();
        fail("1", `free → paid Checkout failed: ${err.message}`);
    }

    // Sub-flow #3: cancel the freshly-paid subscription via Portal.
    try {
        await subFlow3Cancel(ctxFree, STRIPE_E2E_FREE_EMAIL, freeDeps, "3");
    } catch (err) {
        await dumpDiagnostics(ctxFree, "sub-flow-3");
        await ctxFree.close();
        fail("3", `Customer Portal cancellation failed: ${err.message}`);
    }
    await ctxFree.close();

    // Sub-flow #2: trial → paid via Checkout (sets up sub-flow #4).
    const ctxTrial = await browser.newContext();
    let trialDeps;
    try {
        trialDeps = await subFlow1Checkout(ctxTrial, STRIPE_E2E_TRIAL_EMAIL, "2");
    } catch (err) {
        await dumpDiagnostics(ctxTrial, "sub-flow-2");
        await ctxTrial.close();
        fail("2", `trial → paid Checkout failed: ${err.message}`);
    }

    // Sub-flow #4: downgrade paid → free for the trial-then-paid tenant.
    try {
        await subFlow4Downgrade(
            trialDeps.token,
            trialDeps.organizationId,
            trialDeps.teamId,
            STRIPE_E2E_TRIAL_EMAIL,
            "4",
        );
    } catch (err) {
        await ctxTrial.close();
        fail("4", `paid → free downgrade failed: ${err.message}`);
    }
    await ctxTrial.close();

    log("ALL sub-flows passed");
} finally {
    await browser.close();
}

async function dumpDiagnostics(ctx, label) {
    try {
        const pages = ctx.pages();
        const page = pages[pages.length - 1];
        if (!page) return;
        const ts = Date.now();
        const png = `failure-${label}-${ts}.png`;
        await page.screenshot({ path: png, fullPage: true });
        const html = `failure-${label}-${ts}.html`;
        writeFileSync(html, await page.content());
        console.error(`[stripe-billing] saved diagnostics: ${png}, ${html} (URL=${page.url()})`);
    } catch {
        /* best-effort */
    }
}
