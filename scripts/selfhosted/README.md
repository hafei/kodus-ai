# Self-hosted dev VM

Provisions a real self-hosted Kodus stack on a cloud VM, leaves it alive for you (and the team) to test manually, destroys it when you say so. Unrelated to the automated E2E suite in `tests/e2e/` — this is for manual work.

## Quick start

```bash
# 1) Bootstrap (once per machine — saves to ~/.kodus-dev/config)
yarn selfhosted:setup

# (prompts: DO token, license, GH dev token, installer path)
# (offers to create .envrc if you have direnv installed)

# 2) Provision
yarn selfhosted:up

# (~8-10 min — provision droplet + install + signup)
# Output prints Dashboard / Login / Password.
# First run uses pre-built images from GHCR (great for repro / demo,
# not your local code yet — see "Test your local code" below).

# 3) Inspect
yarn selfhosted:status
yarn selfhosted:ssh                        # open shell on the VM
yarn selfhosted:ssh -- 'docker compose ps' # run a one-off remote command
yarn selfhosted:logs                       # tail all service logs
yarn selfhosted:logs -- api worker         # tail specific services

# 4) Destroy
yarn selfhosted:down
```

## Test your local code (iterate without reprovisioning)

`selfhosted:up` is for testing published images. To test the code you're
writing in this branch, use `selfhosted:redeploy`: build locally, push to
your personal GHCR namespace, droplet pulls and restarts.

```bash
# After yarn selfhosted:up is done, edit code, then:
yarn selfhosted:redeploy                   # rebuild all 5 services
yarn selfhosted:redeploy -- api worker     # rebuild only these (faster)
yarn selfhosted:redeploy --no-build        # skip build, just pull + restart
                                           # (e.g. teammate already pushed)
```

Iteration time:
- First redeploy: ~5-8 min (cold build + push all layers)
- Subsequent: ~1-3 min (only changed layers push)

Requirements:
- `gh auth login` completed (we read your GHCR token from `gh` CLI)
- Docker with buildx

Images are pushed to `ghcr.io/<your-gh-user>/kodus-ai-{api,worker,webhook,web,mcp-manager}:dev-<instance-name>` — each dev has their own namespace, no conflict with org-published images.

On the droplet, a `docker-compose.override.yml` is generated that pins all
services to your dev tag. Subsequent `selfhosted:up` runs from scratch will
ignore the override (since it's tied to one specific droplet).

## Where secrets live

In priority order (higher wins):

1. **Inline-exported env** — `IMAGE_TAG=foo yarn selfhosted:up`
2. **`scripts/selfhosted/.env`** — per-repo override (gitignored)
3. **`~/.kodus-dev/config`** — global per-machine (managed by `yarn selfhosted:setup`)

`~/.kodus-dev/config` is the recommended path: set it up once and forget. Works across every clone of the repo, survives project reinstalls.

```bash
yarn selfhosted:setup         # interactive
yarn selfhosted:setup --show  # show current config (masked)
yarn selfhosted:setup --path  # print config file path
```

If `direnv` is installed, the setup script offers to create a `.envrc` in the repo that auto-loads the config when you `cd` into the directory. Without direnv, the scripts read `~/.kodus-dev/config` directly anyway.

## Multi-instance

You and a teammate can have stacks alive at the same time:

```bash
yarn selfhosted:up --name junior
yarn selfhosted:up --name wellington
yarn selfhosted:status                          # lists both
yarn selfhosted:down --name junior
yarn selfhosted:down --name wellington
```

Each `--name` becomes a suffix on the droplet name (`kodus-selfhosted-junior`) and on the local state file (`.kodus-dev/selfhosted-vm-junior.json`).

## Configuration

Recommended: run `yarn selfhosted:setup`, which prompts for the fields below interactively. To set values manually, use any of the 3 sources in [Where secrets live](#where-secrets-live).

### Required

| Env | How to obtain |
|---|---|
| `DIGITALOCEAN_TOKEN` | [cloud.digitalocean.com/account/api](https://cloud.digitalocean.com/account/api) — scopes `droplet:create/read/delete` + `ssh_key:create/read/delete` |

### Optional

| Env | Default | Purpose |
|---|---|---|
| `KODUS_INSTALLER_PATH` | `../kodus-installer` | Path to the local installer checkout |
| `TEST_VM_PROVIDER` | `digitalocean` | Set to `hetzner` to use Hetzner Cloud (requires `HCLOUD_TOKEN`) |
| `IMAGE_TAG` | `latest` | GHCR image tag. Useful to test a specific RC (`selfhosted-X.Y.Z-rc.N`) |
| `SH_LICENSE_KEY` | (none) | If set, stack boots with the license injected (paid features unlocked) |
| `GH_DEV_TOKEN` | (none) | If set, auto-configures the GitHub integration after signup — dashboard ready to use |
| `DO_REGION` | `nyc3` | DigitalOcean region |
| `DO_SIZE` | `s-2vcpu-4gb` | Droplet size (~$24/mo if left running) |

## Local state

`up.sh` saves each instance's metadata to `.kodus-dev/selfhosted-vm-{name}.json`:

```json
{
  "name": "default",
  "provider": "digitalocean",
  "server_id": "487234",
  "server_ip": "164.92.x.x",
  "ssh_key_id": "998877",
  "ssh_key_path": ".kodus-dev/ssh-keys/default",
  "tunnel_url": "https://chunky-llama.trycloudflare.com",
  "dashboard_url": "http://164.92.x.x:3000",
  "api_url": "http://164.92.x.x:3001",
  "image_tag": "latest",
  "tenant": {
    "email": "dev-default-1715812345@kodus.local",
    "password": "k8j3xX2qaPlmnQAa1!"
  },
  "gh_integration_configured": false,
  "created_at": "2026-05-15T18:32:01Z"
}
```

`.kodus-dev/` is in `.gitignore`. Passwords and tokens stay on your machine only.

## Cost

- DO `s-2vcpu-4gb`: ~$0.036/h ≈ **$0.86/day** ≈ $26/month if left running
- Hetzner CX22: ~$0.006/h ≈ **$0.14/day** (cheaper for sustained dev use)

Don't forget `yarn selfhosted:down` when you're done.

## Troubleshooting

### "Instance 'default' already exists"

You tried to provision but one is already alive. Options:
- Use a different name: `yarn selfhosted:up --name new`
- Destroy the current one: `yarn selfhosted:down`

### Stack came up but dashboard doesn't load

```bash
yarn selfhosted:ssh -- 'docker compose ps'         # which containers are healthy
yarn selfhosted:logs -- web api                    # check for errors
```

Common causes:
- Memory pressure on `s-2vcpu-4gb` → use `DO_SIZE=s-4vcpu-8gb`
- `WEB_HOSTNAME_API` wrong (must be `kodus-api`, the internal container name)
- Container crash-looping due to a missing env var → read the logs

### Tunnel URL changed

Cloudflare quick tunnel generates a random URL. If `cloudflared` restarts (rare), the URL changes. To fetch the current one:

```bash
yarn selfhosted:ssh -- 'grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /var/log/cloudflared.log | head -1'
```

For a stable URL you'd need Cloudflare Named Tunnel — outside the scope of this helper; configure manually if needed.

### I want to test a specific RC before promoting

```bash
IMAGE_TAG=selfhosted-1.42.0-rc.3 yarn selfhosted:up --name rc-test
# poke around manually
yarn selfhosted:down --name rc-test
```

### I want to run an E2E matrix scenario against this instance

Doesn't work out-of-the-box because the E2E matrix uses its own provisioning. But you can do it manually:

```bash
cd tests/e2e
SERVER_IP=$(jq -r .server_ip ../../.kodus-dev/selfhosted-vm-default.json)
TUNNEL=$(jq -r .tunnel_url ../../.kodus-dev/selfhosted-vm-default.json)
EMAIL=$(jq -r .tenant.email ../../.kodus-dev/selfhosted-vm-default.json)
PASS=$(jq -r .tenant.password ../../.kodus-dev/selfhosted-vm-default.json)

TARGET_BASE_URL=http://$SERVER_IP:3001 \
TARGET_WEB_URL=http://$SERVER_IP:3000 \
TARGET_TUNNEL_URL=$TUNNEL \
SH_TENANT_EMAIL=$EMAIL \
SH_TENANT_PASSWORD=$PASS \
GH_TEST_TOKEN=$YOUR_TOKEN GH_TEST_REPO=owner/repo GH_TEST_PR_NUMBER=1 \
npm run scenario -- --scenario code-review-basic --target self-hosted --provider github --license license-paid
```

## How this fits with the rest

| Goal | Use |
|---|---|
| Manually test a self-hosted bugfix | `scripts/selfhosted/up.sh` (this) |
| Reproduce a customer bug | same, with `IMAGE_TAG` matching the customer's version |
| Demo for internal team or customer | same, keep alive as long as you need |
| Automated pre-release QA | `tests/e2e/` + workflows (`e2e-self-hosted-matrix.yml`) |
| Monorepo code development (cloud mode + hot reload) | `yarn docker:start` (not this helper) |

## Limitations

- **Cloudflare quick tunnel** is not stable — the hostname changes on restart. Fine for dev, not for production integrations.
- **No state persistence** across destroys — `down.sh` wipes everything. For DB snapshots, out of scope (do it manually via SSH with `pg_dump` before destroying).
- **License key** must be supplied via env — no built-in license generator.
- **GitHub auto-config** only wires GitHub. For GitLab/Bitbucket/Azure, configure manually through the dashboard afterward.
