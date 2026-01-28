#!/bin/sh
set -e # Exit immediately if a command exits with a non-zero status

echo "▶ Starting deployment entrypoint..."

# ----------------------------------------------------------------
# Auto-tune Node.js Memory based on Container Limits
# ----------------------------------------------------------------
# If max-old-space-size is not explicitly set in NODE_OPTIONS,
# calculate it as 85% of the container's memory limit.
# ----------------------------------------------------------------
if ! echo "$NODE_OPTIONS" | grep -q "max-old-space-size"; then
    # Detect memory limit from Cgroups (v1 or v2)
    if [ -f /sys/fs/cgroup/memory.max ]; then
        MEM_BYTES=$(cat /sys/fs/cgroup/memory.max)
    elif [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
        MEM_BYTES=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
    fi

    # Check if limit is a valid number (not 'max' or extremely large)
    if [ "$MEM_BYTES" != "" ] && [ "$MEM_BYTES" != "max" ] && [ "$MEM_BYTES" -lt 9223372036854771712 ] 2>/dev/null; then
        MEM_MB=$((MEM_BYTES / 1024 / 1024))
        # Set heap to 85% of total RAM
        CALCULATED_HEAP=$((MEM_MB * 85 / 100))
        export NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=$CALCULATED_HEAP"
        echo "  - Memory Auto-tune: Detected ${MEM_MB}MB. Setting --max-old-space-size=${CALCULATED_HEAP}"
    else
        echo "  - Memory Auto-tune: No container limit detected. Using Node.js defaults."
    fi
fi

# ----------------------------------------------------------------
# Dynamic Environment Configuration
# ----------------------------------------------------------------
# Generates the environment.js file at runtime based on ENV vars.
# This allows changing CLOUD_MODE/DEV_MODE without rebuilding the image.
# ----------------------------------------------------------------

CLOUD_MODE=${API_CLOUD_MODE:-false}
DEV_MODE=${API_DEVELOPMENT_MODE:-false}

echo "▶ Configuring Environment..."
echo "  - API_CLOUD_MODE: $CLOUD_MODE"
echo "  - API_DEVELOPMENT_MODE: $DEV_MODE"

# Create the JS content
# We use a temporary file first
cat <<EOF > /tmp/env_config.js
Object.defineProperty(exports, "__esModule", { value: true });
exports.environment = {
    API_CLOUD_MODE: ${CLOUD_MODE},
    API_DEVELOPMENT_MODE: ${DEV_MODE},
};
EOF

# Distribute the config file to potential locations where the app might look for it.
# We search for any directory named "environment" inside dist and drop the config there.
# This covers:
# - dist/libs/ee/configs/environment (Standard Monorepo)
# - dist/apps/worker/libs/ee/configs/environment (App-specific build)
# - dist/apps/api/libs/ee/configs/environment (App-specific build)

echo "▶ Distributing environment config..."
find ./dist -type d -name "environment" 2>/dev/null | while read dir; do
    echo "  - Writing to $dir/environment.js"
    cp /tmp/env_config.js "$dir/environment.js"
done

# Also put in apps root for good measure (for Webpack bundles if any remain or flatten structure)
for app_dir in ./dist/apps/*; do
    if [ -d "$app_dir" ]; then
        # Check if it's not already covered (avoid overwriting if 'libs' exists inside)
        if [ ! -d "$app_dir/libs" ]; then
             echo "  - Writing to $app_dir/environment.js (Bundle fallback)"
             cp /tmp/env_config.js "$app_dir/environment.js"
        fi
    fi
done


# ----------------------------------------------------------------
# Standard Startup
# ----------------------------------------------------------------

RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"
RUN_SEEDS="${RUN_SEEDS:-false}"

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "▶ Running Migrations (PROD)..."
  # Use node with compiled migrations in prod
  if [ -f "dist/libs/core/infrastructure/database/typeorm/ormconfig.js" ]; then
      yarn migration:run:prod
  else
      echo "⚠️ Migration config not found at dist/libs/core/infrastructure/database/typeorm/ormconfig.js. Skipping."
  fi
else
  echo "▶ Skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

if [ "$RUN_SEEDS" = "true" ]; then
  echo "▶ Running Seeds (PROD)..."
  # Seeds might also need a prod version if they rely on TS
  yarn seed:prod
else
  echo "▶ Skipping seeds (RUN_SEEDS=$RUN_SEEDS)"
fi

echo "▶ Starting Application..."
# exec "$@" executes the CMD defined in the Dockerfile (pm2-runtime ...)
exec "$@"
