#!/usr/bin/env npx ts-node

/**
 * PR Log Check CLI
 *
 * Checks logs for a specific PR and organization. By default shows errors and warnings.
 *
 * Usage:
 *   npx ts-node scripts/check-pr-errors.cli.ts <prNumber> <orgId> [options]
 *
 * Examples:
 *   npx ts-node scripts/check-pr-errors.cli.ts 723 97442318-9d2a-496b-a0d2-b45fb --env=.env.prod
 *   npx ts-node scripts/check-pr-errors.cli.ts 701 97442318-9d2a-496b-a0d2-b45fb --all --env=.env.prod
 *   npx ts-node scripts/check-pr-errors.cli.ts 701 97442318-9d2a-496b-a0d2-b45fb --legacy --env=.env.prod
 *
 * Options:
 *   --days=N    Number of days to search back (default: 7)
 *   --all       Show all log levels (debug, info, warn, error). Default: error + warn
 *   --legacy    Also search in legacy collection (observability_logs)
 *   --env=PATH  Path to .env file
 *
 * Environment variables (uses .env):
 *   MONGODB_URI or API_MG_DB_* variables
 */

import * as dotenv from 'dotenv';
import { MongoClient, Db } from 'mongodb';
import * as path from 'path';

// Load .env
const envArg = process.argv.find(a => a.startsWith('--env='));
const envPath = envArg
    ? path.resolve(envArg.split('=')[1])
    : process.env.DOTENV_CONFIG_PATH
        ? path.resolve(process.env.DOTENV_CONFIG_PATH)
        : path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

interface ErrorLog {
    timestamp: Date;
    level: string;
    component?: string;
    message: string;
    error?: string;
    stack?: string;
    correlationId?: string;
    pipelineId?: string;
}

function buildMongoUri(): string {
    if (process.env.MONGODB_URI) {
        return process.env.MONGODB_URI;
    }

    const host = process.env.API_MG_DB_HOST;
    const port = process.env.API_MG_DB_PORT;
    const username = process.env.API_MG_DB_USERNAME;
    const password = process.env.API_MG_DB_PASSWORD;
    const authSource = process.env.API_MG_DB_AUTH_SOURCE || 'admin';

    if (!host) {
        throw new Error('Missing MongoDB configuration. Set MONGODB_URI or API_MG_DB_* variables.');
    }

    if (username && password) {
        if (port) {
            return `mongodb://${username}:${password}@${host}:${port}/?authSource=${authSource}`;
        }
        return `mongodb+srv://${username}:${password}@${host}/?authSource=${authSource}`;
    }

    if (port) {
        return `mongodb://${host}:${port}`;
    }
    return `mongodb+srv://${host}`;
}

function formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

function truncate(str: string, len: number): string {
    if (!str) return '';
    return str.length <= len ? str : str.substring(0, len - 3) + '...';
}

async function checkPRErrors(
    db: Db,
    prNumber: number,
    orgId: string,
    daysBack: number = 7,
    includeLegacy: boolean = false,
    allLogs: boolean = false,
    limit: number = 300
): Promise<ErrorLog[]> {
    const start = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const end = new Date();

    const logLevels = allLogs ? ['debug', 'info', 'warn', 'error'] : ['error', 'warn'];

    console.log(`\n${'='.repeat(80)}`);
    console.log(`PR LOG CHECK - PR #${prNumber}`);
    console.log(`Organization: ${orgId}`);
    console.log(`Log levels: ${logLevels.join(', ')}${allLogs ? ' (all)' : ' (errors/warnings)'}`);
    console.log(`Date range: ${start.toISOString()} - ${end.toISOString()}`);
    console.log(`${'='.repeat(80)}\n`);

    // Build base query filters
    const baseFilters: any[] = [
        {
            $or: [
                { 'attributes.organizationId': orgId },
                { 'attributes.organizationAndTeamData.organizationId': orgId }
            ]
        },
        {
            $or: [
                { 'attributes.prNumber': prNumber },
                { 'attributes.pullRequest.number': prNumber },
                { message: { $regex: `PR#${prNumber}` } }
            ]
        }
    ];

    // If not all logs, filter by error-related criteria
    if (allLogs) {
        baseFilters.push({ level: { $in: logLevels } });
    } else {
        baseFilters.push({
            $or: [
                { level: { $in: logLevels } },
                { 'attributes.error': { $exists: true } },
                { message: { $regex: /error|exception|failed|failure/i } }
            ]
        });
    }

    const logQuery = {
        timestamp: { $gte: start, $lte: end },
        $and: baseFilters
    };

    console.log(`Searching for logs${includeLegacy ? ' (including legacy)' : ''}...\n`);

    const pipeline: any[] = [
        { $match: logQuery }
    ];

    if (includeLegacy) {
        pipeline.push({
            $unionWith: {
                coll: 'observability_logs',
                pipeline: [{ $match: logQuery }]
            }
        });
    }

    pipeline.push(
        {
            $project: {
                _id: 0,
                timestamp: 1,
                level: 1,
                component: 1,
                message: 1,
                'attributes.error': 1,
                'attributes.stack': 1,
                'attributes.errorMessage': 1,
                correlationId: 1,
                'attributes.pipelineId': 1
            }
        },
        { $sort: { timestamp: 1 } },
        { $limit: limit }
    );

    const errors = await db.collection('observability_logs_ts').aggregate(pipeline).toArray();

    const errorLogs: ErrorLog[] = errors.map((e: any) => ({
        timestamp: e.timestamp,
        level: e.level || 'unknown',
        component: e.component,
        message: e.message,
        error: e.attributes?.error || e.attributes?.errorMessage,
        stack: e.attributes?.stack,
        correlationId: e.correlationId,
        pipelineId: e.attributes?.pipelineId
    }));

    if (errorLogs.length === 0) {
        console.log('No errors found for this PR.\n');

        // Try a broader search without error filter to see if PR exists
        const prExistsQuery = {
            timestamp: { $gte: start, $lte: end },
            $and: [
                {
                    $or: [
                        { 'attributes.organizationId': orgId },
                        { 'attributes.organizationAndTeamData.organizationId': orgId }
                    ]
                },
                {
                    $or: [
                        { 'attributes.prNumber': prNumber },
                        { 'attributes.pullRequest.number': prNumber },
                        { message: { $regex: `PR#${prNumber}` } }
                    ]
                }
            ]
        };

        const prExists = await db.collection('observability_logs_ts').findOne(prExistsQuery) ||
                         await db.collection('observability_logs').findOne(prExistsQuery);

        if (!prExists) {
            console.log(`Note: No logs found at all for PR #${prNumber} with orgId ${orgId}`);
            console.log('Check if the PR number and orgId are correct.\n');
        } else {
            console.log(`PR #${prNumber} found in logs - no errors detected.\n`);
        }
    } else {
        console.log(`Found ${errorLogs.length} error(s):\n`);
        console.log('-'.repeat(80));

        errorLogs.forEach((err, i) => {
            console.log(`\n[${i + 1}] ${formatTimestamp(err.timestamp)} | ${err.level.toUpperCase()}`);
            if (err.component) {
                console.log(`    Component: ${err.component}`);
            }
            if (err.pipelineId) {
                console.log(`    PipelineId: ${err.pipelineId}`);
            }
            if (err.correlationId) {
                console.log(`    CorrelationId: ${err.correlationId}`);
            }
            console.log(`    Message: ${err.message}`);
            if (err.error) {
                console.log(`    Error: ${err.error}`);
            }
            if (err.stack) {
                console.log(`    Stack: ${truncate(err.stack, 200)}`);
            }
            console.log('-'.repeat(80));
        });
    }

    // Also check telemetry for failed operations
    console.log('\nChecking telemetry for failed operations...\n');

    const telemetryErrors = await db.collection('observability_telemetry').find({
        timestamp: { $gte: start, $lte: end },
        'attributes.prNumber': prNumber,
        'attributes.organizationId': orgId,
        $or: [
            { 'attributes.error': { $exists: true } },
            { 'attributes.status': 'error' },
            { 'attributes.success': false }
        ]
    }, {
        projection: {
            _id: 0,
            timestamp: 1,
            name: 1,
            duration: 1,
            'attributes.error': 1,
            'attributes.errorMessage': 1,
            'attributes.status': 1
        }
    }).sort({ timestamp: 1 }).limit(50).toArray();

    if (telemetryErrors.length > 0) {
        console.log(`Found ${telemetryErrors.length} failed operation(s) in telemetry:\n`);
        console.log('-'.repeat(80));

        telemetryErrors.forEach((t: any, i) => {
            console.log(`\n[${i + 1}] ${formatTimestamp(t.timestamp)}`);
            console.log(`    Operation: ${t.name}`);
            console.log(`    Duration: ${t.duration}ms`);
            if (t.attributes?.error) {
                console.log(`    Error: ${t.attributes.error}`);
            }
            if (t.attributes?.errorMessage) {
                console.log(`    Message: ${t.attributes.errorMessage}`);
            }
        });
        console.log('-'.repeat(80));
    } else {
        console.log('No failed operations found in telemetry.\n');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('Error check complete');
    console.log(`${'='.repeat(80)}\n`);

    return errorLogs;
}

async function main() {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--env='));

    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        console.log(`
PR Log Check CLI

Usage:
  npx ts-node scripts/check-pr-errors.cli.ts <prNumber> <orgId> [options]

Arguments:
  prNumber    PR number to check (required)
  orgId       Organization ID (required)

Options:
  --days=N    Number of days to search back (default: 7)
  --limit=N   Max number of logs to return (default: 100)
  --all       Show all logs (debug, info, warn, error). Default: only error + warn
  --legacy    Also search in legacy collection (observability_logs)
  --env=PATH  Path to .env file

Examples:
  npx ts-node scripts/check-pr-errors.cli.ts 723 97442318-9d2a-496b-a0d2-b45fb --env=.env.prod
  npx ts-node scripts/check-pr-errors.cli.ts 701 97442318-9d2a-496b-a0d2-b45fb --all --env=.env.prod
  npx ts-node scripts/check-pr-errors.cli.ts 701 97442318-9d2a-496b-a0d2-b45fb --limit=500 --env=.env.prod
`);
        process.exit(0);
    }

    const prNumber = parseInt(args[0], 10);
    if (isNaN(prNumber)) {
        console.error('ERROR: Invalid PR number');
        process.exit(1);
    }

    const orgId = args[1];
    if (!orgId || orgId.startsWith('--')) {
        console.error('ERROR: Organization ID is required');
        process.exit(1);
    }

    const daysArg = args.find(a => a.startsWith('--days='));
    const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7;
    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
    const includeLegacy = args.includes('--legacy');
    const allLogs = args.includes('--all');

    let client: MongoClient | null = null;

    try {
        const uri = buildMongoUri();
        const dbName = process.env.API_MG_DB_DATABASE || 'kodus_db';

        console.log(`Using env file: ${envPath}`);
        console.log(`Connecting to MongoDB (database: ${dbName})...`);

        client = new MongoClient(uri);
        await client.connect();

        const db = client.db(dbName);

        await checkPRErrors(db, prNumber, orgId, daysBack, includeLegacy, allLogs, limit);
    } catch (error) {
        console.error('ERROR:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

main();
