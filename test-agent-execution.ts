import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PromptRunnerService } from '@kodus/kodus-common/llm';
import { ObservabilityService } from '@libs/core/log/observability.service';
import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import { BugAgentProvider } from './libs/code-review/infrastructure/agents/bug-agent.provider';

class MockPromptRunnerService {}
class MockObservabilityService {
    startTrace() { return { end: () => {} }; }
    addEvent() {}
}
class MockPermissionValidationService {
    async getBYOKConfig() {
        return {
            provider: 'gemini',
            model: 'gemini-3.1-pro-preview',
            apiKey: process.env.GOOGLE_API_KEY
        };
    }
}

class MockRemoteCommands {
    async grep(pattern: string, path: string, glob: string) {
        console.log(`\n🛠️  [TOOL CALL] grep: pattern="${pattern}"`);
        return `src/auth.ts:42: function login() {\n`;
    }
    async read(path: string, startLine: number, endLine: number) {
        console.log(`\n🛠️  [TOOL CALL] readFile: path="${path}"`);
        return `import { user } from 'db';\n\nfunction login() {\n  if (!user) return;\n}\n`;
    }
    async listDir(path: string, depth: number) {
        return `src/\nsrc/auth.ts\n`;
    }
    async exec(cmd: string) {
        console.log(`\n🛠️  [TOOL CALL] shell: cmd="${cmd}"`);
        return { stdout: `Executed: ${cmd}`, stderr: '' };
    }
}

@Module({
    providers: [
        { provide: PromptRunnerService, useClass: MockPromptRunnerService },
        { provide: ObservabilityService, useClass: MockObservabilityService },
        { provide: PermissionValidationService, useClass: MockPermissionValidationService },
        BugAgentProvider
    ],
})
class TestModule {}

async function run() {
    console.log("🚀 Iniciando Simulação...");
    const app = await NestFactory.createApplicationContext(TestModule);
    const agent = app.get(BugAgentProvider);

    const input: any = {
        organizationAndTeamData: { organizationId: 'org_1', teamId: 'team_1' },
        changedFiles: [
            {
                filename: 'src/auth.ts',
                status: 'modified',
                patch: '@@ -40,5 +40,5 @@\n function login() {\n-  if (user) return;\n+  if (!user) return;\n   // new logic\n }'
            }
        ],
        remoteCommands: new MockRemoteCommands(),
        prNumber: 999,
        repositoryFullName: 'test-repo',
        languageResultPrompt: 'Respond in English',
        onAgentProgress: (event: any) => {
            console.log(`\n📈 [PROGRESS EVENT] Status: ${event.status} | Step: ${event.step}`);
            if (event.toolCalls) {
                event.toolCalls.forEach((tc: any) => console.log(`   ⚙️ Tool used: ${tc.tool}`));
            }
        }
    };

    try {
        const result = await agent.execute(input);
        console.log("\n✅ FINALIZADO!");
        console.log(`⏱️ Tempo: ${result.durationMs}ms | Turnos: ${result.turnsUsed}`);
    } catch (e) {
        console.error("\n❌ Erro:", e);
    }
    await app.close();
}

run();
