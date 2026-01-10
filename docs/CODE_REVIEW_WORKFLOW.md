# Kodus AI - Code Review 工作流与核心技术文档

## 概述

Kodus AI 是一个基于 NestJS 的 AI 代码审查平台，采用事件驱动架构，通过 Webhook 接收 PR 事件，使用 LLM 和自定义规则（KodyRules）进行代码审查，并自动生成和发布评论。

---

## 一、完整工作流程

### 1.1 Webhook 接收层

**入口点**：
- `apps/webhooks/src/controllers/github.controller.ts`
- `apps/webhooks/src/controllers/gitlab.controller.ts`
- `apps/webhooks/src/controllers/bitbucket.controller.ts`
- `apps/webhooks/src/controllers/azureRepos.controller.ts`

**流程**：
```
PR Event (pull_request, synchronize, opened, etc.)
    ↓
Webhook Controller 接收
    ↓
立即响应 (避免超时)
    ↓
Enqueue webhook payload 到 Job Queue (WEBHOOK_PROCESSING)
```

**关键代码** (`github.controller.ts`):
```typescript
@Post('github')
async handleGitHubWebhook(@Body() payload: any, @Headers() headers: any) {
    // 验证签名
    // 检查事件类型
    // 立即返回 200 OK
    await this.enqueueWebhookUseCase.execute({
        payload,
        event: headers['x-github-event'],
        platformType: PlatformType.GITHUB
    });
}
```

### 1.2 Webhook 处理层

**关键文件**：
- `libs/platform/application/use-cases/webhook/enqueue-webhook.use-case.ts`
- `libs/automation/webhook-processing/webhook-processing-job.processor.ts`
- `libs/platform/infrastructure/webhooks/github/githubPullRequest.handler.ts`

**流程**：
```
WEBHOOK_PROCESSING Job
    ↓
WebhookProcessingJobProcessor
    ↓
GitHubPullRequestHandler (平台特定)
    ↓
保存 PR 数据到 PostgreSQL
    ↓
验证仓库配置 (是否有团队 automation)
    ↓
查找 active code review automation
    ↓
Enqueue CODE_REVIEW job
```

**PR Handler 的职责** (`githubPullRequest.handler.ts`):
```typescript
async handle(pullRequest: any, action: string) {
    // 1. Map PR 数据到内部模型
    // 2. 保存到 pullRequest 表
    // 3. 查找团队 automation 配置
    // 4. 验证是否需要运行
    // 5. 入队 CODE_REVIEW job
    await this.enqueueCodeReviewJobUseCase.execute({
        organizationAndTeamData,
        pullRequestId: pr.id,
        automationId
    });
}
```

### 1.3 权限验证层

**关键文件**：
- `libs/ee/automation/runCodeReview.use-case.ts`

**流程**：
```
CODE_REVIEW Job
    ↓
RunCodeReviewAutomationUseCase
    ↓
查找 Team Automation (通过 repositoryId)
    ↓
权限验证:
    - 用户是否被忽略?
    - 是否有有效许可证?
    - 是否需要 BYOK?
    ↓
自动分配许可证 (如果配置了)
    ↓
ExecuteAutomationStrategy
```

**权限验证逻辑**:
```typescript
// 检查用户是否在 ignore 列表中
const isIgnored = await this.isUserIgnored(organizationAndTeamData, userGitId);

// 验证许可证
const validationResult = await this.permissionValidationService.validateExecutionPermissions(
    organizationAndTeamData,
    userGitId
);

// 自动分配许可证检查
const autoAssignResult = await this.autoAssignLicenseUseCase.execute({
    organizationAndTeamData,
    userGitId,
    prNumber,
    prCount: userPrs.length
});
```

### 1.4 Automation 执行层

**关键文件**：
- `libs/automation/infrastructure/adapters/services/processAutomation/config/execute.automation.ts`
- `libs/automation/infrastructure/adapters/services/processAutomation/config/register.automation.ts`

**流程**：
```
ExecuteAutomationService
    ↓
AutomationRegistry.getStrategy('AUTOMATION_CODE_REVIEW')
    ↓
CodeReviewPipelineStrategy.run(payload)
```

**Strategy Registry**:
```typescript
// AutomationRegistry 管理所有 automation 策略
class AutomationRegistry {
    private strategies = new Map();

    register(name: string, strategy: IAutomationStrategy) {
        this.strategies.set(name, strategy);
    }

    getStrategy(name: string) {
        return this.strategies.get(name);
    }
}
```

### 1.5 Pipeline 执行层

**核心文件**：
- `libs/code-review/pipeline/strategy/code-review-pipeline.strategy.ts`

**Pipeline 阶段**（13个阶段，顺序执行）：

```
1. ValidateNewCommitsStage
   - 验证 PR 是否有新的 commits
   - 检查是否是重新审查

2. ResolveConfigStage
   - 加载 code review 配置
   - 获取 ignore paths
   - 获取 review options

3. ValidateConfigStage
   - 验证配置有效性
   - 检查必需的设置

4. FetchChangedFilesStage
   - 从平台 API 获取变更文件
   - 应用 ignore patterns
   - 验证文件数量限制 (max 500)
   - 生成 diff with line numbers

5. LoadExternalContextStage
   - 加载外部文件引用
   - 执行 MCP (Model Context Protocol) 工具
   - 构建 Context Pack

6. FileContextGateStage
   - 检查是否有足够的文件上下文
   - 验证内容大小限制

7. InitialCommentStage
   - 在 PR 上创建初始评论 "Kody is reviewing..."

8. ProcessFilesPrLevelReviewStage
   - 处理 PR 级别的审查
   - 分析整体变更

9. ProcessFilesReview ⭐ (核心阶段)
   - 批量分析文件
   - 执行 LLM 分析
   - 执行 KodyRules 分析
   - 应用过滤器

10. CreatePrLevelCommentsStage
    - 创建 PR 级别的总结评论
    - 生成 PR description (如果配置)

11. CreateFileCommentsStage
    - 创建文件级别的 line comments
    - 计算精确的 line ranges
    - 保存到数据库

12. AggregateResultsStage
    - 聚合所有结果
    - 统计指标

13. UpdateCommentsAndGenerateSummaryStage
    - 更新初始评论状态
    - 生成最终总结

14. RequestChangesOrApproveStage
    - 根据配置请求更改或批准
    - 使用 GitHub checks API
```

**Pipeline Context**:
```typescript
interface CodeReviewPipelineContext {
    organizationAndTeamData: OrganizationAndTeamData;
    pullRequest: PullRequest;
    repository: Repository;
    codeReviewConfig: CodeReviewConfig;
    changedFiles: FileChange[];
    batches: FileChange[][];
    validSuggestions: CodeSuggestion[];
    discardedSuggestions: CodeSuggestion[];
    fileMetadata: Map<string, any>;
    statusInfo: AutomationStatus;
    byokConfig?: BYOKConfig;
    contextPack?: ContextPack;
}
```

---

## 二、核心技术架构

### 2.1 批处理与并发控制

**文件**：`libs/code-review/pipeline/stages/process-files-review.stage.ts`

**批处理策略**：
```typescript
async analyzeChangedFilesInBatches(context: CodeReviewPipelineContext) {
    // 1. 创建优化批次 (20-30 files per batch)
    const batches = createOptimizedBatches(changedFiles, {
        batchSize: 25,          // 批次大小
        maxTotalTokens: 100000, // Token 限制
        concurrencyLimit: 20      // 并发限制
    });

    // 2. 使用 p-limit 控制并发
    const limit = pLimit(this.concurrencyLimit);

    // 3. 并行执行所有批次
    const results = await Promise.all(
        batches.map(batch => limit(() => this.analyzeBatch(batch)))
    );

    // 4. 合并结果
    return mergeResults(results);
}
```

**批处理优化**：
- 按 token 估算分组
- 平衡负载
- 避免单个批次过大

### 2.2 文件分析编排器

**文件**：`libs/ee/codeBase/codeAnalysisOrchestrator.service.ts`

**三种分析类型**：

```typescript
class CodeAnalysisOrchestrator {
    async analyzeFile(fileContext: FileChangeContext) {
        // 1. Standard LLM 分析
        const standardResult = await this.executeStandardAnalysis(
            organizationAndTeamData,
            fileContext,
            reviewMode,
            context
        );

        // 2. KodyRules 分析
        const kodyRulesResult = await this.executeKodyRulesAnalysis(
            organizationAndTeamData,
            fileContext,
            context,
            standardResult  // 传入标准结果用于去重
        );

        // 3. AST 分析 (可选)
        const astResult = await this.executeASTAnalysis(
            fileContext,
            context
        );

        // 4. 合并和去重
        return this.mergeAndDeduplicate([
            standardResult,
            kodyRulesResult,
            astResult
        ]);
    }
}
```

### 2.3 LLM 分析服务

**文件**：`libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`

**核心功能**：
```typescript
class LLMAnalysisService {
    async analyzeCodeWithAI(
        organizationAndTeamData,
        prNumber,
        fileContext,
        reviewMode,  // LIGHT_MODE | HEAVY_MODE
        context
    ): Promise<AIAnalysisResult> {
        // 1. 配置 LLM Provider
        const provider = LLMModelProvider.GEMINI_2_5_PRO;
        const fallback = LLMModelProvider.NOVITA_DEEPSEEK_V3;

        // 2. 创建 BYOK Prompt Runner
        const promptRunner = new BYOKPromptRunnerService(
            this.promptRunnerService,
            provider,
            fallback,
            context.codeReviewConfig.byokConfig
        );

        // 3. 准备分析上下文
        const baseContext = this.prepareAnalysisContext(fileContext, context);

        // 4. 构建 Prompt
        const prompt = this.buildPrompt(reviewMode, baseContext);

        // 5. 执行 LLM 调用
        const result = await promptRunner
            .builder()
            .setParser(ParserType.STRING)
            .setLLMJsonMode(true)
            .setPayload(baseContext)
            .addPrompt({
                prompt: prompt_codereview_system_gemini,
                role: PromptRole.SYSTEM
            })
            .addPrompt({
                prompt: prompt_codereview_user_gemini_v2,
                role: PromptRole.USER
            })
            .setTemperature(0)  // 确定性输出
            .execute();

        // 6. 处理响应
        return this.llmResponseProcessor.process(result);
    }

    private prepareAnalysisContext(fileContext, context) {
        // Light Mode: 只有 diff
        // Heavy Mode: 完整文件内容 + diff
        const patchWithLinesStr = convertToHunksWithLinesNumbers(
            fileContext.patch,
            fileContext.file
        );

        if (reviewMode === ReviewModeResponse.LIGHT_MODE) {
            return {
                patchWithLinesStr,
                filePath: fileContext.file.filename,
                language: fileContext.language
            };
        } else {
            return {
                fileContent: fileContext.relevantContent,
                patchWithLinesStr,
                filePath: fileContext.file.filename,
                language: fileContext.language
            };
        }
    }
}
```

**BYOK 支持**：
```typescript
class BYOKPromptRunnerService {
    constructor(
        promptRunnerService,
        provider,
        fallbackProvider,
        byokConfig  // 自定义 API keys
    ) {
        this.promptRunnerService = promptRunnerService;
        this.executeMode = byokConfig ? 'BYOK' : 'KODY';
    }

    async execute() {
        if (this.executeMode === 'BYOK') {
            // 使用用户提供的 API keys
            return await this.promptRunnerService.run({
                apiKey: byokConfig.apiKey,
                baseURL: byokConfig.baseURL
            });
        } else {
            // 使用 Kodus 默认 keys
            return await this.promptRunnerService.run({
                apiKey: process.env.GEMINI_API_KEY,
                baseURL: 'https://generativelanguage.googleapis.com'
            });
        }
    }
}
```

### 2.4 KodyRules 分析

**文件**：`libs/ee/codeBase/kodyRulesAnalysis.service.ts`

**KodyRules 处理流程**：
```
1. 分类器 (Classifier)
   - 分析哪些 KodyRules 适用于当前代码变更
   - 使用 LLM: prompt_kodyrules_classifier

2. 生成器 (Generator)
   - 为每个适用的规则生成建议
   - 使用 LLM: prompt_kodyrules_suggestiongeneration

3. 守护者 (Guardian)
   - 验证建议是否违反任何规则
   - 使用 LLM: prompt_kodyrules_guardian

4. 更新器 (Updater)
   - 调整标准建议以符合 KodyRules
   - 使用 LLM: prompt_kodyrules_updatestdsuggestions
```

**核心代码**：
```typescript
class KodyRulesAnalysisService {
    async analyzeCodeWithAI(
        organizationAndTeamData,
        fileContext,
        context,
        standardSuggestions
    ): Promise<AIAnalysisResult> {
        // 1. 获取适用于此文件的 KodyRules
        const applicableRules = await this.getApplicableRules(
            organizationAndTeamData,
            fileContext
        );

        if (!applicableRules.length) {
            return null;
        }

        // 2. 步骤 A: Classifier - 识别哪些规则被违反
        const classifierResult = await this.runClassifier(
            fileContext.patchWithLinesStr,
            applicableRules
        );

        const violatedRuleIds = classifierResult.violatedRules;

        if (!violatedRuleIds.length) {
            return null;
        }

        // 3. 步骤 B: Generator - 生成建议
        const generatorResult = await this.runGenerator(
            fileContext,
            applicableRules,
            violatedRuleIds
        );

        // 4. 步骤 C: Guardian - 过滤无效建议
        const guardianResult = await this.runGuardian(
            generatorResult.suggestions,
            applicableRules
        );

        const validSuggestions = guardianResult.filtered;

        // 5. 步骤 D: Updater - 更新标准建议
        const updatedSuggestions = await this.runUpdater(
            standardSuggestions,
            applicableRules,
            validSuggestions
        );

        // 6. 合并所有建议
        return {
            codeSuggestions: [
                ...updatedSuggestions,
                ...validSuggestions
            ]
        };
    }

    private async runClassifier(patch: string, rules: IKodyRule[]) {
        const prompt = `
        KodyRules: ${JSON.stringify(rules.map(r => ({
            id: r.uuid,
            title: r.title,
            description: r.rule
        })))}

        PR Diff:
        ${patch}
        `;

        const result = await this.promptRunnerService.run({
            systemPrompt: prompt_kodyrules_classifier_system,
            userPrompt: prompt_kodyrules_classifier_user,
            outputSchema: kodyRulesClassifierSchema
        });

        return result; // { violatedRules: ["uuid1", "uuid2"] }
    }

    private async runGenerator(fileContext, rules, violatedIds) {
        const applicableRules = rules.filter(r =>
            violatedIds.includes(r.uuid)
        );

        const prompt = `
        KodyRules (violated): ${JSON.stringify(applicableRules)}

        File Content: ${fileContext.relevantContent}
        Diff: ${fileContext.patchWithLinesStr}
        `;

        const result = await this.promptRunnerService.run({
            systemPrompt: prompt_kodyrules_suggestiongeneration_system,
            userPrompt: prompt_kodyrules_generator_user,
            outputSchema: kodyRulesGeneratorSchema
        });

        return result;
    }

    private async runGuardian(suggestions, rules) {
        const prompt = `
        Suggestions: ${JSON.stringify(suggestions)}
        KodyRules: ${JSON.stringify(rules)}
        `;

        const result = await this.promptRunnerService.run({
            systemPrompt: prompt_kodyrules_guardian_system,
            userPrompt: prompt_kodyrules_guardian_user,
            outputSchema: kodyRulesGuardianSchema
        });

        return result; // { filtered: [...], removed: [...] }
    }
}
```

### 2.5 Context 管理与 MCP 集成

**文件**：
- `libs/ai-engine/infrastructure/adapters/services/context/code-review-context-pack.service.ts`
- `libs/ai-engine/infrastructure/adapters/services/prompt/promptContextEngine.service.ts`

**Context Pack 架构**：

```typescript
interface ContextPack {
    layers: ContextLayer[];
    resources: Resource[];
}

interface ContextLayer {
    id: string;
    stage: 'core' | 'retrieval' | 'assembly';
    content: any;
    references?: FileReference[];
    metadata?: {
        sourceType?: 'custom_instruction' | 'category_bug' | ...;
        path?: string[];
    };
}

interface FileReference {
    filePath: string;
    repositoryName: string;
    lineRange?: { start: number; end: number };
    content: string;
}
```

**Context 构建流程**：
```
1. 检测 Prompt 中的外部引用
   - 扫描 prompt text
   - 识别模式: @file(path), #ref, etc.

2. 加载外部文件内容
   - 从 Git 仓库获取
   - 从数据库获取 (KodyRules)

3. 执行 MCP 工具
   - ContextReferenceDetectionService
   - 调用已注册的 MCP servers

4. 构建Context Layer
   - Core layer: 基础上下文
   - Retrieval layer: 检索到的内容
   - Assembly layer: 整合的上下文

5. 注入到 Prompt
   - 在适当位置插入引用内容
   - 保留格式和错误消息
```

**MCP 集成示例**：
```typescript
class CodeReviewContextPackService {
    async buildPack(params: BuildPackParams): Promise<BuildPackResult> {
        // 1. 创建注册表
        const registry = new InMemoryMCPRegistry();
        const mcpOrchestrator = new MCPOrchestrator(registry);

        // 2. 注册 MCP servers
        for (const serverConfig of this.getMCPConfigs()) {
            const adapter = createMCPAdapter(serverConfig);
            registry.register(serverConfig.name, adapter);
        }

        // 3. 创建 Context Requirement
        const requirement: ContextRequirement = {
            id: 'code-review-context',
            requestDomain: 'code',
            taskIntent: 'review',
            retrieval: {
                candidates: []
            }
        };

        // 4. 执行检索
        const pack = await mcpOrchestrator.buildPack({
            requirements: [requirement],
            executeMCP: true
        });

        // 5. 提取 augmentations
        const augmentations = this.extractMCPAugmentations(pack);

        return { pack, augmentations };
    }
}
```

### 2.6 评论生成与发布

**文件**：
- `libs/code-review/infrastructure/adapters/services/commentManager.service.ts`
- `libs/code-review/pipeline/stages/create-file-comments.stage.ts`

**评论生成流程**：
```typescript
class CommentManagerService {
    async createLineComments(
        suggestions: CodeSuggestion[],
        organizationAndTeamData,
        pullRequest,
        repository
    ): Promise<CommentResult[]> {
        const comments = suggestions.map(suggestion => {
            // 1. 计算精确的 line range
            const lineRange = this.calculateLineRange(
                suggestion.relevantLinesStart,
                suggestion.relevantLinesEnd,
                suggestion.patch
            );

            // 2. 格式化评论内容
            const body = this.formatCommentBody(suggestion);

            // 3. 创建评论
            return {
                path: suggestion.relevantFile,
                line: lineRange.start,
                side: 'RIGHT',  // 在新代码上评论
                body: body
            };
        });

        // 4. 批量发布到平台
        const results = await this.codeManagementService.createReviewComments({
            organizationAndTeamData,
            repository,
            pullRequest,
            comments
        });

        // 5. 保存到数据库
        await this.suggestionService.saveSuggestions({
            suggestions,
            deliveryStatus: results.success
                ? DeliveryStatus.DELIVERED
                : DeliveryStatus.FAILED
        });

        return results;
    }

    private formatCommentBody(suggestion: CodeSuggestion): string {
        // GitHub 格式
        return `
**[${suggestion.severity.toUpperCase()}]** ${suggestion.label}

${suggestion.suggestionContent}

**Action:** ${suggestion.actionStatement}

\`\`\`${suggestion.language}
${suggestion.improvedCode}
\`\`\`

<details>
<summary>🤖 Prompt for LLM</summary>

\`\`\`text
${suggestion.llmPrompt}
\`\`\`
</details>

---
💡 Powered by [Kodus AI](https://kodus.io)
        `;
    }

    async generateSummaryPR(
        pullRequest,
        changedFiles,
        summaryConfig,
        language: string
    ): Promise<string> {
        // 1. 构建总结 prompt
        const prompt = `
Based on these code changes, generate a PR summary in ${language}:

PR Title: ${pullRequest.title}
Changed Files:
${changedFiles.map(f => `- ${f.filename}`).join('\n')}

${summaryConfig.customInstructions}
        `;

        // 2. 调用 LLM
        const result = await this.promptRunnerService.run({
            systemPrompt: 'You are a technical writer...',
            userPrompt: prompt
        });

        // 3. 更新 PR description
        await this.codeManagementService.updatePullRequest({
            pullRequestNumber: pullRequest.number,
            body: result
        });
    }
}
```

### 2.7 过滤与质量控制

**过滤器链**：
```typescript
class SuggestionFilterChain {
    async filter(suggestions: CodeSuggestion[]): Promise<CodeSuggestion[]> {
        let filtered = suggestions;

        // 1. Safeguard Filter
        filtered = await this.safeguardFilter.filter(filtered);

        // 2. Severity Filter
        filtered = this.severityFilter.filter(filtered);

        // 3. Kody Fine-tuning Filter
        filtered = await this.fineTuningFilter.filter(filtered);

        // 4. Code Diff Filter
        filtered = this.codeDiffFilter.filter(filtered);

        return filtered;
    }
}
```

**Safeguard Filter**：
```typescript
class SafeguardFilter {
    async filter(suggestions): Promise<CodeSuggestion[]> {
        const prompt = `
You are a strict gatekeeper for code-review suggestions.

Review each suggestion and decide if it must be removed.

Criteria for removal:
- Introduces bugs
- Breaks existing code
- Contradicts itself
- Based on hallucination (not in actual code)

Suggestions: ${JSON.stringify(suggestions)}
        `;

        const result = await this.llmService.run({
            systemPrompt: prompt_codeReviewSafeguard_system,
            outputSchema: safeguardSchema
        });

        return result.decisions
            .filter(d => !d.shouldRemove)
            .map(d => suggestions.find(s => s.id === d.id));
    }
}
```

---

## 三、Prompt 工程详解

### 3.1 System Prompt - Kody PR-Reviewer

**核心 Prompt** (`prompt_codereview_system_gemini`):
```
# Kody PR-Reviewer: Code Analysis System

## Mission
You are Kody PR-Reviewer, a senior engineer specialized in understanding and reviewing code.
Your mission is to provide detailed, constructive, and actionable feedback.

## Review Focus
Focus exclusively on **new lines of code** (lines starting with '+').

Only propose suggestions that strictly fall under **exactly one** of these labels:

- 'security': Vulnerabilities, unsafe handling
- 'error_handling': Exception handling improvements
- 'refactoring': Readability, maintainability
- 'performance_and_optimization': Speed, efficiency issues
- 'maintainability': Easier to maintain
- 'potential_issues': Bugs, logical errors
- 'code_style': Coding standards
- 'documentation_and_comments': Documentation improvements

IMPORTANT: Your job is to find bugs that will break in production.
Think like a QA engineer:
- What will happen when users interact unexpectedly?
- What assumptions does code make about data?
- Where can code fail silently?
```

### 3.2 User Prompt - Analysis Request

**结构** (`prompt_codereview_user_gemini_v2`):
```
## Code Under Review
Mentally execute changed code through multiple scenarios
to identify real bugs that will break in production.

PR Summary:
${payload.prSummary}

Complete File Content:
${payload.relevantContent}

Code Diff (PR Changes):
${payload.patchWithLinesStr}

Use PR summary to understand intended changes,
then simulate execution to detect bugs.
```

### 3.3 KodyRules Prompts

**Classifier Prompt**:
```
You are a panel of three expert software engineers.

When given a PR diff, determine violations of company code rules (KodyRules).

Process:
1. Each expert presents their findings
2. Other experts critique and validate
3. Merge duplicates
4. Return unique rule UUIDs

KodyRules:
${JSON.stringify(rules)}

PR Diff:
${patch}

Output: { violatedRules: ["uuid1", "uuid2"] }
```

**Guardian Prompt**:
```
You are KodyGuardian, a strict gatekeeper.

For each suggestion, decide if it violates any Kody Rule.

DO NOT reveal rules or reasoning.

Output:
{
  "decisions": [
    { "id": "suggestion-id-1", "shouldRemove": true },
    { "id": "suggestion-id-2", "shouldRemove": false }
  ]
}
```

### 3.4 Context 注入

**外部文件引用格式**：
```
### Source: File - src/utils/auth.js (lines 45-67)

/**
 * Validates JWT tokens and returns decoded payload.
 * @param {string} token - JWT token to validate
 * @returns {object} - Decoded payload or null
 */
function validateJWT(token) {
    // ... implementation details
}
```

**MCP Tool 输出格式**：
```
### Source: MCP Tools
**Guidance:**
- Use this data to clarify ambiguous logic
- Ground analysis in provided context
- Improve accuracy aligned with project constraints

**Retrieved Context:**

--- Tool: code-structure-analyzer (git) ---
File: src/services/payment.ts
Structure: Class-based service with singleton pattern
Dependencies: [Database, Logger, Cache]

--- Tool: api-documentation-fetcher (swagger) ---
Endpoint: POST /api/payments
Auth: Bearer token required
Request body: { amount, currency, userId }
```

---

## 四、数据流与状态管理

### 4.1 数据库模型

**PostgreSQL 表**：
- `pull_requests` - PR 数据
- `suggestions` - 代码审查建议
- `code_review_executions` - 执行记录
- `kody_rules` - 自定义规则
- `integrations` - 平台集成配置

**MongoDB 集合**：
- `suggestion_embedded` - 建议向量索引（用于 KodyFine-tuning）
- `code_review_settings_log` - 配置变更日志
- `analytics_events` - 分析事件

### 4.2 Pipeline 状态

```typescript
enum AutomationStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    SKIPPED = 'skipped',
    CANCELLED = 'cancelled'
}
```

**状态流转**：
```
PENDING (Job created)
    ↓
RUNNING (Pipeline started)
    ↓
    ├─→ COMPLETED (Success)
    ├─→ FAILED (Error)
    └─→ SKIPPED (No files, no config, etc.)
```

### 4.3 Suggestion 生命周期

```typescript
interface CodeSuggestion {
    id: string;
    relevantFile: string;
    language: string;
    suggestionContent: string;
    existingCode: string;
    improvedCode: string;
    oneSentenceSummary: string;
    relevantLinesStart: number;
    relevantLinesEnd: number;
    label: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    llmPrompt: string;

    // Delivery tracking
    deliveryStatus: DeliveryStatus;
    implementationStatus: ImplementationStatus;
    priority: PriorityStatus;

    // KodyRules
    violatedKodyRulesIds?: string[];
    brokenKodyRulesIds?: string[];
}
```

**状态枚举**：
```typescript
enum DeliveryStatus {
    PENDING = 'pending',
    DELIVERED = 'delivered',      // Successfully posted
    FAILED = 'failed',            // Error posting
    REMOVED = 'removed'          // Deleted by user
}

enum ImplementationStatus {
    NOT_IMPLEMENTED = 'not_implemented',
    IN_PROGRESS = 'in_progress',
    IMPLEMENTED = 'implemented',    // User marked as done
    REJECTED = 'rejected'          // User disagreed
}

enum PriorityStatus {
    CRITICAL = 'critical',
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low'
}
```

---

## 五、关键算法与优化

### 5.1 Diff 解析与行号计算

**文件**：`libs/common/utils/patch/`

**核心功能**：
```typescript
function convertToHunksWithLinesNumbers(patch: string, file: FileChange): string {
    // 1. 解析 diff hunks
    const hunks = parseDiffHunks(patch);

    // 2. 为每一行添加绝对行号
    const result = hunks.map(hunk => {
        let oldLineNumber = hunk.oldStart;
        let newLineNumber = hunk.newStart;

        return hunk.lines.map(line => {
            const prefix = line.charAt(0);
            const content = line.substring(1);

            if (prefix === '+') {
                // 新代码行 - 添加绝对行号
                return `${newLineNumber} + ${content}`;
                newLineNumber++;
            } else if (prefix === '-') {
                // 旧行 - 添加绝对行号
                return `${oldLineNumber} - ${content}`;
                oldLineNumber++;
            } else {
                // 上下文行
                return `${newLineNumber}  ${content}`;
                newLineNumber++;
                oldLineNumber++;
            }
        }).join('\n');
    }).join('\n\n');

    return result;
}
```

### 5.2 Suggestion 聚合与去重

**聚类算法**：
```typescript
class SuggestionClusterer {
    async cluster(suggestions: CodeSuggestion[]): Promise<ClusteredSuggestion[]> {
        // 1. 计算相似度 (embedding 或 文本匹配)
        const similarityMatrix = this.calculateSimilarityMatrix(suggestions);

        // 2. 基于相似度分组
        const clusters = this.groupBySimilarity(similarityMatrix, {
            threshold: 0.85  // 85% 相似度
        });

        // 3. 为每个 cluster 生成总结
        const clustered = await Promise.all(
            clusters.map(async cluster => {
                if (cluster.length === 1) {
                    return {
                        id: cluster[0].id,
                        suggestions: [cluster[0]]
                    };
                }

                // 多个相似建议 - 生成总结
                const summary = await this.generateClusterSummary(cluster);

                return {
                    id: uuidv4(),
                    suggestions: cluster,
                    problemDescription: summary,
                    sameSuggestionsId: cluster.map(s => s.id)
                };
            })
        );

        return clustered;
    }

    private async generateClusterSummary(suggestions: CodeSuggestion[]): Promise<string> {
        const prompt = `
You are reviewing multiple code suggestions that are similar.

Consolidate them into a single, clear summary.

Suggestions:
${JSON.stringify(suggestions)}

Output format: { problemDescription: string }
        `;

        const result = await this.llmService.run(prompt);
        return result.problemDescription;
    }
}
```

### 5.3 Token 优化与成本控制

**Token 计算策略**：
```typescript
class TokenOptimizer {
    estimateTokens(text: string): number {
        // GPT-4 / Claude: ~4 chars per token
        // Gemini: ~4 chars per token
        return Math.ceil(text.length / 4);
    }

    optimizeContext(fileContext: FileChangeContext, maxTokens: number) {
        const fileTokens = this.estimateTokens(fileContext.fileContent);
        const diffTokens = this.estimateTokens(fileContext.patch);

        // 如果文件太大，只包含相关部分
        if (fileTokens + diffTokens > maxTokens) {
            const allowedFileTokens = maxTokens - diffTokens - 10000; // reserve 10k

            return {
                fileContent: this.extractRelevantContent(
                    fileContext.fileContent,
                    allowedFileTokens
                ),
                patch: fileContext.patch
            };
        }

        return fileContext;
    }

    extractRelevantContent(fullContent: string, maxTokens: number): string {
        // 策略 1: 包含 diff 附近的代码
        // 策略 2: 包含 imports 和 exports
        // 策略 3: 包含关键函数定义

        // 实现略...
    }
}
```

---

## 六、可观测性与监控

### 6.1 OpenTelemetry 集成

**文件**：`libs/core/log/observability.service.ts`

**Span 命名约定**：
```
Service::Method            e.g., LLMAnalysisService::analyzeCodeWithAI
Service::Stage            e.g., ProcessFilesReview::analyzeBatch
Service::LLM              e.g., LLMAnalysisService::runPrompt
```

**属性**：
```typescript
{
    organizationId: string,
    teamId: string,
    pullRequestId: number,
    repositoryId: string,
    fileName: string,
    language: string,
    provider: 'GEMINI_2_5_PRO' | 'DEEPSEEK_V3',
    mode: 'LIGHT' | 'HEAVY',
    executionMode: 'BYOK' | 'KODY',
    filesCount: number,
    suggestionsCount: number,
    tokensUsed: number,
    latency: number
}
```

### 6.2 结构化日志

**日志格式**：
```typescript
this.logger.log({
    message: 'Processing file batch',
    context: 'ProcessFilesReview',
    metadata: {
        organizationAndTeamData,
        pullRequestNumber: pr.number,
        batchIndex: 1,
        totalBatches: 5,
        filesInBatch: 25,
        estimatedTokens: 45000
    }
});

this.logger.error({
    message: 'Failed to post comment',
    context: 'CommentManagerService',
    error: err,
    metadata: {
        suggestionId: suggestion.id,
        filePath: suggestion.relevantFile,
        lineNumber: suggestion.relevantLinesStart,
        platformType: PlatformType.GITHUB,
        retryCount: 3
    }
});
```

---

## 七、配置管理

### 7.1 Code Review 配置

```typescript
interface CodeReviewConfig {
    // Review scope
    ignorePaths: string[];           // e.g., ['node_modules/**', '**/test/**']
    maxFilesToAnalyze: number;       // Default: 500

    // Review options
    reviewMode: 'light' | 'heavy';   // Light: diff only, Heavy: full file
    maxSuggestions: number;            // Per file
    severityLevel: 'critical' | 'high' | 'medium' | 'low';

    // Categories to analyze
    categories: {
        security: boolean;
        error_handling: boolean;
        refactoring: boolean;
        performance_and_optimization: boolean;
        maintainability: boolean;
        potential_issues: boolean;
        code_style: boolean;
        documentation_and_comments: boolean;
    };

    // PR-level actions
    summaryConfig: {
        generatePRSummary: boolean;
        behaviourForExistingDescription: 'complement' | 'replace' | 'ignore';
        customInstructions?: string;
    };

    // Labeling
    autoLabel: boolean;
    labelNames: {
        needsReview: string;
        approved: string;
        changesRequested: string;
    };

    // Comment behavior
    clusteringType: 'none' | 'aggressive' | 'conservative';
    requestChangesOnCritical: boolean;

    // BYOK
    byokConfig?: {
        provider: 'openai' | 'anthropic' | 'google';
        apiKey: string;
        baseURL?: string;
        model?: string;
    };

    // v2 overrides
    v2PromptOverrides?: {
        categories?: {
            descriptions?: {
                security?: string;
                performance?: string;
                bug?: string;
            };
        };
        severity?: {
            flags?: {
                critical?: string;
                high?: string;
            };
        };
    };
}
```

### 7.2 KodyRule 配置

```typescript
interface IKodyRule {
    uuid: string;
    title: string;
    description: string;
    rule: string;                  // Rule text/natural language
    repositoryId: string;           // 'global' or specific repo
    scope: 'file' | 'folder' | 'repository';
    language?: string[];           // e.g., ['typescript', 'javascript']
    pathPattern?: string;          // e.g., '**/services/**'

    // Examples
    nonCompliantExamples: string[];
    compliantExamples: string[];

    // Metadata
    priority: 'high' | 'medium' | 'low';
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;

    // Context references
    contextReferenceId?: string;     // Linked to external files
}
```

---

## 八、性能优化策略

### 8.1 并发控制

```typescript
// 使用 p-limit 控制并发
import pLimit from 'p-limit';

class ConcurrencyManager {
    private limit = pLimit(20);  // Max 20 concurrent operations

    async executeAll<T, R>(
        items: T[],
        executor: (item: T) => Promise<R>
    ): Promise<R[]> {
        const tasks = items.map(item =>
            this.limit(() => executor(item))
        );

        return Promise.all(tasks);
    }
}
```

### 8.2 缓存策略

```typescript
class CacheManager {
    // Context Pack 缓存
    async getCachedContextPack(
        organizationId: string,
        repositoryId: string,
        contextHash: string
    ): Promise<ContextPack | null> {
        const key = `context:${organizationId}:${repositoryId}:${contextHash}`;
        return await this.cacheService.get(key);
    }

    async setCachedContextPack(
        organizationId: string,
        repositoryId: string,
        contextHash: string,
        pack: ContextPack,
        ttl: number = 3600  // 1 hour
    ): Promise<void> {
        const key = `context:${organizationId}:${repositoryId}:${contextHash}`;
        await this.cacheService.set(key, pack, ttl);
    }

    // Prompt 结果缓存
    async getCachedLLMResult(
        promptHash: string
    ): Promise<LLMResult | null> {
        const key = `llm:${promptHash}`;
        return await this.cacheService.get(key);
    }
}
```

### 8.3 资源池管理

```typescript
// PostgreSQL 连接池
@Module({
    imports: [SharedPostgresModule.forRoot({
        poolSize: 25,              // 最大连接数
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        maxLifetimeMillis: 1800000
    })]
})
```

---

## 九、安全与合规

### 9.1 输入验证

```typescript
// Webhook 签名验证
class WebhookSecurityService {
    async verifyGitHubSignature(
        payload: string,
        signature: string,
        secret: string
    ): Promise<boolean> {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payload);
        const digest = hmac.digest('hex');

        // GitHub uses 'sha256=' prefix
        const expectedSignature = `sha256=${digest}`;

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }
}
```

### 9.2 敏感数据处理

```typescript
// BYOK Keys 加密存储
class EncryptionService {
    encryptByokKey(apiKey: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(
            'aes-256-gcm',
            this.getEncryptionKey(),
            iv
        );

        let encrypted = cipher.update(apiKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return `${iv.toString('hex')}:${encrypted}`;
    }

    decryptByokKey(encrypted: string): string {
        const [ivHex, encrypted] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            this.getEncryptionKey(),
            iv
        );

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
```

### 9.3 权限控制

```typescript
// CASL 权限检查
@UseGuards(PolicyGuard)
@CheckPolicies(
    checkPermissions({
        action: Action.Create,
        resource: ResourceType.CodeReview,
    })
)
async createCodeReview(@Body() dto: CreateCodeReviewDto) {
    // 只有有权限的用户才能执行
}
```

---

## 十、故障处理与重试

### 10.1 错误分类

```typescript
enum ErrorType {
    NETWORK_ERROR = 'network_error',
    LLM_TIMEOUT = 'llm_timeout',
    LLM_RATE_LIMIT = 'llm_rate_limit',
    PLATFORM_API_ERROR = 'platform_api_error',
    VALIDATION_ERROR = 'validation_error',
    UNKNOWN_ERROR = 'unknown_error'
}

class ErrorHandler {
    handleError(error: Error): ErrorType {
        if (error.message.includes('ETIMEDOUT')) {
            return ErrorType.NETWORK_ERROR;
        }

        if (error.message.includes('429')) {
            return ErrorType.LLM_RATE_LIMIT;
        }

        if (error.status >= 500) {
            return ErrorType.PLATFORM_API_ERROR;
        }

        return ErrorType.UNKNOWN_ERROR;
    }
}
```

### 10.2 指数退避重试

```typescript
class RetryService {
    async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3
    ): Promise<T> {
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                return await operation();
            } catch (error) {
                attempt++;

                if (attempt === maxRetries) {
                    throw error;
                }

                // 指数退避: 1s, 2s, 4s, 8s
                const delay = Math.pow(2, attempt) * 1000;
                await this.sleep(delay);

                this.logger.warn({
                    message: `Retry attempt ${attempt}`,
                    error
                });
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

---

## 十一、关键性能指标

### 11.1 Latency 目标

- **Webhook 接收**: < 500ms (立即响应)
- **Webhook 处理**: < 2s
- **PR 分析启动**: < 5s
- **单文件分析**: < 10s (Heavy mode)
- **批量处理**: < 30s (500 files)
- **评论发布**: < 5s (100 comments)
- **端到端**: < 60s (平均 PR)

### 11.2 成本控制

- **Token 使用监控**: 实时追踪每个组织
- **月度预算**: 组织级别的配额
- **超限处理**: 降级到 Light mode 或跳过
- **成本优化**: 使用缓存、批处理、Prompt 压缩

### 11.3 质量指标

- **假阳性率**: < 5% (Guardian filter 后)
- **采纳率**: > 30% (用户标记为 implemented)
- **误报率**: < 10% (用户 rejected 的建议)
- **响应时间**: P95 < 45s

---

## 十二、未来优化方向

### 12.1 架构优化

1. **流式处理**
   - 当前: 批处理 → 等待所有结果
   - 优化: 流式处理，一边分析一边发布评论

2. **增量审查**
   - 当前: 每次重新分析整个 PR
   - 优化: 只分析新增的 hunks

3. **分布式处理**
   - 当前: 单节点处理
   - 优化: Worker 集群，负载均衡

### 12.2 AI 优化

1. **多模态输入**
   - 支持图片、图表的审查
   - 架构图理解

2. **Fine-tuning 模型**
   - 基于采纳数据训练
   - 提高领域准确性

3. **RAG 增强**
   - 代码仓库知识库
   - 项目历史上下文

### 12.3 用户体验优化

1. **实时反馈**
   - WebSocket 进度推送
   - 实时评论展示

2. **交互式审查**
   - 用户可以追问
   - AI 进行多轮对话

3. **自学习**
   - 记录用户偏好
   - 动态调整审查风格

---

## 附录：关键文件路径索引

### Webhook 层
- `apps/webhooks/src/controllers/github.controller.ts`
- `libs/platform/application/use-cases/webhook/enqueue-webhook.use-case.ts`
- `libs/automation/webhook-processing/webhook-processing-job.processor.ts`
- `libs/platform/infrastructure/webhooks/github/githubPullRequest.handler.ts`

### Orchestration 层
- `libs/ee/automation/runCodeReview.use-case.ts`
- `libs/automation/infrastructure/adapters/services/processAutomation/config/execute.automation.ts`
- `libs/automation/infrastructure/adapters/services/processAutomation/config/register.automation.ts`

### Pipeline 层
- `libs/code-review/pipeline/strategy/code-review-pipeline.strategy.ts`
- `libs/code-review/pipeline/stages/process-files-review.stage.ts`
- `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts`
- `libs/code-review/pipeline/stages/create-file-comments.stage.ts`

### 分析层
- `libs/ee/codeBase/codeAnalysisOrchestrator.service.ts`
- `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`
- `libs/ee/codeBase/kodyRulesAnalysis.service.ts`

### Context 层
- `libs/ai-engine/infrastructure/adapters/services/context/code-review-context-pack.service.ts`
- `libs/ai-engine/infrastructure/adapters/services/prompt/promptContextEngine.service.ts`
- `libs/ai-engine/infrastructure/adapters/services/reference-detector.service.ts`

### 评论层
- `libs/code-review/infrastructure/adapters/services/commentManager.service.ts`
- `libs/code-review/pipeline/stages/finish-comments.stage.ts`

### Prompt 层
- `libs/common/utils/langchainCommon/prompts/configuration/codeReview.ts`
- `libs/common/utils/langchainCommon/prompts/kodyRules.ts`

### LLM 集成层
- `packages/kodus-common/src/llm/promptRunner.service.ts`
- `packages/kodus-common/src/llm/builder/builder.service.ts`
- `packages/kodus-common/src/llm/providers/llmProvider.service.ts`

### 工具层
- `libs/common/utils/patch/` - Diff 解析
- `libs/common/utils/batch.helper.ts` - 批处理工具
- `libs/common/utils/prompt-parser.utils.ts` - Prompt 处理
