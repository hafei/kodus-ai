/**
 * Seeds .env.schema.candidate from kodus-installer/.env.example
 * (which already has self-hosted defaults + section structure +
 * inline comments) plus cloud-only vars from kodus-ai/.env.example.
 *
 * The output should be reviewed and either replace .env.schema or
 * be merged with the hand-crafted POC schema.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const INSTALLER = join(REPO_ROOT, '..', 'kodus-installer', '.env.example');
const MAIN = join(REPO_ROOT, '.env.example');
const OUT = join(REPO_ROOT, '.env.schema.candidate');

// Section sub-headers in installer that mark self-host-only territory.
const SELF_HOST_HINTS = [
    'KODUS_SERVICE_AST',
    'MCP Manager',
    'MCP Configuration',
    'RabbitMQ Configuration',
    'Run migrations',
    'Use local containers',
    'Incremental Graph Build',
];

// Var name prefixes that are inherently self-host-only (orchestration).
const SELF_HOST_PREFIX = [
    'AST_',
    'RABBIT_',
    'API_MCP_MANAGER_',
    'API_SERVICE_AST_',
    'API_ENABLE_CODE_REVIEW_AST',
    'API_KODUS_MCP_SERVER_URL',
    'API_KODUS_SERVICE_MCP_MANAGER',
    'API_MCP_SERVER_ENABLED',
    'CONTAINER_NAME',
    'DB_SSL',
    'ENABLE_INCREMENTAL_GRAPH',
    'ENABLE_GRAPH_BENCHMARK',
    'ENABLE_LIGHTWEIGHT_GRAPH',
    'RUN_MIGRATIONS',
    'RUN_SEEDS',
    'USE_LOCAL_DB',
    'USE_LOCAL_RABBITMQ',
    'KODUS_LICENSE_KEY',
];

const SECRET_RE = /(KEY|SECRET|PASSWORD|TOKEN|DSN|CREDENTIAL|PASS$)/;
const PORT_RE = /_PORT$/;
const URL_RE = /_URL$|_URI$|_WEBHOOK$/;
const CRON_RE = /^API_CRON_/;
const BOOL_RE = /^(ENABLE|USE|DISABLE)_|_ENABLED$|_DISABLED$|_TRACING$/;

type Item = {
    name: string;
    value: string;
    description: string;
    sectionMain: string;
    sectionSub: string;
    isSelfHost: boolean;
    inlineComment: string;
};

function categoryFromSection(section: string, sub: string): string {
    const s = (sub || section).toLowerCase();
    if (s.includes('basic')) return 'basic';
    if (s.includes('api configuration') || s.includes('general api')) return 'server';
    if (s.includes('database') || s.includes('postgres') || s.includes('mongo')) return 'database';
    if (s.includes('llm')) return 'llm';
    if (s.includes('cron')) return 'cron';
    if (s.includes('git integration')) return 'git-providers';
    if (s.includes('rabbitmq') || s.includes('queue')) return 'messaging';
    if (s.includes('mcp manager')) return 'mcp-manager';
    if (s.includes('mcp configuration')) return 'mcp';
    if (s.includes('ast')) return 'ast-service';
    if (s.includes('graph')) return 'graph-build';
    if (s.includes('jwt') || s.includes('authentication')) return 'auth';
    if (s.includes('web app')) return 'web';
    if (s.includes('support')) return 'support';
    if (s.includes('migrations') || s.includes('local containers')) return 'orchestration';
    if (s.includes('additional')) return 'integrations';
    return 'misc';
}

function parseInstallerWithStructure(): Item[] {
    const text = readFileSync(INSTALLER, 'utf-8');
    const lines = text.split('\n');
    const items: Item[] = [];
    let sectionMain = '';
    let sectionSub = '';
    let pendingComments: string[] = [];

    for (const raw of lines) {
        const line = raw.trim();

        // Major section header (## ----  TITLE ----)
        const major = line.match(/^##\s*-+\s*(.+?)\s*-+\s*$/);
        if (major) {
            sectionMain = major[1].trim();
            sectionSub = '';
            pendingComments = [];
            continue;
        }

        // Minor sub-header — comment line immediately preceding vars.
        if (line.startsWith('#') && !line.match(/^#\s*[A-Z][A-Z0-9_]*=/)) {
            const text = line.replace(/^#\s*/, '');
            // If looks like a section name (short, no continuation), update sub.
            if (text.length < 60 && !text.includes('.') && !text.includes(',')) {
                sectionSub = text;
            }
            pendingComments.push(text);
            continue;
        }

        if (!line) {
            pendingComments = [];
            continue;
        }

        // Variable line (possibly with inline comment).
        const m = raw.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (!m) continue;
        const name = m[1];
        let rest = m[2];
        let inline = '';
        // Extract inline comment.
        // First strip wrapping quotes around value to make split easier.
        const quoted = rest.match(/^(['"])(.*?)\1\s*(?:#\s*(.*))?$/);
        let value: string;
        if (quoted) {
            value = quoted[2];
            inline = (quoted[3] || '').trim();
        } else {
            const idx = rest.indexOf(' #');
            if (idx >= 0) {
                value = rest.slice(0, idx).trim();
                inline = rest.slice(idx + 2).trim();
            } else {
                value = rest.trim();
            }
        }

        // Use pending comment block as description, fallback to inline.
        const description =
            pendingComments
                .filter((c) => c.length > 3 && !SELF_HOST_HINTS.includes(c))
                .join(' ')
                .slice(0, 200) || inline;

        const isSelfHost =
            SELF_HOST_PREFIX.some((p) => name.startsWith(p)) ||
            SELF_HOST_HINTS.some((h) =>
                (sectionSub + ' ' + sectionMain).includes(h),
            );

        items.push({
            name,
            value,
            description,
            sectionMain,
            sectionSub,
            isSelfHost,
            inlineComment: inline,
        });

        pendingComments = [];
    }
    return items;
}

function parseMainNames(): Map<string, { value: string; comment: string }> {
    const text = readFileSync(MAIN, 'utf-8');
    const out = new Map<string, { value: string; comment: string }>();
    let pending = '';
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('#') && line.length > 2) {
            pending += ' ' + line.replace(/^#\s*/, '');
            continue;
        }
        if (!line) {
            pending = '';
            continue;
        }
        const m = raw.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2];
        const quoted = v.match(/^(['"])(.*?)\1/);
        v = quoted ? quoted[2] : v.replace(/\s+#.*$/, '').trim();
        out.set(m[1], { value: v, comment: pending.trim().slice(0, 200) });
        pending = '';
    }
    return out;
}

function decoratorsFor(name: string, isSecret: boolean): string {
    const decs: string[] = [];
    if (isSecret) decs.push('@sensitive');
    if (PORT_RE.test(name)) decs.push('@type=port');
    else if (URL_RE.test(name)) decs.push('@type=url');
    else if (CRON_RE.test(name)) decs.push('@type=cron');
    else if (BOOL_RE.test(name)) decs.push('@type=boolean');
    return decs.join(' ');
}

function emitItem(
    name: string,
    value: string,
    description: string,
    audience: string,
    installerOverride?: string,
): string[] {
    const isSecret = SECRET_RE.test(name);
    const decs = decoratorsFor(name, isSecret);
    const lines: string[] = [];
    if (description) lines.push(`# ${description}`);
    if (decs) lines.push(`# ${decs}`);
    const kodus = [`audience=${audience}`];
    if (installerOverride !== undefined) {
        kodus.push(`installer-default="${installerOverride}"`);
    }
    lines.push(`# kodus: ${kodus.join(' ')}`);
    const quoted =
        /[\s#"']/.test(value) || (value === '' && audience.includes('cloud'));
    lines.push(`${name}=${quoted ? `"${value}"` : value}`);
    return lines;
}

function main() {
    const installerItems = parseInstallerWithStructure();
    const mainVars = parseMainNames();
    const installerNames = new Set(installerItems.map((it) => it.name));

    const lines: string[] = [];
    lines.push('# Kodus environment schema — single source of truth.');
    lines.push('# AUTO-SEEDED from kodus-installer/.env.example + cloud-only vars from kodus-ai/.env.example.');
    lines.push('# Review & tune. Custom kodus metadata uses # kodus: prefix (invisible to varlock).');
    lines.push('#');
    lines.push('# @defaultRequired=false @defaultSensitive=false');
    lines.push('# ----------');
    lines.push('');

    // Group installer items by section.
    const bySection = new Map<string, Item[]>();
    for (const it of installerItems) {
        const key = it.sectionMain || 'misc';
        if (!bySection.has(key)) bySection.set(key, []);
        bySection.get(key)!.push(it);
    }

    for (const [section, items] of bySection.entries()) {
        const cat = categoryFromSection(section, '');
        lines.push('');
        lines.push('# ============================================================');
        lines.push(`# ${section}`);
        lines.push(`# kodus: category=${cat}`);
        lines.push('# ============================================================');
        for (const it of items) {
            const audience = it.isSelfHost ? 'self-hosted' : 'both';
            const mainV = mainVars.get(it.name)?.value;
            const installerOverride =
                mainV !== undefined && mainV !== it.value ? it.value : undefined;
            // When audience=both and main differs from installer, preserve both.
            const value = audience === 'both' ? (mainV ?? it.value) : it.value;
            lines.push('');
            lines.push(...emitItem(it.name, value, it.description, audience, installerOverride));
        }
    }

    // Append cloud-only vars (in main but not in installer).
    const cloudOnly = [...mainVars.entries()].filter(
        ([name]) => !installerNames.has(name),
    );
    if (cloudOnly.length > 0) {
        lines.push('');
        lines.push('# ============================================================');
        lines.push('# Cloud-only (not in installer template)');
        lines.push('# kodus: category=cloud-only');
        lines.push('# ============================================================');
        for (const [name, info] of cloudOnly) {
            lines.push('');
            lines.push(...emitItem(name, info.value, info.comment, 'cloud'));
        }
    }

    writeFileSync(OUT, lines.join('\n') + '\n');

    console.log(`Wrote ${OUT}`);
    console.log(`  installer-derived: ${installerItems.length} vars`);
    console.log(`  cloud-only (in main, not installer): ${cloudOnly.length} vars`);
    console.log(`  total: ${installerItems.length + cloudOnly.length} vars`);
}

main();
