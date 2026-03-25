import { Client } from 'langsmith';

async function main() {
    const client = new Client({
        apiUrl: 'https://api.smith.langchain.com',
        apiKey: process.env.LANGCHAIN_API_KEY,
    });

    console.log('Searching for runs...');

    const runs = [];
    for await (const run of client.listRuns({
        projectName: 'kodus-orchestrator-wellington',
        limit: 100,
    })) {
        const runStr = JSON.stringify(run);
        if (
            runStr.includes('c19cca98-e359-4ad2-b2ab-2cfc3a6bb863') ||
            runStr.includes('feature-idp-cache-implementation') ||
            runStr.includes('Keycloak PR 83') ||
            runStr.includes('83')
        ) {
            runs.push(run);
        }
    }

    console.log(
        `Found ${runs.length} matching runs. Saving first match to trace.json...`,
    );
    if (runs.length > 0) {
        const fs = require('fs');
        fs.writeFileSync('trace.json', JSON.stringify(runs[0], null, 2));

        // Also fetch the full tree if this is the root
        if (runs[0].id) {
            console.log('Fetching child runs for trace: ' + runs[0].id);
            const tree = [];
            for await (const child of client.listRuns({
                traceId: runs[0].trace_id,
            })) {
                tree.push(child);
            }
            fs.writeFileSync('trace_tree.json', JSON.stringify(tree, null, 2));
        }
    }
}

main().catch(console.error);
