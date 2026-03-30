import { createLogger } from '@kodus/flow';
import { RemoteCommands } from '../adapters/services/collectCrossFileContexts.service';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('CallGraphHelper');
const MAX_CALLGRAPH_CHARS = 6000;
const MAX_CHANGED_FILES = 15;
const MAX_FUNCTIONS_PER_FILE = 15;
const MAX_CALLERS_PER_FUNCTION = 4;

const NOISE_NAMES = new Set([
    'if', 'for', 'while', 'return', 'new', 'var', 'let', 'const',
    'get', 'set', 'run', 'main', 'init', 'test', 'string', 'bool',
    'int', 'uint', 'error', 'nil', 'null', 'void', 'self', 'this',
    'super', 'type', 'interface', 'struct', 'enum', 'module', 'package',
    'import', 'from', 'with', 'True', 'False', 'action', 'create',
    'delete', 'update', 'read', 'write', 'close', 'open', 'start',
    'stop', 'send', 'handle', 'process', 'execute', 'apply', 'call',
    'toString', 'equals', 'hashCode', 'valueOf', 'authenticate',
    'configure', 'validate', 'render', 'display', 'show', 'hide',
]);

const NAME_PATTERNS: RegExp[] = [
    /func\s*\([^)]+\)\s+(\w+)\s*\(/,
    /(?:def |func |fn |function |class )\s*(\w+)/,
    /(?:public|private|protected)\s+(?:static\s+)?(?:abstract\s+)?(?:async\s+)?(?:override\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/,
    /export\s+(?:default\s+)?(?:function|class|const)\s+(\w+)/,
];

const DEFINITION_PATTERN =
    /^\s*(def |func |fn |function |class |public |private |protected |interface |abstract |override |export (function|class|const))/;

// Map repo name variants to callgraph directory names
const REPO_NAME_MAP: Record<string, string> = {
    'sentry': 'sentry',
    'sentry-greptile': 'sentry',
    'grafana': 'grafana',
    'grafana-codex': 'grafana',
    'grafana-greptile': 'grafana',
    'discourse': 'discourse',
    'discourse-cursor': 'discourse',
    'discourse-greptile': 'discourse',
    'cal.com': 'calcom',
    'calcom': 'calcom',
    'cal-com': 'calcom',
    'keycloak': 'keycloak',
    'keycloak-greptile': 'keycloak',
};

interface CallGraphEntry {
    name: string;        // qualified: "OrganizationAuditLogsEndpoint.get"
    short_name: string;  // "get"
    parent: string;      // "OrganizationAuditLogsEndpoint"
    file: string;
    line: number;
    language: string;
    callers: Array<{
        file: string;
        line: number;
        name?: string;       // qualified caller name
        caller_file?: string;
    }>;
    callees?: Array<{        // what this function calls (outbound calls)
        name: string;
        file: string;
        line: number;
    }>;
}

type CallGraphData = Record<string, CallGraphEntry>;

// Cache loaded JSON to avoid re-reading per PR
const astCache = new Map<string, CallGraphData | null>();

function resolveCallGraphDir(): string {
    return process.env.CALLGRAPH_DIR || path.resolve(process.cwd(), 'callgraph');
}

function resolveRepoKey(repositoryFullName: string): string | null {
    // Extract repo name from "org/repo-name" format
    const repoName = repositoryFullName.split('/').pop() || '';
    return REPO_NAME_MAP[repoName] || REPO_NAME_MAP[repoName.toLowerCase()] || null;
}

function loadCallGraphJSON(repoKey: string): CallGraphData | null {
    if (astCache.has(repoKey)) return astCache.get(repoKey)!;

    const jsonPath = path.join(resolveCallGraphDir(), repoKey, 'call-graph.json');
    try {
        if (!fs.existsSync(jsonPath)) {
            logger.log({
                message: `[CALL-GRAPH] AST JSON not found: ${jsonPath}`,
                context: 'CallGraphHelper',
            });
            astCache.set(repoKey, null);
            return null;
        }
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CallGraphData;
        astCache.set(repoKey, data);
        logger.log({
            message: `[CALL-GRAPH] Loaded AST JSON: ${Object.keys(data).length} functions from ${jsonPath}`,
            context: 'CallGraphHelper',
        });
        return data;
    } catch (err) {
        logger.warn({
            message: `[CALL-GRAPH] Failed to load AST JSON: ${jsonPath}`,
            context: 'CallGraphHelper',
            error: err,
        });
        astCache.set(repoKey, null);
        return null;
    }
}

/**
 * Load call graph data for use by the getCallers tool.
 * Returns the parsed JSON or null if not available.
 */
export function loadCallGraphForTool(repositoryFullName: string): CallGraphData | null {
    const repoKey = resolveRepoKey(repositoryFullName);
    if (!repoKey) return null;
    return loadCallGraphJSON(repoKey);
}

function getExtension(filePath: string): string {
    const dot = filePath.lastIndexOf('.');
    return dot >= 0 ? filePath.substring(dot) : '';
}

/**
 * Extract modified line ranges from a unified diff patch.
 * Returns ranges [start, end] for the NEW side of the diff.
 */
function getModifiedRanges(patch?: string): Array<[number, number]> {
    if (!patch) return [];
    const ranges: Array<[number, number]> = [];
    for (const line of patch.split('\n')) {
        const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (m) {
            const start = parseInt(m[1], 10);
            const count = m[2] ? parseInt(m[2], 10) : 1;
            ranges.push([start, start + count - 1]);
        }
    }
    return ranges;
}

/**
 * Check if a line number falls within any of the modified ranges.
 * We expand each range by ±5 lines to capture the enclosing function.
 */
function isInModifiedRange(
    lineNum: number,
    ranges: Array<[number, number]>,
): boolean {
    const MARGIN = 5;
    return ranges.some(
        ([start, end]) =>
            lineNum >= start - MARGIN && lineNum <= end + MARGIN,
    );
}

/**
 * Extract function names from diff patches using regex patterns.
 * Returns functions whose definition falls within modified hunk ranges.
 */
function extractModifiedFunctionNames(
    changedFiles: Array<{ filename: string; patch?: string; patchWithLinesStr?: string }>,
): Array<{ name: string; file: string; line: number }> {
    const results: Array<{ name: string; file: string; line: number }> = [];

    for (const file of changedFiles.slice(0, MAX_CHANGED_FILES)) {
        if (!file.filename) continue;
        const patch = file.patchWithLinesStr || file.patch || '';
        const modifiedRanges = getModifiedRanges(patch);
        if (modifiedRanges.length === 0) continue;

        // Extract function definitions from the patch itself (lines starting with + or context)
        const lines = patch.split('\n');
        let currentLine = 0;

        for (const rawLine of lines) {
            // Track line numbers from @@ headers AND extract enclosing function name
            const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(.*)/);
            if (hunkMatch) {
                currentLine = parseInt(hunkMatch[1], 10) - 1;
                // Hunk headers contain the enclosing function: @@ ... @@ def get_result(...)
                const hunkContext = hunkMatch[3] || '';
                if (hunkContext.trim()) {
                    let hunkName = '';
                    for (const pat of NAME_PATTERNS) {
                        const m = hunkContext.match(pat);
                        if (m?.[1]) { hunkName = m[1]; break; }
                    }
                    // Hunk header names are reliable (from git) — only filter very short names
                    if (hunkName && hunkName.length >= 2) {
                        results.push({ name: hunkName, file: file.filename, line: currentLine + 1 });
                    }
                }
                continue;
            }

            // Skip removed lines
            if (rawLine.startsWith('-')) continue;

            // Increment line for added and context lines
            if (rawLine.startsWith('+') || !rawLine.startsWith('\\')) {
                currentLine++;
            }

            const content = rawLine.startsWith('+') ? rawLine.substring(1) : rawLine;

            // Check if this looks like a function definition
            if (!DEFINITION_PATTERN.test(content)) continue;
            if (!isInModifiedRange(currentLine, modifiedRanges)) continue;

            let name = '';
            for (const pat of NAME_PATTERNS) {
                const m = content.match(pat);
                if (m?.[1]) { name = m[1]; break; }
            }

            if (!name || name.length < 5 || NOISE_NAMES.has(name) || NOISE_NAMES.has(name.toLowerCase())) continue;
            results.push({ name, file: file.filename, line: currentLine });
        }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    return results.filter((f) => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
    });
}

/**
 * Generate call graph from pre-computed AST data (JSON lookup).
 * Much more accurate than grep — uses tree-sitter parsed call edges.
 */
function generateCallGraphFromAST(
    repositoryFullName: string,
    changedFiles: Array<{ filename: string; patch?: string; patchWithLinesStr?: string }>,
): string | null {
    const repoKey = resolveRepoKey(repositoryFullName);
    if (!repoKey) return null;

    const data = loadCallGraphJSON(repoKey);
    if (!data) return null;

    const modifiedFunctions = extractModifiedFunctionNames(changedFiles);
    if (modifiedFunctions.length === 0) return null;

    // Build indexes for lookup: by short_name and by qualified name
    const byShortName = new Map<string, CallGraphEntry[]>();
    for (const entry of Object.values(data)) {
        const sn = entry.short_name || entry.name;
        const list = byShortName.get(sn) || [];
        list.push(entry);
        byShortName.set(sn, list);
    }

    const entries: string[] = [];

    for (const func of modifiedFunctions) {
        // Try exact key matches (file::QualifiedName or file::short_name)
        let entry: CallGraphEntry | undefined;
        // Keys in the JSON now use qualified names: "file::Parent.name"
        // Try matching by file + short_name against all entries for that short_name
        const candidates = byShortName.get(func.name) || [];
        entry = candidates.find((c) => func.file.endsWith(c.file));
        // Fall back to first match only for non-generic names
        if (!entry && candidates.length > 0 && candidates.length <= 5) {
            entry = candidates[0];
        }

        const shortFile = func.file.split('/').slice(-2).join('/');

        if (!entry || entry.callers.length === 0) {
            const displayName = entry ? entry.name : func.name;
            const calleeLines = (entry?.callees || []).slice(0, 5).map((c) => {
                const calleeShort = c.file.split('/').slice(-2).join('/');
                return `  → calls: ${c.name} (${calleeShort}:${c.line})`;
            });
            const calleeSection = calleeLines.length > 0 ? '\n' + calleeLines.join('\n') : '';
            entries.push(`${displayName} (${shortFile}:${func.line})\n  (no callers — interface impl or new function)${calleeSection}`);
            continue;
        }

        const displayName = entry.name; // qualified: "Class.method"
        const callerLines = entry.callers.slice(0, MAX_CALLERS_PER_FUNCTION).map((c) => {
            const callerShort = c.file.split('/').slice(-2).join('/');
            const callerName = c.name ? ` (${c.name})` : '';
            return `  ← ${callerShort}:${c.line}${callerName}`;
        });

        const calleeLines = (entry.callees || []).slice(0, 5).map((c) => {
            const calleeShort = c.file.split('/').slice(-2).join('/');
            return `  → calls: ${c.name} (${calleeShort}:${c.line})`;
        });

        const calleeSection = calleeLines.length > 0 ? '\n' + calleeLines.join('\n') : '';
        entries.push(`${displayName} (${shortFile}:${func.line})\n${callerLines.join('\n')}${calleeSection}`);
    }

    if (entries.length === 0) return null;

    let result = 'Changed functions and their production callers (AST):\n\n' + entries.join('\n\n');

    logger.log({
        message: `[CALL-GRAPH] AST: ${result.length} chars, ${entries.length}/${modifiedFunctions.length} functions with callers`,
        context: 'CallGraphHelper',
    });

    if (result.length > MAX_CALLGRAPH_CHARS) {
        result = result.substring(0, MAX_CALLGRAPH_CHARS) + '\n... (truncated)';
    }

    return result;
}

/**
 * Generate call graph using grep/rg in the sandbox (fallback).
 */
async function generateCallGraphGrep(
    remoteCommands: RemoteCommands,
    changedFiles: Array<{ filename: string; patch?: string; patchWithLinesStr?: string }>,
): Promise<string> {
    if (!remoteCommands.exec || changedFiles.length === 0) return '';

    const files = changedFiles
        .filter((f) => f.filename)
        .slice(0, MAX_CHANGED_FILES);

    if (files.length === 0) return '';

    // Step 1: Extract function definitions that fall within diff hunks
    const modifiedFunctions: Array<{
        name: string;
        file: string;
        line: number;
        ext: string;
    }> = [];

    for (const file of files) {
        const patch = file.patchWithLinesStr || file.patch || '';
        const modifiedRanges = getModifiedRanges(patch);
        if (modifiedRanges.length === 0) continue;

        const ext = getExtension(file.filename);

        try {
            const { stdout } = await remoteCommands.exec(
                `grep -nE "(^|[[:space:]])(def |func |fn |function |class |public |private |protected |async |export (function|class|const |default function))" "${file.filename}" 2>/dev/null | head -${MAX_FUNCTIONS_PER_FILE}`,
            );
            if (!stdout?.trim()) continue;

            for (const rawLine of stdout.trim().split('\n')) {
                const colonIdx = rawLine.indexOf(':');
                if (colonIdx < 0) continue;
                const lineNum = parseInt(rawLine.substring(0, colonIdx), 10);
                const content = rawLine.substring(colonIdx + 1);

                // Only include if this function is within a modified hunk
                if (!isInModifiedRange(lineNum, modifiedRanges)) continue;

                let name = '';
                for (const pat of NAME_PATTERNS) {
                    const m = content.match(pat);
                    if (m?.[1]) { name = m[1]; break; }
                }

                if (!name || name.length < 5 || NOISE_NAMES.has(name) || NOISE_NAMES.has(name.toLowerCase())) continue;

                modifiedFunctions.push({ name, file: file.filename, line: lineNum, ext });
            }
        } catch {
            continue;
        }
    }

    if (modifiedFunctions.length === 0) return '';

    // Deduplicate by name
    const seen = new Set<string>();
    const uniqueFunctions = modifiedFunctions.filter((f) => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
    });

    // Step 2: For each modified function, find production callers
    const entries: string[] = [];

    for (const func of uniqueFunctions) {
        const shortFile = func.file.split('/').slice(-2).join('/');
        const globExt = func.ext ? `--glob '*${func.ext}'` : '';

        let callers: string[] = [];
        try {
            const { stdout } = await remoteCommands.exec(
                `rg -n "${func.name}\\(" ${globExt} --glob '!*test*' --glob '!*Test*' --glob '!*spec*' --glob '!*Spec*' --glob '!*_test*' --glob '!*__tests__*' --glob '!*mock*' --glob '!*Mock*' --glob '!*.min.*' --glob '!vendor/*' . 2>/dev/null | grep -v "${func.file}" | grep -v "^Binary" | head -8`,
            );

            if (stdout?.trim()) {
                for (const callerLine of stdout.trim().split('\n')) {
                    const clean = callerLine.replace(/^\.\//, '');
                    const parts = clean.split(':');
                    if (parts.length < 3) continue;

                    const callerContent = parts.slice(2).join(':').trim();
                    if (DEFINITION_PATTERN.test(callerContent)) continue;

                    const callerFile = parts[0].split('/').slice(-2).join('/');
                    const callerLineNum = parts[1];
                    const trimmedContent = callerContent.substring(0, 80);

                    callers.push(`  ← ${callerFile}:${callerLineNum}  ${trimmedContent}`);
                    if (callers.length >= MAX_CALLERS_PER_FUNCTION) break;
                }
            }
        } catch {
            // grep failed
        }

        if (callers.length > 0) {
            entries.push(`${func.name} (${shortFile}:${func.line})\n${callers.join('\n')}`);
        }
    }

    if (entries.length === 0) return '';

    let result = 'Changed functions and their production callers:\n\n' + entries.join('\n\n');

    logger.log({
        message: `[CALL-GRAPH] Grep: ${result.length} chars, ${entries.length}/${uniqueFunctions.length} functions with callers`,
        context: 'CallGraphHelper',
    });

    if (result.length > MAX_CALLGRAPH_CHARS) {
        result = result.substring(0, MAX_CALLGRAPH_CHARS) + '\n... (truncated)';
    }

    return result;
}

/**
 * Generate a compact call graph showing WHO CALLS each MODIFIED function.
 *
 * Strategy: try AST-based lookup first (pre-computed, precise), fall back to grep.
 * Only includes functions whose definition falls within diff hunk ranges.
 */
export async function generateCallGraph(
    remoteCommands: RemoteCommands,
    changedFiles: Array<{ filename: string; patch?: string; patchWithLinesStr?: string }>,
    repositoryFullName?: string,
): Promise<string> {
    // Try AST-based call graph first
    if (repositoryFullName) {
        try {
            const astResult = generateCallGraphFromAST(repositoryFullName, changedFiles);
            if (astResult) return astResult;
        } catch (err) {
            logger.warn({
                message: `[CALL-GRAPH] AST lookup failed, falling back to grep`,
                context: 'CallGraphHelper',
                error: err,
            });
        }
    }

    // Fallback to grep-based approach
    return generateCallGraphGrep(remoteCommands, changedFiles);
}
