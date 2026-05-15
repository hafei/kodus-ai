#!/usr/bin/env -S node --experimental-strip-types
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveScenarios } from "../scenarios/index.js";
import { runMatrix } from "../lib/runner.js";
import { summarize, writeAll } from "../lib/evidence.js";
import { logger } from "../lib/log.js";
import type { MatrixCell, ScenarioResult, Target } from "../lib/types.js";

const log = logger("cli:matrix");

interface MatrixFile {
    id: string;
    description?: string;
    scenarios: string[];
    cells: MatrixCell[];
}

function parseArgs(): {
    matrixPath: string;
    targetFilter?: Target;
    dryRun: boolean;
} {
    const args = process.argv.slice(2);
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith("--")) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(a);
        }
    }
    const matrixPath = (flags.matrix as string) ?? positional[0];
    if (!matrixPath) {
        console.error(
            "usage: run-matrix <matrix.yml> [--target cloud|self-hosted]",
        );
        process.exit(2);
    }
    return {
        matrixPath: resolve(matrixPath),
        targetFilter: flags.target as Target | undefined,
        dryRun: Boolean(flags["dry-run"]),
    };
}

async function main() {
    const { matrixPath, targetFilter, dryRun } = parseArgs();
    const raw = readFileSync(matrixPath, "utf8");
    const matrix = parseYaml(raw) as MatrixFile;

    const scenarios = resolveScenarios(matrix.scenarios);
    const cells = targetFilter
        ? matrix.cells.filter((c) => c.target === targetFilter)
        : matrix.cells;

    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 8)}`;
    log.info(`Matrix ${matrix.id} (${cells.length} cells × ${scenarios.length} scenarios) runId=${runId}`);

    const allResults: ScenarioResult[] = [];
    const startedAt = new Date().toISOString();
    const targetsToRun: Target[] = targetFilter
        ? [targetFilter]
        : Array.from(new Set(cells.map((c) => c.target))) as Target[];

    for (const target of targetsToRun) {
        const targetCells = cells.filter((c) => c.target === target);
        if (!targetCells.length) continue;
        log.info(`--- Running ${targetCells.length} cells for target=${target}`);
        const outcome = await runMatrix({
            artifactRoot: `${process.cwd()}/evidence`,
            runId,
            target,
            cells: targetCells,
            scenarios,
            dryRun,
        });
        allResults.push(...outcome.results);
    }
    const finishedAt = new Date().toISOString();
    const bundle = { runId, startedAt, finishedAt, results: allResults };

    const artifactDir = `${process.cwd()}/evidence/${runId}`;
    writeAll(artifactDir, bundle);

    const summary = summarize(bundle);
    log.info(
        `Result: ${summary.passed}/${summary.total} passed (failed=${summary.failed}, skipped=${summary.skipped}, blocked=${summary.blocked})`,
    );
    log.info(`Evidence: ${artifactDir}`);

    if (summary.failed > 0 || summary.blocked > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    log.err((err as Error).stack ?? String(err));
    process.exit(1);
});
