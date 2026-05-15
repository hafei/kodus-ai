#!/usr/bin/env bash
# Interactive bootstrap for selfhosted dev helpers.
#
# Prompts for the values up.sh needs, saves them to ~/.kodus-dev/config
# (chmod 600 — only your user can read). Re-running shows current values
# (masked) and lets you update field by field.
#
# If direnv is installed, offers to create an .envrc in the repo that
# auto-loads the config when you cd into the project.
#
# Usage:
#   yarn selfhosted:setup          # interactive
#   yarn selfhosted:setup --show   # show current config (masked)
#   yarn selfhosted:setup --path   # print config file path and exit

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONFIG_DIR="$HOME/.kodus-dev"
CONFIG_FILE="$CONFIG_DIR/config"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; GRAY='\033[0;90m'; NC='\033[0m'
log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}     $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}   $*"; }
dim()  { echo -e "${GRAY}$*${NC}"; }

mode="interactive"
while [ $# -gt 0 ]; do
    case "$1" in
        --show) mode="show"; shift ;;
        --path) echo "$CONFIG_FILE"; exit 0 ;;
        -h|--help)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# Load existing config (if any) into variables we can reference as defaults.
existing_do_token=""
existing_license=""
existing_gh_token=""
existing_installer_path=""
if [ -f "$CONFIG_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$CONFIG_FILE"; set +a
    existing_do_token="${DIGITALOCEAN_TOKEN:-}"
    existing_license="${SH_LICENSE_KEY:-}"
    existing_gh_token="${GH_DEV_TOKEN:-}"
    existing_installer_path="${KODUS_INSTALLER_PATH:-}"
fi

mask() {
    local val="$1"
    if [ -z "$val" ]; then
        echo "${GRAY}(not set)${NC}"
        return
    fi
    local len=${#val}
    if [ "$len" -le 8 ]; then
        echo "${val:0:2}…${val: -2}"
    else
        echo "${val:0:6}…${val: -4}  (${len} chars)"
    fi
}

if [ "$mode" = "show" ]; then
    log "Config: $CONFIG_FILE"
    [ -f "$CONFIG_FILE" ] || { warn "(does not exist — run 'yarn selfhosted:setup' to create)"; exit 0; }
    echo ""
    echo -e "  ${BLUE}DIGITALOCEAN_TOKEN${NC}     $(mask "$existing_do_token")"
    echo -e "  ${BLUE}SH_LICENSE_KEY${NC}         $(mask "$existing_license")"
    echo -e "  ${BLUE}GH_DEV_TOKEN${NC}           $(mask "$existing_gh_token")"
    echo -e "  ${BLUE}KODUS_INSTALLER_PATH${NC}   ${existing_installer_path:-${GRAY}(not set)${NC}}"
    echo ""
    exit 0
fi

# ---------- interactive prompts ----------

prompt_secret() {
    local label="$1" current="$2" hint="$3"
    local current_display
    if [ -n "$current" ]; then
        current_display="  (current: $(mask "$current"))"
    fi
    echo "" >&2
    echo -e "${BLUE}${label}${NC}${current_display}" >&2
    [ -n "$hint" ] && dim "  $hint" >&2
    echo -n "  → " >&2
    # -s hides input, but we still want a newline after they hit enter
    local input
    read -rs input
    echo "" >&2
    echo "$input"
}

prompt_plain() {
    local label="$1" current="$2" hint="$3"
    echo "" >&2
    echo -e "${BLUE}${label}${NC}" >&2
    [ -n "$hint" ] && dim "  $hint" >&2
    if [ -n "$current" ]; then
        echo -n "  [$current] → " >&2
    else
        echo -n "  → " >&2
    fi
    local input
    read -r input
    if [ -z "$input" ] && [ -n "$current" ]; then
        echo "$current"
    else
        echo "$input"
    fi
}

cat <<INTRO

$(echo -e "${GREEN}╭─ Kodus self-hosted dev setup ─╮${NC}")

  Saved to $CONFIG_FILE (chmod 600).
  Re-running: press Enter to keep the current value; type to replace it.

INTRO

new_do_token=$(prompt_secret "DigitalOcean API token" "$existing_do_token" \
    "https://cloud.digitalocean.com/account/api — scopes: droplet:create/read/delete + ssh_key:create/read/delete")
if [ -z "$new_do_token" ] && [ -n "$existing_do_token" ]; then
    new_do_token="$existing_do_token"
fi
if [ -z "$new_do_token" ]; then
    warn "DIGITALOCEAN_TOKEN is required (default provider). Aborting."
    exit 1
fi

new_license=$(prompt_secret "Self-hosted license key" "$existing_license" \
    "Optional. Empty = stack boots in the installer's default mode (paid features locked).")
if [ -z "$new_license" ] && [ -n "$existing_license" ]; then
    new_license="$existing_license"
fi

new_gh_token=$(prompt_secret "GitHub dev token (PAT)" "$existing_gh_token" \
    "Optional. If set, up.sh auto-configures the GitHub integration after signup.")
if [ -z "$new_gh_token" ] && [ -n "$existing_gh_token" ]; then
    new_gh_token="$existing_gh_token"
fi

default_installer_path="${existing_installer_path:-$REPO_ROOT/../kodus-installer}"
new_installer_path=$(prompt_plain "Path to kodus-installer checkout" "$default_installer_path" \
    "Where the local installer checkout lives (the script rsyncs it onto the droplet).")
if [ ! -d "$new_installer_path" ]; then
    warn "Directory $new_installer_path does not exist yet. That's fine — up.sh will complain if you try to provision before cloning."
fi

# ---------- write config atomically ----------
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

tmp_file="${CONFIG_FILE}.tmp.$$"
cat > "$tmp_file" <<EOF
# Kodus self-hosted dev config — generated by scripts/selfhosted/setup.sh
# Source via 'set -a; . ~/.kodus-dev/config; set +a' or via direnv .envrc.
# Re-run 'yarn selfhosted:setup' to update.

DIGITALOCEAN_TOKEN=$new_do_token
SH_LICENSE_KEY=$new_license
GH_DEV_TOKEN=$new_gh_token
KODUS_INSTALLER_PATH=$new_installer_path
EOF
chmod 600 "$tmp_file"
mv "$tmp_file" "$CONFIG_FILE"

ok "Saved to $CONFIG_FILE"

# ---------- direnv offer ----------
ENVRC="$REPO_ROOT/.envrc"
if command -v direnv >/dev/null 2>&1; then
    if [ -f "$ENVRC" ]; then
        if grep -q "kodus-dev/config" "$ENVRC" 2>/dev/null; then
            ok "$ENVRC already loads the config (direnv ready)"
        else
            warn "$ENVRC exists but does not load ~/.kodus-dev/config — add it manually if you want auto-load."
        fi
    else
        echo ""
        echo -e "${BLUE}direnv detected.${NC} Create $ENVRC to auto-load this config when you cd into the repo? (y/N): "
        read -r reply
        if [[ "$reply" =~ ^[Yy]$ ]]; then
            cat > "$ENVRC" <<EOF
# Auto-loads Kodus dev config when you cd into this repo.
# Managed by scripts/selfhosted/setup.sh — run it to regenerate.
if [ -f "\$HOME/.kodus-dev/config" ]; then
    dotenv "\$HOME/.kodus-dev/config"
fi
EOF
            ok "$ENVRC created"
            if direnv allow "$REPO_ROOT" 2>/dev/null; then
                ok "direnv allow granted — env will load automatically."
            else
                warn "Run 'direnv allow' manually in the repo to activate."
            fi
        else
            dim "Skipping direnv. You can run 'set -a; . ~/.kodus-dev/config; set +a' manually, or create .envrc later."
        fi
    fi
else
    dim ""
    dim "direnv not detected. Install with 'brew install direnv' for auto-load (optional)."
    dim "Without direnv: scripts/selfhosted/*.sh reads ~/.kodus-dev/config automatically."
fi

cat <<DONE

$(echo -e "${GREEN}Done.${NC}") Next step:

  yarn selfhosted:up

DONE
