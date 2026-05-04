/**
 * Generates poc-env/review.md — a slim, per-category checklist for
 * classifying each env var. Replaces the noisy CSV for human review.
 *
 * Format per row:
 *   - [x] VAR_NAME    [proposal]    hints    # description
 *
 * Proposal nomenclature (edit between the brackets to override):
 *   cloud         only in kodus-ai/.env.example (cloud-only)
 *   self-host     only in kodus-installer/.env.example
 *   both/active   in both templates, present and active in installer
 *   both/opt-in   in both templates, commented in installer (uncomment to use)
 *   dead          remove — schema does not include it
 *
 * Hints the script auto-fills: sensitive, used/unused, port/url/cron/bool/number.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { flatten, parseSchema, SchemaItem } from './parse-schema';

const REPO_ROOT = join(__dirname, '..', '..');
const OUT = join(REPO_ROOT, 'poc-env', 'review.md');

const SECRET_RE = /(KEY|SECRET|PASSWORD|TOKEN|DSN|CREDENTIAL|PASS$)/;
const PORT_RE = /_PORT$/;
const URL_RE = /_URL$|_URI$|_WEBHOOK$/;
const CRON_RE = /^API_CRON_/;
const BOOL_RE = /^(ENABLE|USE|DISABLE)_|_ENABLED$|_DISABLED$|_TRACING$/;
const ANALYTICS_RE = /^ANALYTICS_|_ANALYTICS_/;
const MCP_RE = /^API_MCP_MANAGER_/;
const AST_RE = /^AST_|_AST_/;
const RABBIT_RE = /^RABBIT|^WORKFLOW_/;
const WEB_RE = /^WEB_/;

type Source = {
    main: Set<string>;
    installer: Set<string>;
    local: Set<string>;
    used: Set<string>;
    schema: Map<string, SchemaItem>;
};

function parseEnv(path: string): Set<string> {
    if (!existsSync(path)) return new Set();
    const text = readFileSync(path, 'utf-8');
    const out = new Set<string>();
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
        if (m) out.add(m[1]);
    }
    return out;
}

function grepUsage(): Set<string> {
    const patterns = [
        String.raw`process\.env\.([A-Z][A-Z0-9_]+)`,
        String.raw`\benv\.([A-Z][A-Z0-9_]+)`,
        String.raw`['"]([A-Z][A-Z0-9_]{4,})['"]`,
    ];
    const args = [
        '-rohE',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude-dir=build',
        '--exclude-dir=.next',
        '--exclude-dir=.cache',
        '--exclude-dir=.git',
        '--exclude-dir=poc-env',
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.js',
        '--include=*.json',
        '--include=*.yml',
        '--include=*.yaml',
        '--include=*.sh',
    ];
    const found = new Set<string>();
    for (const p of patterns) {
        const r = spawnSync('grep', [...args, p, '.'], {
            cwd: REPO_ROOT,
            encoding: 'utf-8',
            maxBuffer: 128 * 1024 * 1024,
        });
        for (const line of (r.stdout || '').split('\n')) {
            const m = line.match(/([A-Z][A-Z0-9_]+)/);
            if (m) found.add(m[1]);
        }
    }
    return found;
}

function loadSources(): Source {
    const schemaItems = flatten(parseSchema(join(REPO_ROOT, '.env.schema')));
    const schema = new Map<string, SchemaItem>();
    for (const it of schemaItems) schema.set(it.name, it);
    return {
        main: parseEnv(join(REPO_ROOT, '.env.example')),
        installer: parseEnv(
            join(REPO_ROOT, '..', 'kodus-installer', '.env.example'),
        ),
        local: parseEnv(join(REPO_ROOT, '.env')),
        used: grepUsage(),
        schema,
    };
}

function inferCategory(name: string, schema: SchemaItem | undefined): string {
    if (schema) return schema.category;
    if (ANALYTICS_RE.test(name)) return 'analytics-warehouse';
    if (MCP_RE.test(name)) return 'mcp-manager';
    if (AST_RE.test(name)) return 'ast-service';
    if (RABBIT_RE.test(name)) return 'messaging';
    if (CRON_RE.test(name)) return 'cron';
    if (/BETTERSTACK/.test(name)) return 'observability';
    if (/^METRICS_|^WEBHOOK_FAILURE/.test(name)) return 'observability';
    if (/^API_DOCS_/.test(name)) return 'api-docs';
    if (WEB_RE.test(name)) return 'web';
    if (/POSTHOG|LANGFUSE|SENTRY|PYROSCOPE/.test(name)) return 'observability';
    if (/GITHUB|GITLAB|BITBUCKET|AZURE|FORGEJO/.test(name))
        return 'git-providers';
    if (/OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|VERTEX|GROQ|NOVITA|CEREBRAS|OPENROUTER|MORPHLLM|LLM/.test(name))
        return 'llm';
    if (/PG_DB|MG_DB|DATABASE|MONGODB/.test(name)) return 'database';
    if (/JWT|CRYPTO|NEXTAUTH/.test(name)) return 'auth';
    if (/AWS|S3/.test(name)) return 'storage';
    if (/RESEND|EMAIL/.test(name)) return 'email';
    if (/SANDBOX|E2B/.test(name)) return 'sandbox';
    return 'misc';
}

function inferProposal(name: string, src: Source): string {
    const sch = src.schema.get(name);
    if (sch) {
        if (sch.audience.includes('cloud') && !sch.audience.includes('both'))
            return 'cloud';
        if (
            sch.audience.includes('self-hosted') &&
            !sch.audience.includes('both')
        )
            return 'self-host';
        return sch.installerComment ? 'both/opt-in' : 'both/active';
    }
    // Not in schema yet — guess from sources.
    if (src.main.has(name) && !src.used.has(name) && !src.installer.has(name))
        return 'dead';
    if (src.used.has(name) && src.main.has(name))
        return 'both/active'; // safe default — change if cloud-only
    if (src.main.has(name)) return 'both/active';
    if (src.installer.has(name)) return 'self-host';
    return 'dead';
}

function hints(name: string, src: Source): string[] {
    const h: string[] = [];
    if (SECRET_RE.test(name)) h.push('secret');
    if (PORT_RE.test(name)) h.push('port');
    if (URL_RE.test(name)) h.push('url');
    if (CRON_RE.test(name)) h.push('cron');
    if (BOOL_RE.test(name)) h.push('bool');
    if (!src.used.has(name)) h.push('NOT-IN-CODE');
    return h;
}

function presence(name: string, src: Source): string {
    const p: string[] = [];
    if (src.main.has(name)) p.push('main');
    if (src.installer.has(name)) p.push('inst');
    if (src.local.has(name)) p.push('local');
    return p.join('+') || '—';
}

function description(name: string, src: Source): string {
    const sch = src.schema.get(name);
    return (sch?.description ?? []).join(' ').slice(0, 80);
}

function main() {
    const src = loadSources();
    const all = new Set<string>([
        ...src.main,
        ...src.installer,
        ...src.local,
        ...src.schema.keys(),
    ]);

    type Row = { name: string; proposal: string; hints: string[]; presence: string; description: string; category: string };
    const rows: Row[] = [];
    for (const name of all) {
        rows.push({
            name,
            proposal: inferProposal(name, src),
            hints: hints(name, src),
            presence: presence(name, src),
            description: description(name, src),
            category: inferCategory(name, src.schema.get(name)),
        });
    }

    // Group by category.
    const byCat = new Map<string, Row[]>();
    for (const r of rows) {
        if (!byCat.has(r.category)) byCat.set(r.category, []);
        byCat.get(r.category)!.push(r);
    }
    for (const arr of byCat.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    // Order categories by importance for review.
    const catOrder = [
        'basic', 'server', 'auth', 'database', 'messaging', 'messaging-tuning',
        'llm', 'git-providers', 'observability',
        'analytics-warehouse', 'mcp-manager', 'ast-service',
        'sandbox', 'storage', 'email', 'cron', 'api-docs',
        'web', 'support', 'misc',
    ];
    const cats = [...byCat.keys()].sort((a, b) => {
        const ia = catOrder.indexOf(a);
        const ib = catOrder.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const lines: string[] = [];
    lines.push('# Env vars classification — review checklist');
    lines.push('');
    lines.push(`Total: ${rows.length} vars across ${cats.length} categories.`);
    lines.push('');
    lines.push('## How to use');
    lines.push('');
    lines.push('Each row already has my **best-guess proposal** in `[brackets]`.');
    lines.push('Just edit between the brackets if you disagree. Then check the box `[x]`.');
    lines.push('');
    lines.push('### Proposal vocabulary');
    lines.push('');
    lines.push('| value | meaning |');
    lines.push('| --- | --- |');
    lines.push('| `cloud`        | only ships in `kodus-ai/.env.example` (Kodus team / cloud) |');
    lines.push('| `self-host`    | only ships in `kodus-installer/.env.example` |');
    lines.push('| `both/active`  | in both, **active** in the installer (user fills in) |');
    lines.push('| `both/opt-in`  | in both, **commented** in installer (user uncomments to use) |');
    lines.push('| `dead`         | not used anywhere → remove from schema entirely |');
    lines.push('');
    lines.push('### Row legend');
    lines.push('');
    lines.push('```');
    lines.push('- [ ] VAR_NAME  [proposal]  presence  hints  # short description');
    lines.push('       │         │           │         │');
    lines.push('       │         │           │         └── secret/port/url/cron/bool/NOT-IN-CODE');
    lines.push('       │         │           └── main+inst+local (where the var exists today)');
    lines.push('       │         └── EDIT THIS if you disagree');
    lines.push('       └── check when reviewed');
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Stats summary up top.
    const proposalCounts = new Map<string, number>();
    for (const r of rows) proposalCounts.set(r.proposal, (proposalCounts.get(r.proposal) ?? 0) + 1);
    lines.push('## Quick stats');
    lines.push('');
    for (const [k, v] of [...proposalCounts.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`- **${k}**: ${v}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Section per category.
    for (const cat of cats) {
        const items = byCat.get(cat)!;
        lines.push(`## ${cat} (${items.length})`);
        lines.push('');
        for (const r of items) {
            const hintStr = r.hints.length ? ` _(${r.hints.join(', ')})_` : '';
            const desc = r.description ? `  # ${r.description}` : '';
            const namePadded = r.name.padEnd(46);
            lines.push(`- [ ] \`${namePadded}\` \`[${r.proposal}]\` _${r.presence}_${hintStr}${desc}`);
        }
        lines.push('');
    }

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join('\n') + '\n');

    console.log(`Wrote ${rows.length} vars across ${cats.length} categories to ${OUT}`);
    console.log('');
    console.log('Proposal distribution:');
    for (const [k, v] of [...proposalCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${k.padEnd(14)} ${v}`);
    }
}

main();
