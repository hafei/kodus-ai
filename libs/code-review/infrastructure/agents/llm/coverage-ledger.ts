import { FileChange } from '@libs/core/infrastructure/config/types/general/codeReview.type';

export interface CoverageTouch {
    tool: string;
    path: string;
    step: number;
}

export interface CoverageTarget {
    id: string;
    file: string;
    changedRanges: Array<[number, number]>;
    status: 'pending' | 'touched';
    touchedBy: CoverageTouch[];
}

export interface CoverageSummary {
    totalTargets: number;
    touchedTargets: number;
    pendingTargets: number;
    touchedFiles: string[];
    pendingFiles: string[];
}

interface CoverageObservation {
    path: string;
    startLine?: number;
    endLine?: number;
    pathMode: 'file' | 'directory';
}

export function normalizeRepoPath(path?: string): string {
    return String(path || '')
        .replace(/^\/+/, '')
        .replace(/\\/g, '/')
        .trim();
}

export function buildCoverageLedger(
    changedFiles?: FileChange[],
): CoverageTarget[] {
    if (!changedFiles?.length) return [];

    return changedFiles
        .filter((file) => !!file?.filename)
        .map((file) => ({
            id: normalizeRepoPath(file.filename),
            file: normalizeRepoPath(file.filename),
            changedRanges: extractChangedLineRanges(file.patch),
            status: 'pending' as const,
            touchedBy: [],
        }));
}

export function getCoverageSummary(targets: CoverageTarget[]): CoverageSummary {
    const touched = targets.filter((target) => target.status === 'touched');
    const pending = targets.filter((target) => target.status === 'pending');

    return {
        totalTargets: targets.length,
        touchedTargets: touched.length,
        pendingTargets: pending.length,
        touchedFiles: touched.map((target) => target.file),
        pendingFiles: pending.map((target) => target.file),
    };
}

export function formatCoverageTargetsForPrompt(
    changedFiles?: FileChange[],
    maxItems = 20,
): string {
    const targets = buildCoverageLedger(changedFiles);
    if (!targets.length) return '';

    const lines = targets
        .slice(0, maxItems)
        .map((target) => `- ${describeCoverageTarget(target)}`);

    if (targets.length > maxItems) {
        lines.push(`- ... (${targets.length - maxItems} more changed files)`);
    }

    return lines.join('\n');
}

export function formatCoverageDebt(
    targets: CoverageTarget[],
    maxItems = 8,
): string {
    const pending = targets.filter((target) => target.status === 'pending');
    if (!pending.length) return '';

    const lines = pending
        .slice(0, maxItems)
        .map((target) => `- ${describeCoverageTarget(target)}`);

    if (pending.length > maxItems) {
        lines.push(`- ... (${pending.length - maxItems} more changed files)`);
    }

    return [
        'Coverage debt remains for these changed files:',
        ...lines,
        'Do not finalize until each remaining changed file has been inspected with readFile or checkTypes.',
        'grep or listDir alone do not count as coverage.',
    ].join('\n');
}

export function markCoverageFromToolCall(
    targets: CoverageTarget[],
    toolName: string,
    args: Record<string, unknown>,
    step: number,
): CoverageTarget[] {
    if (!targets.length) return [];

    const observation = extractCoverageObservation(toolName, args);
    if (!observation) return [];

    const normalizedPath = normalizeRepoPath(observation.path);
    if (!normalizedPath) return [];

    const newlyTouched: CoverageTarget[] = [];

    for (const target of targets) {
        if (!targetMatchesObservation(target, observation, normalizedPath)) {
            continue;
        }

        if (
            !target.touchedBy.some(
                (touch) =>
                    touch.tool === toolName && touch.path === normalizedPath,
            )
        ) {
            target.touchedBy.push({
                tool: toolName,
                path: normalizedPath,
                step,
            });
        }

        if (target.status === 'pending') {
            target.status = 'touched';
            newlyTouched.push(target);
        }
    }

    return newlyTouched;
}

function extractCoverageObservation(
    toolName: string,
    args: Record<string, unknown>,
): CoverageObservation | null {
    if (toolName === 'readFile') {
        const path = String(args.path || args.filePath || args.file || '');
        if (!path) return null;

        return {
            path,
            startLine: toPositiveNumber(args.startLine || args.start_line),
            endLine: toPositiveNumber(args.endLine || args.end_line),
            pathMode: 'file',
        };
    }

    if (toolName === 'checkTypes') {
        const path = String(args.path || args.filePath || args.file || '');
        const normalized = normalizeRepoPath(path);
        if (!normalized || normalized === '.') return null;

        return {
            path: normalized,
            pathMode: normalized.includes('.') ? 'file' : 'directory',
        };
    }

    return null;
}

function targetMatchesObservation(
    target: CoverageTarget,
    observation: CoverageObservation,
    normalizedPath: string,
): boolean {
    if (observation.pathMode === 'directory') {
        return (
            target.file === normalizedPath ||
            target.file.startsWith(`${normalizedPath}/`)
        );
    }

    if (!pathsMatch(target.file, normalizedPath)) {
        return false;
    }

    if (!observation.startLine && !observation.endLine) {
        return true;
    }

    if (!target.changedRanges.length) {
        return true;
    }

    const readStart = observation.startLine || 1;
    const readEnd = observation.endLine || observation.startLine || readStart;

    return target.changedRanges.some(([start, end]) =>
        rangesOverlap(start, end, readStart, readEnd),
    );
}

function describeCoverageTarget(target: CoverageTarget): string {
    const ranges = formatRanges(target.changedRanges);
    return ranges ? `${target.file} (${ranges})` : target.file;
}

function formatRanges(ranges: Array<[number, number]>): string {
    if (!ranges.length) return '';

    return `changed lines ${ranges
        .slice(0, 3)
        .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
        .join(', ')}${ranges.length > 3 ? ', ...' : ''}`;
}

function pathsMatch(targetFile: string, observedPath: string): boolean {
    if (targetFile === observedPath) return true;
    if (observedPath.endsWith(`/${targetFile}`)) return true;
    if (targetFile.endsWith(`/${observedPath}`)) return true;

    const targetBase = targetFile.split('/').pop();
    const observedBase = observedPath.split('/').pop();

    return !!targetBase && targetBase === observedBase && observedBase !== '';
}

function extractChangedLineRanges(patch?: string): Array<[number, number]> {
    if (!patch) return [];

    const ranges: Array<[number, number]> = [];

    for (const line of patch.split('\n')) {
        const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (!match) continue;

        const start = parseInt(match[1], 10);
        const count = parseInt(match[2] || '1', 10);
        const end = count > 0 ? start + count - 1 : start;
        ranges.push([start, end]);
    }

    return ranges;
}

function rangesOverlap(
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
): boolean {
    return aStart <= bEnd && bStart <= aEnd;
}

function toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
