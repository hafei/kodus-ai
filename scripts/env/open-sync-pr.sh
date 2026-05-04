#!/usr/bin/env bash
# Opens a PR with the regenerated env file. Called from env-sync-release.yml.
#
# Usage: open-sync-pr.sh <repo-name> <file-path>
# Env:   TAG  — release tag (e.g. v2.1.8)
#        SHA  — kodus-ai commit sha
#        GH_TOKEN — PAT with PR-create on the target repo
#
# Exits 0 (no-op) when there is no drift, so the workflow stays green.

set -euo pipefail

repo="$1"
file="$2"
branch="env-sync/${TAG}"

git config user.name  "kodus-env-sync[bot]"
git config user.email "kodus-env-sync@users.noreply.github.com"

if git diff --quiet -- "$file"; then
    echo "No drift in $repo. Skipping PR."
    exit 0
fi

git checkout -b "$branch"
git add "$file"
git commit -m "chore(env): sync from kodus-ai@${TAG}

Auto-generated from kodus-ai/.env.schema at ${SHA}.
Source: https://github.com/kodustech/kodus-ai/tree/${SHA}/.env.schema"
git push -u origin "$branch"

gh pr create \
    --title "chore(env): sync from kodus-ai@${TAG}" \
    --label automated,env-sync \
    --body "Auto-generated from \`kodus-ai/.env.schema\` at tag \`${TAG}\` ([\`${SHA:0:7}\`](https://github.com/kodustech/kodus-ai/tree/${SHA}/.env.schema)).

Review the diff — added/removed vars and changed defaults reflect schema edits in kodus-ai.

Approve to keep \`${repo}\` in sync with this release cut."
