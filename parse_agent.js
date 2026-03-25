const fs = require('fs');

function parseTrace(filename) {
    const data = fs.readFileSync(filename, 'utf-8');
    const lines = data.split('\n');
    let output = [];
    
    let currentBlock = null;

    for (const line of lines) {
        if (line.includes('[TOOL CALL]')) {
            const toolName = line.split('[TOOL CALL]')[1].trim();
            currentBlock = { type: 'tool', name: toolName, input: '', output: '' };
            output.push(currentBlock);
        } else if (line.includes('[LLM CALL]')) {
            const modelName = line.split('[LLM CALL]')[1].trim();
            currentBlock = { type: 'llm', model: modelName, text: '' };
            output.push(currentBlock);
        } else if (currentBlock) {
            if (currentBlock.type === 'tool') {
                if (line.trim().startsWith('Input:')) {
                    currentBlock.input = line.substring(line.indexOf('Input:') + 6).trim();
                } else if (line.trim().startsWith('Output:')) {
                    currentBlock.output = line.substring(line.indexOf('Output:') + 7).trim();
                }
            } else if (currentBlock.type === 'llm') {
                if (line.trim().startsWith('Resposta:')) {
                    currentBlock.text = line.substring(line.indexOf('Resposta:') + 9).trim();
                }
            }
        }
    }

    return output;
}

const agents = ['bug', 'perf', 'sec'];
for (const agent of agents) {
    console.log(`\n=== ${agent.toUpperCase()} AGENT ===`);
    const trace = parseTrace(`${agent}_agent_trace.txt`);
    
    for (const item of trace) {
        if (item.type === 'tool') {
            console.log(`TOOL: ${item.name}`);
            try {
                // Try to pretty print the input if it's JSON
                const parsed = JSON.parse(item.input);
                if (item.name === 'readFile') console.log(`  File: ${parsed.filePath || parsed.path}`);
                else if (item.name === 'grepFile') console.log(`  Regex: ${parsed.regex} in ${parsed.directory}`);
                else if (item.name === 'sandbox') console.log(`  Cmd: ${parsed.command}`);
                else console.log(`  Input: ${item.input}`);
            } catch {
                console.log(`  Input: ${item.input}`);
            }
        } else if (item.type === 'llm') {
            if (item.text) {
                console.log(`REASONING: ${item.text.substring(0, 150)}...`);
            }
        }
    }
}
