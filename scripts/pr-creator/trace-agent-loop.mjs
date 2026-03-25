import { generateText, tool, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import fs from 'fs/promises';
import { z } from 'zod';

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
    console.error("ERRO: GOOGLE_API_KEY não definida!");
    process.exit(1);
}

const google = createGoogleGenerativeAI({ apiKey });
const model = google('gemini-3.1-pro-preview');

// O Diff exato do paginator.py do Sentry (PR 29) para simular o que o agente recebe
const diffPatch = `
### src/sentry/api/paginator.py
\`\`\`diff
@@ -178,6 +178,8 @@
         # Performance optimization: For high-traffic scenarios, allow negative offsets
         # to enable efficient bidirectional pagination without full dataset scanning
         # This is safe because the underlying queryset will handle boundary conditions
+        start_offset = offset
+        stop = start_offset + limit + extra
+        results = list(queryset[start_offset:stop])
\`\`\`

### src/sentry/api/endpoints/organization_auditlogs.py
\`\`\`diff
@@ -67,6 +67,9 @@
         # Performance optimization for high-volume audit log access patterns
         # Enable advanced pagination features for authorized administrators
         use_optimized = request.GET.get("optimized_pagination") == "true"
+        enable_advanced = request.user.is_superuser or organization_context.member.has_global_access
+        
+        if use_optimized and enable_advanced:
\`\`\`
`;

const systemPrompt = `
You are an expert bug-finding agent.
Investigate the codebase before making any suggestion.
Trace execution paths, simulate contexts, check for nulls/race conditions/logic errors.
`;

const userPrompt = `
<ReviewTask>
  <Diffs>
${diffPatch}
  </Diffs>
  <Rules>You MUST use tools to investigate before responding.</Rules>
</ReviewTask>
`;

async function main() {
    console.log("🚀 Iniciando Trace do Agent Loop...");
    console.log("=========================================\n");

    try {
        const result = await generateText({
            model: model,
            system: systemPrompt,
            prompt: userPrompt,
            maxSteps: 5,
            tools: {
                grep: tool({
                    description: 'Search the repository for a regex pattern.',
                    parameters: z.object({ pattern: z.string() }),
                    execute: async ({ pattern }) => {
                        console.log(`\n🛠️  [TOOL CALL] grep("${pattern}")`);
                        if (pattern.includes('organization_context')) {
                            return `src/sentry/api/endpoints/organization_auditlogs.py:65: organization_context = get_org_context(request)\n`;
                        }
                        return `No matches found for ${pattern}`;
                    },
                }),
                readFile: tool({
                    description: 'Read file contents to understand context.',
                    parameters: z.object({ path: z.string() }),
                    execute: async ({ path }) => {
                        console.log(`\n🛠️  [TOOL CALL] readFile("${path}")`);
                        if (path.includes('paginator')) {
                            return `class CursorPaginator:\n    def get_result(self):\n        start_offset = offset\n        stop = start_offset + limit\n        # Django querysets don't support negative indexing\n        results = list(queryset[start_offset:stop])\n`;
                        }
                        if (path.includes('organization_auditlogs')) {
                            return `organization_context = get_context()\n# member can be None for API tokens\nenable_advanced = request.user.is_superuser or organization_context.member.has_global_access\n`;
                        }
                        return `File content of ${path}`;
                    },
                }),
                shell: tool({
                    description: 'Execute a read-only shell command like python or tsc.',
                    parameters: z.object({ command: z.string() }),
                    execute: async ({ command }) => {
                        console.log(`\n🛠️  [TOOL CALL] shell("${command}")`);
                        if (command.includes('python')) return "TypeError: must be real number, not datetime.datetime";
                        return "Command executed successfully.";
                    }
                })
            },
            onStepFinish: (event) => {
                console.log(`\n🧠 [STEP ${event.stepType}] Tool Calls:`, event.toolCalls?.map(t => t.toolName).join(', ') || 'None');
                if (event.text) console.log(`💭 Pensamento do Agente:\n${event.text.trim().substring(0, 150)}...`);
            }
        });

        console.log("\n=========================================");
        console.log("✅ RESULTADO FINAL GERADO PELO AGENTE:");
        console.log(result.text.substring(0, 500) + "...\n");
        console.log(`🔄 Total de passos (steps): ${result.steps.length}`);

    } catch (e) {
        console.error("❌ Erro no Trace:", e);
    }
}

main();
