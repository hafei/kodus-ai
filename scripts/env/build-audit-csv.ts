/**
 * Builds poc-env/audit.csv — one row per var across all sources.
 * Use this to drive the classification decisions for the schema.
 *
 * Sources:
 *   - kodus-ai/.env.example          (master template)
 *   - kodus-ai/.env                  (your local dev values)
 *   - kodus-installer/.env.example   (self-hosted user template)
 *   - kodus-ai/.env.schema           (current best-guess classification)
 *   - codebase grep for process.env.* (detect dead vars)
 *
 * Secret values are NEVER printed — only "set" / "empty" indicators.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { flatten, parseSchema, SchemaItem } from './parse-schema';

const REPO_ROOT = join(__dirname, '..', '..');
const OUT_PATH = join(REPO_ROOT, 'poc-env', 'audit.csv');

const SECRET_NAME_RE = /(KEY|SECRET|PASSWORD|TOKEN|DSN|CREDENTIAL)/;

type EnvFile = Map<string, string>;

function parseEnvFile(path: string): EnvFile {
    const out: EnvFile = new Map();
    if (!existsSync(path)) return out;
    const text = readFileSync(path, 'utf-8');
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (!m) continue;
        let value = m[2];
        // Strip inline comments unless the value is quoted.
        if (!/^["']/.test(value)) {
            value = value.replace(/\s+#.*$/, '');
        }
        // Strip wrapping quotes.
        value = value.trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out.set(m[1], value);
    }
    return out;
}

function grepUsage(): Set<string> {
    // Detect var usage across the whole repo (excluding dist/build/node_modules).
    //
    // We use 3 patterns: (1) process.env.X, (2) env.X destructured access,
    // (3) any quoted string literal that LOOKS like an env var name.
    // The last pattern is over-broad on purpose — it will pick up enum
    // members, log keys, etc. — but the alternative (tightly scoping by
    // call-site) misses too much because the codebase uses ConfigService,
    // Joi schemas, and several wrapper functions.
    //
    // CONSEQUENCE: the "used_in_code" column is HIGH RECALL, low precision.
    // A "Y" almost certainly means used; an "N" means "we couldn't find
    // it anywhere — verify manually before deleting."
    const patterns = [
        String.raw`process\.env\.([A-Z][A-Z0-9_]+)`,
        String.raw`\benv\.([A-Z][A-Z0-9_]+)`,
        String.raw`['"]([A-Z][A-Z0-9_]{4,})['"]`,
    ];
    const grepArgs = [
        '-rohE',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude-dir=build',
        '--exclude-dir=.next',
        '--exclude-dir=.cache',
        '--exclude-dir=.git',
        '--exclude-dir=poc-env',
        '--exclude-dir=.poc-env',
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.js',
        '--include=*.mjs',
        '--include=*.json',
        '--include=*.yml',
        '--include=*.yaml',
        '--include=Dockerfile*',
        '--include=*.sh',
    ];

    const found = new Set<string>();
    for (const pattern of patterns) {
        const result = spawnSync(
            'grep',
            [...grepArgs, pattern, '.'],
            {
                cwd: REPO_ROOT,
                encoding: 'utf-8',
                maxBuffer: 128 * 1024 * 1024,
            },
        );
        const text = result.stdout || '';
        for (const line of text.split('\n')) {
            const m = line.match(/([A-Z][A-Z0-9_]+)/);
            if (m) found.add(m[1]);
        }
    }
    return found;
}

function describeValue(value: string | undefined, isSensitive: boolean): string {
    if (value === undefined) return '';
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '""' || trimmed === "''") return '(empty)';
    if (isSensitive) return '••••• (set)';
    // Truncate long values; CSV safety.
    if (trimmed.length > 60) return trimmed.slice(0, 57) + '...';
    return trimmed;
}

function csvEscape(s: string): string {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function main() {
    const mainEnv = parseEnvFile(join(REPO_ROOT, '.env.example'));
    const localEnv = parseEnvFile(join(REPO_ROOT, '.env'));
    const installerEnv = parseEnvFile(
        join(REPO_ROOT, '..', 'kodus-installer', '.env.example'),
    );
    const usedInCode = grepUsage();

    const schemaSections = parseSchema(join(REPO_ROOT, '.env.schema'));
    const schemaItems = flatten(schemaSections);
    const schemaByName = new Map<string, SchemaItem>();
    for (const it of schemaItems) schemaByName.set(it.name, it);

    // Union of all known var names.
    const all = new Set<string>([
        ...mainEnv.keys(),
        ...localEnv.keys(),
        ...installerEnv.keys(),
        ...schemaByName.keys(),
        ...usedInCode,
    ]);

    // Sort: by section/category from schema first, then alphabetical.
    const sorted = [...all].sort((a, b) => {
        const sa = schemaByName.get(a);
        const sb = schemaByName.get(b);
        const ka = sa ? `${sa.category}|${a}` : `zz-unclassified|${a}`;
        const kb = sb ? `${sb.category}|${b}` : `zz-unclassified|${b}`;
        return ka.localeCompare(kb);
    });

    const headers = [
        'var_name',
        'category',
        'in_main_example',
        'in_installer_example',
        'in_my_local_env',
        'used_in_code',
        'main_default',
        'installer_default',
        'local_value',
        'current_audience',
        'current_required',
        'current_sensitive',
        'current_installer_comment',
        'description',
        '— review below —',
        'proposed_audience',
        'proposed_required',
        'proposed_sensitive',
        'proposed_installer_comment',
        'proposed_installer_default',
        'notes',
        'reviewed',
    ];

    const rows: string[] = [headers.map(csvEscape).join(',')];

    for (const name of sorted) {
        const sch = schemaByName.get(name);
        const isSensitive =
            sch?.sensitive ?? SECRET_NAME_RE.test(name);

        const mainValue = mainEnv.get(name);
        const installerValue = installerEnv.get(name);
        const localValue = localEnv.get(name);

        const flags: string[] = [];
        if (mainEnv.has(name) && !installerEnv.has(name) && !sch) {
            flags.push('drift: in main, not in installer');
        }
        if (installerEnv.has(name) && !mainEnv.has(name) && !sch) {
            flags.push('drift: in installer, not in main');
        }
        if (
            mainEnv.has(name) &&
            !usedInCode.has(name) &&
            !name.startsWith('WEB_') &&
            !name.startsWith('GLOBAL_') &&
            !name.startsWith('RABBITMQ_') &&
            !name.startsWith('AST_') &&
            !name.startsWith('NEXTAUTH_') &&
            !name.startsWith('GITHUB_') &&
            !name.startsWith('GEMINI_') &&
            !name.startsWith('CI') &&
            !name.startsWith('NODE_ENV') &&
            !name.startsWith('PYROSCOPE_') &&
            !name.startsWith('LANGFUSE_') &&
            !name.startsWith('LOG_LEVEL') &&
            !name.startsWith('MONGODB_') &&
            !name.startsWith('DATABASE_') &&
            !name.startsWith('SENTRY_') &&
            !name.startsWith('RESEND_') &&
            !name.startsWith('GOOGLE_') &&
            !name.startsWith('RELEASE_')
        ) {
            flags.push('not detected — verify manually before deleting');
        }

        const row = [
            name,
            sch?.category ?? '',
            mainEnv.has(name) ? 'Y' : '',
            installerEnv.has(name) ? 'Y' : '',
            localEnv.has(name) ? 'Y' : '',
            usedInCode.has(name) ? 'Y' : 'N',
            describeValue(mainValue, isSensitive),
            describeValue(installerValue, isSensitive),
            describeValue(localValue, isSensitive),
            sch?.audience.join('+') ?? '',
            sch?.required ? 'Y' : '',
            sch?.sensitive ? 'Y' : '',
            sch?.installerComment ? 'Y' : '',
            (sch?.description ?? []).join(' '),
            '',
            '',
            '',
            '',
            '',
            '',
            flags.join('; '),
            '',
        ];

        rows.push(row.map(csvEscape).join(','));
    }

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, rows.join('\n') + '\n');

    // Filtered: only vars present in at least one of the templates / local / schema.
    // Drops ~337 standard Node/tooling vars that show up only via process.env grep.
    const actionableHeader = rows[0];
    const actionableRows = rows.slice(1).filter((r) => {
        const cols = r.split(',');
        const inMain = cols[2];
        const inInstaller = cols[3];
        const inLocal = cols[4];
        const audience = cols[9];
        return inMain === 'Y' || inInstaller === 'Y' || inLocal === 'Y' || audience !== '';
    });
    const ACTIONABLE_PATH = OUT_PATH.replace(/\.csv$/, '-actionable.csv');
    writeFileSync(
        ACTIONABLE_PATH,
        [actionableHeader, ...actionableRows].join('\n') + '\n',
    );

    console.log(`Wrote ${rows.length - 1} vars to ${OUT_PATH}`);
    console.log(
        `Wrote ${actionableRows.length} actionable vars to ${ACTIONABLE_PATH}`,
    );
    console.log('');
    console.log('Source coverage:');
    console.log(`  main .env.example       : ${mainEnv.size} vars`);
    console.log(`  installer .env.example  : ${installerEnv.size} vars`);
    console.log(`  your .env (local)       : ${localEnv.size} vars`);
    console.log(`  .env.schema (current)   : ${schemaByName.size} vars`);
    console.log(`  process.env.* in code   : ${usedInCode.size} unique vars`);
    console.log(`  union (rows in CSV)     : ${all.size} vars`);
}

main();
