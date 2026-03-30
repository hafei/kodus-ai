#!/bin/bash
#
# Step 1: Create benchmark PRs
#
# Usage:
#   ./benchmark-create.sh <name> [TOTAL_PRS]
#
# Examples:
#   ./benchmark-create.sh sonnet-v1 20
#   ./benchmark-create.sh kimi-baseline 50
#   ./benchmark-create.sh test-run        # default: 20 PRs
#
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./benchmark-create.sh <name> [TOTAL_PRS]"
  echo ""
  echo "Examples:"
  echo "  ./benchmark-create.sh sonnet-v1 20"
  echo "  ./benchmark-create.sh kimi-baseline"
  echo ""
  # List existing runs
  RUNS_DIR="$(cd "$(dirname "$0")" && pwd)/runs"
  if [ -d "$RUNS_DIR" ] && [ "$(ls -A "$RUNS_DIR" 2>/dev/null)" ]; then
    echo "Existing runs:"
    for f in "$RUNS_DIR"/*.json; do
      NAME=$(basename "$f" .json)
      PRS=$(node -e "const d=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log(d.prs.length + ' PRs, created ' + d.created)" 2>/dev/null || echo "?")
      echo "  $NAME — $PRS"
    done
  fi
  exit 1
fi

RUN_NAME="$1"
TOTAL_PRS=${2:-20}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNS_DIR="$SCRIPT_DIR/runs"
mkdir -p "$RUNS_DIR"
WORKER=$(docker ps --format '{{.Names}}' | grep worker | head -1)

echo "============================================================"
echo "Benchmark — Create PRs"
echo "============================================================"
echo "Run: $RUN_NAME | PRs: $TOTAL_PRS"
echo ""

# Clean pipeline + MongoDB benchmark PRs
echo "▸ Cleaning pipeline..."
docker exec db_postgres psql -U kodusdev -d kodus_db -c \
  "DELETE FROM kodus_workflow.inbox_messages WHERE status = 'PROCESSING';" -q 2>/dev/null || true
docker exec db_postgres psql -U kodusdev -d kodus_db -c \
  "DELETE FROM kodus_workflow.outbox_messages WHERE status IN ('READY','PROCESSING','FAILED');" -q 2>/dev/null || true
docker exec rabbitmq rabbitmqctl purge_queue -p kodus-ai workflow.jobs.code_review.queue 2>/dev/null || true
docker exec rabbitmq rabbitmqctl purge_queue -p kodus-ai workflow.jobs.webhook.queue 2>/dev/null || true

# Delete ALL PRs from MongoDB to avoid stale data matching
DELETED=$(docker exec mongodb mongosh -u kodusdev -p 123456 --authenticationDatabase admin kodus_db --quiet --eval \
  "var r = db.pullRequests.deleteMany({}); print(r.deletedCount)" 2>/dev/null || echo 0)
echo "  ✓ Pipeline cleaned (removed $DELETED PRs from MongoDB)"

# Restart worker
echo "▸ Restarting worker..."
docker exec $WORKER rm -rf /usr/src/app/node_modules/.cache/webpack 2>/dev/null || true
docker restart $WORKER > /dev/null 2>&1
sleep 25
COMPILED=$(docker logs $WORKER 2>&1 | grep "compiled" | tail -1)
if echo "$COMPILED" | grep -q "successfully"; then
  echo "  ✓ Worker compiled successfully"
else
  echo "  ✗ Worker compilation failed"
  exit 1
fi

# Close ALL open PRs in benchmark repos first
echo "▸ Closing all open PRs..."
for repo in sentry grafana-codex discourse-cursor cal.com keycloak; do
  OPEN_PRS=$(gh api "repos/ai-code-review-benchmark/$repo/pulls?state=open&per_page=100" --jq '.[].number' 2>/dev/null || true)
  for pr in $OPEN_PRS; do
    gh api "repos/ai-code-review-benchmark/$repo/pulls/$pr" -X PATCH -f state=closed --silent 2>/dev/null || true
  done
  COUNT=$(echo "$OPEN_PRS" | grep -c '[0-9]' 2>/dev/null || echo 0)
  [ "$COUNT" -gt 0 ] && echo "  $repo: closed $COUNT PRs"
done
echo "  ✓ All PRs closed"

# Create PRs
echo "▸ Creating $TOTAL_PRS PRs..."
cd "$REPO_DIR/scripts/pr-creator"
RESULT=$(GITHUB_TOKEN=$(gh auth token) TOTAL_PRS=$TOTAL_PRS node create-test-prs.mjs 2>&1)
CREATED=$(echo "$RESULT" | grep "Total:" | grep -o "[0-9]*")
echo "$RESULT" | grep "✅"
echo ""
echo "  ✓ Created $CREATED PRs"

# Save run manifest — use prs.json (source of truth for repo names) + benchmark golden
cd "$REPO_DIR"
echo "▸ Building run manifest..."
node -e "
const fs = require('fs');
const prsConfig = JSON.parse(fs.readFileSync('scripts/pr-creator/prs.json', 'utf8'));
const benchmark = JSON.parse(fs.readFileSync('scripts/benchmark/prs-benchmark.json', 'utf8'));
const totalPrs = $TOTAL_PRS;

// prs.json has the actual repos (Wellington01/sentry-greptile)
const sourcePrs = Array.isArray(prsConfig) ? prsConfig : prsConfig.prs;

// Group by repo and distribute evenly (same logic as create-test-prs.mjs)
const byRepo = {};
for (const pr of sourcePrs) {
  const repo = pr.repo;
  if (!byRepo[repo]) byRepo[repo] = [];
  byRepo[repo].push(pr);
}
const repos = Object.keys(byRepo);
const perRepo = Math.ceil(totalPrs / repos.length);
const selected = [];
for (const repo of repos) {
  selected.push(...byRepo[repo].slice(0, perRepo));
}
// Trim to exact totalPrs
selected.splice(totalPrs);

const prs = [];
for (const pr of selected) {
  // Find golden comments by matching branch name
  const golden = benchmark.prs.find(b => b.head === pr.head);
  prs.push({
    head: pr.head,
    base: pr.base || 'main',
    title: pr.title || golden?.title || pr.head,
    goldenCount: golden ? golden.golden_comments.length : 0,
  });
  const gInfo = golden ? golden.golden_comments.length + ' golden' : 'NO GOLDEN';
  console.log('  ' + pr.head.substring(0,45).padEnd(47) + gInfo);
}

const manifest = {
  name: '$RUN_NAME',
  created: new Date().toISOString(),
  totalPrs: totalPrs,
  prs,
};

fs.writeFileSync('$RUNS_DIR/$RUN_NAME.json', JSON.stringify(manifest, null, 2));
console.log('');
console.log('Manifest: scripts/benchmark/runs/$RUN_NAME.json (' + prs.length + ' PRs)');
"

echo ""
echo "Wait for reviews to finish, then run:"
echo "  ./scripts/benchmark/benchmark-evaluate.sh $RUN_NAME"
echo ""
echo "Check progress with:"
echo "  docker logs $WORKER --since 30s 2>&1 | grep -c AGENT"
