#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
    attachPullRequestMetadata,
    getLatestExecutionStageRows,
    loadJson,
    loadManifest,
    resolvePullRequestMetadata,
    resolveResultsDir,
    writeJson,
} = require('./benchmark-lib');

function parseArgs(argv) {
    const args = {
        runName: argv[2],
        outputDir: null,
    };

    for (let i = 3; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--output-dir') {
            args.outputDir = argv[i + 1] ? path.resolve(argv[i + 1]) : null;
            i += 1;
        }
    }

    return args;
}

function tryParseJson(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

function normalizePath(value) {
    if (!value || typeof value !== 'string') return null;
    return value.replace(/^\.\//, '');
}

function basename(value) {
    const normalized = normalizePath(value);
    if (!normalized) return null;
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || normalized;
}

function matchesChangedFile(readPath, changedFile) {
    const normalizedRead = normalizePath(readPath);
    const normalizedChanged = normalizePath(changedFile);
    if (!normalizedRead || !normalizedChanged) return false;

    if (normalizedRead === normalizedChanged) return true;
    if (normalizedRead.endsWith(`/${normalizedChanged}`)) return true;
    if (normalizedChanged.endsWith(`/${normalizedRead}`)) return true;

    const readBase = basename(normalizedRead);
    const changedBase = basename(normalizedChanged);
    return Boolean(readBase && changedBase && readBase === changedBase);
}

function extractFileCandidates(toolCall) {
    const parsed = tryParseJson(toolCall.args);
    if (!parsed || typeof parsed !== 'object') return [];

    const candidates = [];
    for (const key of ['filePath', 'path', 'relativePath', 'targetFile']) {
        if (typeof parsed[key] === 'string') {
            candidates.push(parsed[key]);
        }
    }

    return candidates.map(normalizePath).filter(Boolean);
}

function buildAgentMetrics(agentRow, changedFiles) {
    const trace = agentRow.stageMetadata?.agentTrace || {};
    const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
    const toolSummary =
        trace.toolSummary && typeof trace.toolSummary === 'object'
            ? trace.toolSummary
            : {};

    const filesRead = new Set();
    for (const toolCall of toolCalls) {
        if (toolCall.tool !== 'readFile') continue;
        for (const candidate of extractFileCandidates(toolCall)) {
            filesRead.add(candidate);
        }
    }

    const normalizedChangedFiles = [
        ...new Set((changedFiles || []).map(normalizePath).filter(Boolean)),
    ];
    const coverage =
        trace.coverage && typeof trace.coverage === 'object'
            ? trace.coverage
            : null;
    const verification =
        trace.verification && typeof trace.verification === 'object'
            ? trace.verification
            : null;
    const anomalies =
        trace.anomalies && typeof trace.anomalies === 'object'
            ? trace.anomalies
            : null;
    const touchedChangedFiles = coverage?.touchedFiles?.length
        ? normalizedChangedFiles.filter((changedFile) =>
              coverage.touchedFiles.some((touchedFile) =>
                  matchesChangedFile(touchedFile, changedFile),
              ),
          )
        : normalizedChangedFiles.filter((changedFile) =>
              [...filesRead].some((readFilePath) =>
                  matchesChangedFile(readFilePath, changedFile),
              ),
          );

    return {
        status: agentRow.stageStatus,
        message: agentRow.stageMessage || '',
        steps: trace.steps ?? null,
        findings: trace.findings ?? null,
        durationMs: trace.durationMs ?? null,
        totalTokens: trace.totalTokens ?? null,
        toolCalls: toolCalls.length,
        toolSummary,
        filesRead: [...filesRead].sort(),
        changedFilesTouched: touchedChangedFiles.sort(),
        changedFilesTouchedCount: touchedChangedFiles.length,
        changedFilesTouchedPct:
            normalizedChangedFiles.length > 0
                ? touchedChangedFiles.length / normalizedChangedFiles.length
                : 0,
        coverage,
        verification,
        anomalies,
        finishedAtMaxSteps:
            typeof agentRow.stageMessage === 'string' &&
            agentRow.stageMessage.includes('step limit'),
        recoveredViaSecondChance:
            typeof agentRow.stageMessage === 'string' &&
            agentRow.stageMessage.includes('second-chance'),
    };
}

function main() {
    const { runName, outputDir } = parseArgs(process.argv);
    if (!runName) {
        process.stderr.write(
            'Usage: node export-trace-metrics.js <run-name> [--output-dir <dir>]\n',
        );
        process.exit(1);
    }

    const { manifest } = loadManifest(runName);
    const resultsDir = resolveResultsDir(runName);
    const prMetadataPath = path.join(resultsDir, 'pr-metadata.json');
    const prMetadata = fs.existsSync(prMetadataPath)
        ? loadJson(prMetadataPath).prs
        : null;

    const baseEntries = prMetadata || manifest.prs;
    const metadata = resolvePullRequestMetadata(baseEntries);
    const enriched = attachPullRequestMetadata(baseEntries, metadata).filter(
        (entry) => entry.prNumber && entry.repositoryId,
    );

    const stageRows = getLatestExecutionStageRows(enriched);
    const stageGroups = new Map();

    for (const row of stageRows) {
        const key = `${row.repositoryId}#${row.prNumber}`;
        if (!stageGroups.has(key)) {
            stageGroups.set(key, []);
        }
        stageGroups.get(key).push(row);
    }

    const prSummaries = enriched.map((entry) => {
        const key = `${entry.repositoryId}#${entry.prNumber}`;
        const rows = stageGroups.get(key) || [];
        const changedFiles = entry.changedFiles || [];
        const agents = {};

        for (const row of rows) {
            if (!row.stageName?.startsWith('AgentReview::')) continue;
            const agentName = row.stageName.replace('AgentReview::', '');
            agents[agentName] = buildAgentMetrics(row, changedFiles);
        }

        const finishedStage = rows.find(
            (row) => row.stageName === 'Kody Review Finished',
        );

        return {
            repo: entry.repo,
            head: entry.head,
            title: entry.title,
            prNumber: entry.prNumber,
            repositoryId: entry.repositoryId,
            changedFiles,
            changedFilesCount: changedFiles.length,
            execution: {
                uuid: rows[0]?.executionUuid || null,
                status: rows[0]?.executionStatus || null,
                createdAt: rows[0]?.executionCreatedAt || null,
            },
            finishedStage: finishedStage
                ? {
                      status: finishedStage.stageStatus,
                      finishedAt: finishedStage.stageFinishedAt,
                  }
                : null,
            agents,
        };
    });

    const summary = {
        generatedAt: new Date().toISOString(),
        runName,
        prs: prSummaries,
        aggregates: {
            prs: prSummaries.length,
            bug: {
                avgSteps:
                    prSummaries.reduce(
                        (sum, pr) => sum + (pr.agents.bug?.steps || 0),
                        0,
                    ) / (prSummaries.length || 1),
            },
            security: {
                avgSteps:
                    prSummaries.reduce(
                        (sum, pr) => sum + (pr.agents.security?.steps || 0),
                        0,
                    ) / (prSummaries.length || 1),
            },
            performance: {
                avgSteps:
                    prSummaries.reduce(
                        (sum, pr) => sum + (pr.agents.performance?.steps || 0),
                        0,
                    ) / (prSummaries.length || 1),
            },
        },
    };

    const targetDir = outputDir || resultsDir;
    fs.mkdirSync(targetDir, { recursive: true });
    writeJson(path.join(targetDir, `${runName}-trace-metrics.json`), summary);

    process.stdout.write(
        `trace metrics exported to ${path.join(targetDir, `${runName}-trace-metrics.json`)}\n`,
    );
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    }
}
