/**
 * CI guard: regenerate from schema and fail if any committed target file
 * has drifted. Run with `yarn env:check`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(__dirname, '..', '..');

type Target = { name: string; generated: string; committed: string };

const tmp = mkdtempSync(join(tmpdir(), 'kodus-env-drift-'));

execSync(`ts-node ${join(__dirname, 'generate.ts')}`, {
    cwd: REPO_ROOT,
    env: { ...process.env, KODUS_ENV_OUT_DIR: tmp },
    stdio: 'inherit',
});

const targets: Target[] = [
    {
        name: 'kodus-ai/.env.example',
        generated: join(REPO_ROOT, 'poc-env', 'kodus-ai.env.example'),
        committed: join(REPO_ROOT, '.env.example'),
    },
    {
        name: 'kodus-installer/.env.example',
        generated: join(REPO_ROOT, 'poc-env', 'kodus-installer.env.example'),
        committed: join(REPO_ROOT, '..', 'kodus-installer', '.env.example'),
    },
];

let drifted = 0;
for (const t of targets) {
    if (!existsSync(t.committed)) {
        console.error(`MISSING: ${t.committed}`);
        drifted += 1;
        continue;
    }
    const gen = readFileSync(t.generated, 'utf-8');
    const com = readFileSync(t.committed, 'utf-8');
    if (gen.trim() !== com.trim()) {
        console.error(`DRIFT: ${t.name}`);
        drifted += 1;
    } else {
        console.log(`OK:    ${t.name}`);
    }
}

if (drifted > 0) {
    console.error(
        `\n${drifted} target(s) drifted from .env.schema. Run \`yarn env:apply\` and commit.`,
    );
    process.exit(1);
}
console.log(`\nAll targets in sync with .env.schema.`);
