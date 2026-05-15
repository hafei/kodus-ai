#!/usr/bin/env bash
# Rebuilds local source and redeploys it to an alive self-hosted droplet.
#
# Use this to iterate on your branch without provisioning new droplets every
# time. Flow:
#
#   1. yarn selfhosted:up                  # one-time, provisions droplet
#   2. (edit code on your laptop)
#   3. yarn selfhosted:redeploy            # builds local → pushes to your
#                                           GHCR namespace → restarts on droplet
#   4. (repeat 2-3 as needed)
#   5. yarn selfhosted:down                # when done
#
# Images are pushed to `ghcr.io/<your-gh-user>/kodus-ai-{api,worker,webhook,
# web,mcp-manager}:dev-<instance-name>` so each dev has their own namespace
# and there's no conflict with org-published images.
#
# Required:
#   - An alive instance from `yarn selfhosted:up`
#   - `gh auth login` completed (we read your token + username from gh CLI)
#   - Docker with buildx
#
# Usage:
#   yarn selfhosted:redeploy                       # rebuild + redeploy all 5 services
#   yarn selfhosted:redeploy --name wellington     # target a specific instance
#   yarn selfhosted:redeploy -- api worker         # only rebuild these services
#   yarn selfhosted:redeploy --no-build            # skip build, just pull + restart
#                                                  # (useful if a teammate already pushed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_common.sh"

NAME_RAW="default"
SKIP_BUILD=0
SERVICES_FILTER=""
while [ $# -gt 0 ]; do
    case "$1" in
        --name) NAME_RAW="$2"; shift 2 ;;
        --name=*) NAME_RAW="${1#--name=}"; shift ;;
        --no-build) SKIP_BUILD=1; shift ;;
        --) shift; SERVICES_FILTER="$*"; break ;;
        -h|--help)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *) err "Unknown arg: $1"; exit 2 ;;
    esac
done
NAME=$(normalize_name "$NAME_RAW")
state_exists "$NAME" || {
    err "No instance named '$NAME'. Run 'yarn selfhosted:up' first."
    err "Active instances:"
    list_instances | sed 's/^/  /' >&2 || echo "  (none)" >&2
    exit 1
}

SERVER_IP=$(state_get "$NAME" .server_ip)
SSH_KEY_PATH=$(state_get "$NAME" .ssh_key_path)
[ -n "$SERVER_IP" ] && [ -f "$SSH_KEY_PATH" ] \
    || { err "State file is broken (missing server_ip or ssh key)"; exit 1; }

# ---------- preflight ----------
for c in docker jq ssh; do require_cmd "$c"; done

if ! docker buildx version >/dev/null 2>&1; then
    err "docker buildx is required. Update Docker Desktop or install buildx."
    exit 1
fi

if [ "$SKIP_BUILD" != "1" ]; then
    if ! command -v gh >/dev/null 2>&1; then
        err "gh CLI is required to authenticate to GHCR. Install with 'brew install gh'."
        exit 1
    fi
    if ! gh auth status >/dev/null 2>&1; then
        err "Run 'gh auth login' first — we need your GHCR token to push images."
        exit 1
    fi
fi

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Lowercase the GH user — Docker requires lowercase in image references.
if [ "$SKIP_BUILD" != "1" ] || [ -z "${GH_USER:-}" ]; then
    GH_USER=$(gh api user --jq .login 2>/dev/null | tr '[:upper:]' '[:lower:]')
    [ -n "$GH_USER" ] || { err "Could not read your GitHub username from gh CLI."; exit 1; }
fi

DEV_TAG="dev-${NAME}"
REGISTRY="ghcr.io/${GH_USER}"

ALL_SERVICES=(api worker webhooks web mcp-manager)

image_name_for() {
    case "$1" in
        api)         echo "kodus-ai-api" ;;
        worker)      echo "kodus-ai-worker" ;;
        webhooks)    echo "kodus-ai-webhook" ;;
        web)         echo "kodus-ai-web" ;;
        mcp-manager) echo "kodus-mcp-manager" ;;
    esac
}

if [ -n "$SERVICES_FILTER" ]; then
    # Validate the filter contains only known service names.
    for svc in $SERVICES_FILTER; do
        case "$svc" in
            api|worker|webhooks|web|mcp-manager) ;;
            *) err "Unknown service '$svc'. Valid: ${ALL_SERVICES[*]}"; exit 2 ;;
        esac
    done
    SERVICES_TO_REBUILD=($SERVICES_FILTER)
else
    SERVICES_TO_REBUILD=("${ALL_SERVICES[@]}")
fi

log "Redeploy target: ${BLUE}$NAME${NC} @ $SERVER_IP"
log "  Build local:    $([ "$SKIP_BUILD" = "1" ] && echo "skip" || echo "yes")"
log "  Services:       ${SERVICES_TO_REBUILD[*]}"
log "  Image registry: $REGISTRY"
log "  Tag:            $DEV_TAG"

# ---------- build ----------
if [ "$SKIP_BUILD" != "1" ]; then
    log "Logging in to GHCR (push)..."
    gh auth token | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null

    # In docker-bake.hcl, target names match service names 1:1 (api, worker,
    # webhooks, web, mcp-manager), so we set ${target}.tags directly.
    BAKE_ARGS=()
    BAKE_TARGETS=()
    for svc in "${SERVICES_TO_REBUILD[@]}"; do
        image_name=$(image_name_for "$svc")
        full_tag="${REGISTRY}/${image_name}:${DEV_TAG}"
        BAKE_ARGS+=("--set" "${svc}.tags=${full_tag}")
        BAKE_TARGETS+=("$svc")
    done

    log "Building (${#BAKE_TARGETS[@]} service$([ ${#BAKE_TARGETS[@]} -gt 1 ] && echo s))..."
    docker buildx bake -f docker-bake.hcl \
        --set "base.args.API_CLOUD_MODE=false" \
        "${BAKE_ARGS[@]}" \
        --push \
        "${BAKE_TARGETS[@]}"
    ok "Build + push done"
fi

# ---------- generate override on droplet ----------
log "Writing docker-compose.override.yml on droplet..."
# Always include all 5 services in the override so the droplet runs a
# consistent dev tag across them (even if you only rebuilt one this
# iteration — the others stay on the dev tag from a previous round).
OVERRIDE_YML="services:"
for svc in "${ALL_SERVICES[@]}"; do
    image_name=$(image_name_for "$svc")
    OVERRIDE_YML="${OVERRIDE_YML}
  ${svc}:
    image: ${REGISTRY}/${image_name}:${DEV_TAG}"
done

ssh_to "$NAME" "cat > /opt/kodus-installer/docker-compose.override.yml" <<EOF
$OVERRIDE_YML
EOF
ok "Override written"

# ---------- pull + restart on droplet ----------
log "Logging in to GHCR on droplet + pulling new images..."
GH_TOKEN_FOR_DROPLET=$(gh auth token)
ssh_to "$NAME" bash <<REMOTE
set -e
cd /opt/kodus-installer
echo "$GH_TOKEN_FOR_DROPLET" | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null
docker compose pull ${SERVICES_TO_REBUILD[@]}
docker compose up -d ${SERVICES_TO_REBUILD[@]}
docker logout ghcr.io >/dev/null
REMOTE
unset GH_TOKEN_FOR_DROPLET
ok "Containers restarted"

# ---------- wait for health ----------
log "Waiting for services to respond..."
HEALTH_FAILED=()
for label_port in "web:3000" "api:3001" "webhooks:3332"; do
    label="${label_port%:*}"; port="${label_port#*:}"
    # Skip services we didn't rebuild
    case "$label" in
        web|api|webhooks)
            services_str=" ${SERVICES_TO_REBUILD[*]} "
            if [[ ! "$services_str" =~ " $label " ]]; then
                continue
            fi
            ;;
    esac
    SUCCESS=0
    for i in $(seq 1 100); do
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$SERVER_IP:$port" || echo 000)
        if [[ "$code" =~ ^[234][0-9][0-9]$ ]]; then SUCCESS=1; break; fi
        sleep 3
    done
    [ "$SUCCESS" = "1" ] && ok "$label up" || { warn "$label not responding"; HEALTH_FAILED+=("$label_port"); }
done

if [ ${#HEALTH_FAILED[@]} -gt 0 ]; then
    err "Health check failed for: ${HEALTH_FAILED[*]}"
    err "  ssh in: yarn selfhosted:ssh${NAME:+ --name $NAME}"
    err "  logs:   yarn selfhosted:logs${NAME:+ --name $NAME}"
    exit 1
fi

DASHBOARD=$(state_get "$NAME" .dashboard_url)
echo ""
ok "Redeploy done"
echo ""
echo "  Dashboard: $DASHBOARD"
echo "  Image tag: $DEV_TAG"
echo "  Services:  ${SERVICES_TO_REBUILD[*]}"
echo ""
echo "  Iterate:   edit code → yarn selfhosted:redeploy${NAME:+ --name $NAME}"
echo "  Logs:      yarn selfhosted:logs${NAME:+ --name $NAME}"
echo "  Destroy:   yarn selfhosted:down${NAME:+ --name $NAME}"
echo ""
