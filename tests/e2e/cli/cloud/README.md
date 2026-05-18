# Cloud QA setup

Drives `qa.web.kodus.io` via Playwright to seed the persistent E2E
tenants the cloud matrix smoke runs against. Same isolation pattern as
the self-hosted droplet (one tenant per provider) plus extra tenants for
the free/trial license tiers.

Use `setup-tenants.ts` once (or after the QA env is reset). Output is
saved to `~/.kodus-dev/cloud-tenants.json` (gitignored) and consumed by
`tests/e2e/lib/runner.ts:resolveTenantForCell` on cloud cells.

## Tenants seeded

| Email                       | Tier  | Provider     | Repo                                                                  |
| --------------------------- | ----- | ------------ | --------------------------------------------------------------------- |
| e2e-paid-gh@kodus.io        | paid  | GitHub       | kodus-e2e/tiny-url-qa-paid                                            |
| e2e-free-gh@kodus.io        | free  | GitHub       | kodus-e2e/tiny-url-qa-free                                            |
| e2e-trial-gh@kodus.io       | trial | GitHub       | kodus-e2e/tiny-url-qa-trial                                           |
| e2e-paid-gl@kodus.io        | paid  | GitLab       | kodus-e2e/tiny-url-qa                                                 |
| e2e-paid-bb@kodus.io        | paid  | Bitbucket    | kodustech/tiny-url-qa                                                 |
| e2e-paid-az@kodus.io        | paid  | Azure DevOps | dev.azure.com/kodustech/kodus-e2e/_git/tiny-url-qa                    |

Six repos are isolated per tenant to keep each tenant's PR comment
history clean — `generateKodyRulesUseCase` reads the last 3 months of
PRs during `finish-onboarding`, and shared repos would let the LLM
generate rules from another tenant's traffic.

## Flow per tenant

1. **Signup** — `qa.web.kodus.io/sign-up`, email → name + password.
   No email verification on fresh signups (only on org invites).
2. **License tier** — for `paid` and `trial` tenants, Playwright drives
   the upgrade flow with Stripe test card `4242 4242 4242 4242`.
   `free` tenants stay on the default tier.
3. **Connect provider** — paste PAT/app-password in the integration
   settings page.
4. **Persist credentials** — appended to `~/.kodus-dev/cloud-tenants.json`
   (one entry per tenant, with email/password/orgId/teamId).

## Prerequisites

* `qa.web.kodus.io` accessible from your laptop
* QA Stripe is in test mode (price IDs for paid/trial known)
* Provider tokens already configured in `~/.kodus-dev/config`
  (`GH_TEST_TOKEN`, `GL_TEST_TOKEN`, `BB_TEST_USER` + `BB_TEST_APP_PASSWORD`,
  `AZ_TEST_TOKEN`)

## Idempotency

The script is safe to re-run. Signup is idempotent (409 on duplicate
email is silently treated as "already created"). Upgrade detects an
already-paid tier and skips. Provider connection updates the token in
place.

## Known blocker (2026-05-18)

`POST /auth/signup` AND `POST /auth/login` on `qa.web.kodus.io`
currently return HTTP 500 ("An unexpected error occurred"). Health
endpoint reports the stack as healthy (DB up, env=homolog), so the
failure is somewhere inside the auth use-case. Identical shape to the
ResendEmailProvider eager-init crash we patched on self-hosted earlier
in this session (see commit history for `chore/quality-gates`) — a
fresh QA deploy that picks up that fix would likely unblock signup.

Repro:

    curl -sS -X POST https://qa.web.kodus.io/api/proxy/api/auth/signup \
      -H "Content-Type: application/json" \
      -d '{"name":"Probe","email":"probe@example.com","password":"E2eCloud!2026Smoke"}'

    # 500 "An unexpected error occurred"

Until QA auth is back, this script can't drive past step 1 of the
multi-step signup form. Selectors and waits are all wired up — once
QA is unblocked, `yarn cloud:setup-tenants` should run end-to-end
without further changes.
