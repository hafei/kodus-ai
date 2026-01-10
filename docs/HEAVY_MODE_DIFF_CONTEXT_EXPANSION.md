# Kodus AI - Heavy Mode Diff 上下文扩展技术分析

> 分析日期：2025-01-03
> 项目：Kodus AI (kodus-ai)
> 分析范围：Heavy Mode 的 diff 上下文扩展机制

---

## 目录

- [一、核心流程总览](#一核心流程总览)
- [二、Review Mode 选择机制](#二review-mode-选择机制)
- [三、Prompt 构建机制](#三prompt-构建机制)
- [四、AST 上下文扩展机制](#四ast-上下文扩展机制)
- [五、完整数据流](#五完整数据流)
- [六、关键技术点总结](#六关键技术点总结)
- [七、关键代码文件](#七关键代码文件)

---

## 一、核心流程总览

```
Diff 获取 → Review Mode 选择 → AST 上下文提取 → Prompt 构建 → LLM 分析
```

---

## 二、Review Mode 选择机制

### 2.1 选择入口：`fileReviewContextPreparation.service.ts`

```typescript
// libs/ee/codeReview/fileReviewContextPreparation/file-review-context-preparation.service.ts

protected async determineReviewMode(
    options?: ReviewModeOptions,
    byokConfig?: BYOKConfig,
): Promise<ReviewModeResponse> {
    try {
        const { context } = options;

        // 默认为 HEAVY_MODE
        let reviewMode = ReviewModeResponse.HEAVY_MODE;

        // 检查是否需要自动判断模式
        const shouldCheckMode =
            context?.codeReviewConfig?.reviewModeConfig ===
                ReviewModeConfig.LIGHT_MODE_FULL ||
            context?.codeReviewConfig?.reviewModeConfig ===
                ReviewModeConfig.LIGHT_MODE_PARTIAL;

        if (shouldCheckMode) {
            // 调用 LLM 自动选择模式
            reviewMode = await this.getReviewMode(options, byokConfig);
        }

        return reviewMode;
    } catch (error) {
        this.logger.warn({
            message:
                'Error determining advanced review mode, falling back to basic mode',
            error,
            context: FileReviewContextPreparation.name,
        });

        // 出错时回退到 HEAVY_MODE
        return ReviewModeResponse.HEAVY_MODE;
    }
}
```

### 2.2 LLM 自动判断：`llmAnalysis.service.ts`

```typescript
// libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts

async selectReviewMode(
    organizationAndTeamData: OrganizationAndTeamData,
    prNumber: number,
    provider: LLMModelProvider,
    file: FileChange,
    codeDiff: string,
): Promise<ReviewModeResponse> {
    const fallbackProvider =
        provider === LLMModelProvider.OPENAI_GPT_4O
            ? LLMModelProvider.NOVITA_DEEPSEEK_V3_0324
            : LLMModelProvider.OPENAI_GPT_4O;

    const runName = 'selectReviewMode';

    const payload = { file, codeDiff };
    const spanName = `${LLMAnalysisService.name}::${runName}`;

    const spanAttrs = {
        type: 'system',
        organizationId: organizationAndTeamData?.organizationId,
        prNumber,
    };

    try {
        // 调用 LLM 判断模式
        const { result } = await this.observabilityService.runLLMInSpan({
            spanName,
            runName,
            attrs: spanAttrs,
            exec: async (callbacks) => {
                return await this.promptRunnerService
                    .builder()
                    .setProviders({
                        main: provider,
                        fallback: fallbackProvider,
                    })
                    .setParser(ParserType.STRING)
                    .setLLMJsonMode(true)
                    .setTemperature(0)  // 确定性输出
                    .setPayload(payload)
                    .addPrompt({
                        prompt: prompt_selectorLightOrHeavyMode_system,
                        role: PromptRole.SYSTEM,
                    })
                    .addCallbacks(callbacks)
                    .addMetadata({
                        organizationId:
                            organizationAndTeamData?.organizationId,
                        teamId: organizationAndTeamData?.teamId,
                        pullRequestId: prNumber,
                        provider,
                        fallbackProvider,
                        runName,
                    })
                    .setRunName(runName)
                    .execute();
            },
        });

        if (!result) {
            const message = `No response from select review mode for PR#${prNumber}`;
            this.logger.warn({
                message,
                context: LLMAnalysisService.name,
                metadata: {
                    organizationAndTeamData,
                    prNumber,
                    provider,
                },
            });
            throw new Error(message);
        }

        // 处理 LLM 响应
        const reviewMode =
            this.llmResponseProcessor.processReviewModeResponse(
                organizationAndTeamData,
                prNumber,
                result,
            );

        return reviewMode?.reviewMode || ReviewModeResponse.LIGHT_MODE;
    } catch (error) {
        this.logger.error({
            message: 'Error executing select review mode chain:',
            error,
            context: LLMAnalysisService.name,
            metadata: {
                organizationAndTeamData,
                prNumber,
                provider,
            },
        });
        return ReviewModeResponse.LIGHT_MODE;
    }
}
```

### 2.3 Prompt：`selectorLightOrHeavyMode_system`

**关键判断逻辑**：

```
light_mode 条件：
- 只看 diff 就能完成审查
- 变更是小型的、自包含的、局部的
- 不修改公共接口
- 涉及小型重构或微小修改（例如：重命名局部变量、更新错误消息或日志）

heavy_mode 条件：
- 需要查看整个文件（或更多代码库）来理解变更的影响
- 修改公共方法
- 引入全局变量或常量
- 大规模重构
- 因为这些变更可能影响其他区域，需要更广泛的上下文
```

**示例对比**：

| 示例      | 判断       | 原因                                                      |
| --------- | ---------- | --------------------------------------------------------- |
| Example 1 | light_mode | 局部变量重命名，只在一个函数内                            |
| Example 2 | heavy_mode | 添加全局变量 `static final String _dbName`                |
| Example 3 | heavy_mode | 修改公共接口 `class DatabaseService`                      |
| Example 4 | light_mode | 添加日志语句 `print('Global routing middleware enabled')` |

---

## 三、Prompt 构建机制

### 3.1 LIGHT_MODE Prompt

```typescript
// llmAnalysis.service.ts - preparePrefixChainForCache()

if (reviewMode === ReviewModeResponse.LIGHT_MODE) {
    return `
    ## Context

    <codeDiff>
        ${context.patchWithLinesStr}
    </codeDiff>

    <filePath>
        ${context.filePath}
    </filePath>

    <suggestionsContext>
        ${JSON.stringify(context?.suggestions, null, 2) || 'No suggestions provided'}
    </suggestionsContext>`;
}
```

**只包含**：

- `patchWithLinesStr`：带行号的 diff
- `filePath`：文件路径
- `suggestionsContext`：之前的建议（如适用）

---

### 3.2 HEAVY_MODE Prompt

```typescript
if (reviewMode === ReviewModeResponse.HEAVY_MODE) {
    return `
    ## Context

    <fileContent>
        ${context.relevantContent || context.fileContent}
    </fileContent>

    <codeDiff>
        ${context.patchWithLinesStr}
    </codeDiff>

    <filePath>
        ${context.filePath}
    </filePath>

    <suggestionsContext>
        ${JSON.stringify(context?.suggestions, null, 2) || 'No suggestions provided'}
    </suggestionsContext>`;
}
```

**包含额外内容**：

- `fileContent`：**完整文件内容** 或 **相关代码片段**（见下文 AST 扩展）
- `patchWithLinesStr`：带行号的 diff
- `filePath`：文件路径
- `suggestionsContext`：之前的建议

**关键差异**：

| 元素                   | LIGHT_MODE | HEAVY_MODE            |
| ---------------------- | ---------- | --------------------- |
| **fileContent**        | ❌ 不包含  | ✅ 完整文件或相关片段 |
| **patchWithLinesStr**  | ✅ 包含    | ✅ 包含               |
| **filePath**           | ✅ 包含    | ✅ 包含               |
| **suggestionsContext** | ✅ 包含    | ✅ 包含               |

---

## 四、AST 上下文扩展机制

### 4.1 触发条件

```typescript
// libs/ee/codeReview/fileReviewContextPreparation/file-review-context-preparation.service.ts

protected async getRelevantFileContent(
    file: FileChange,
    context: AnalysisContext,
): Promise<{
    relevantContent: string | null;
    taskStatus?: TaskStatus;
    hasRelevantContent?: boolean;
}> {
    const { taskId } = context.tasks.astAnalysis;

    // 如果没有 AST 分析任务 ID，回退到完整文件内容
    if (!taskId) {
        this.logger.warn({
            message:
                'No AST analysis task ID found, returning file content',
            context: FileReviewContextPreparation.name,
            metadata: {
                ...context?.organizationAndTeamData,
                filename: file.filename,
            },
        });

        return {
            relevantContent: file.fileContent || file.content || null,
            hasRelevantContent: false,
            taskStatus: TaskStatus.TASK_STATUS_FAILED,
        };
    }

    // 等待 AST 分析任务完成（最多 12 分钟，线性回退）
    const taskRes = await this.astService.awaitTask(
        taskId,
        context.organizationAndTeamData,
        {
            timeout: 720000, // 12 分钟
            ...this.getHeavyTaskBackoffConfig(),
        },
    );

    // 如果 AST 任务失败，回退到完整文件内容
    if (
        !taskRes ||
        taskRes?.task?.status !== TaskStatus.TASK_STATUS_COMPLETED
    ) {
        this.logger.warn({
            message: 'AST analysis task did not complete successfully',
            context: FileReviewContextPreparation.name,
            metadata: {
                ...context?.organizationAndTeamData,
                filename: file.filename,
                task: { taskId },
            },
        });

        return {
            relevantContent: file.fileContent || file.content || null,
            hasRelevantContent: false,
            taskStatus:
                taskRes?.task?.status || TaskStatus.TASK_STATUS_FAILED,
        };
    }

    // 调用 AST 服务获取相关内容
    const { content } = await this.astService.getRelatedContentFromDiff(
        context.repository,
        context.pullRequest,
        context.platformType,
        context.organizationAndTeamData,
        file.patch,
        file.filename,
        taskId,
    );

    if (content && content?.length > 0) {
        return {
            relevantContent: content,  // ← AST 提取的相关代码片段
            hasRelevantContent: true,
            taskStatus: taskRes?.task?.status,
        };
    } else {
        this.logger.warn({
            message: 'No relevant content found for the file',
            context: FileReviewContextPreparation.name,
            metadata: {
                ...context?.organizationAndTeamData,
                filename: file.filename,
                task: { taskId },
            },
        });
        return {
            relevantContent: file.fileContent || file.content || null,
            hasRelevantContent: false,
            taskStatus: taskRes?.task?.status,
        };
    }
}
```

### 4.2 AST 服务接口

```typescript
// libs/code-review/domain/contracts/ASTAnalysisService.contract.ts

getRelatedContentFromDiff(
    repository: any,
    pullRequest: any,
    platformType: string,
    organizationAndTeamData: OrganizationAndTeamData,
    diff: string,
    filePath: string,
    taskId: string,
): Promise<{ content: string }>;
```

### 4.3 AST 微服务实现

```typescript
// libs/ee/kodyAST/codeASTAnalysis.service.ts

async getRelatedContentFromDiff(
    repository: any,
    pullRequest: any,
    platformType: string,
    organizationAndTeamData: OrganizationAndTeamData,
    diff: string,
    filePath: string,
    taskId: string,
): Promise<{ content: string }> {
    // 1. 获取仓库参数（用于克隆）
    const { headRepo, baseRepo } = await this.getRepoParams(
        repository,
        pullRequest,
        organizationAndTeamData,
        platformType,
    );

    // 2. 调用外部 AST 微服务
    const response = await this.astAxios.post<{ content: string }>(
        '/api/ast/diff/content',
        {
            baseRepo,      // 基础分支
            headRepo,      // 目标分支
            diff,          // 统一 diff
            filePath,       // 文件路径
            organizationId: organizationAndTeamData.organizationId,
            taskId,        // 任务 ID
        },
        {
            headers: {
                'x-task-key': organizationAndTeamData.organizationId,
            },
        },
    );

    return response ?? { content: '' };
}
```

### 4.4 AST 微服务做什么？

**推测的功能**（基于代码接口）：

1. **克隆代码仓库**
    - 使用 `baseRepo` 和 `headRepo` 参数
    - 克隆到 AST 微服务的临时工作区

2. **解析 diff 的修改范围**
    - 从统一 diff 中提取修改的行范围
    - 识别修改的函数、类、变量

3. **构建 AST（抽象语法树）**
    - 对修改的文件进行语法分析
    - 识别：函数定义、调用关系、变量作用域

4. **提取相关代码片段**
    - 不是返回整个文件
    - **只返回与 diff 相关的部分**：
        - 修改的函数（包括完整函数体）
        - 修改类的完整定义
        - 相关的上下文函数
        - 导入的依赖

5. **优化目标**
    - 节省 token：只发送相关代码，不是整个文件
    - 提供上下文：让 LLM 理解修改的影响范围

---

## 五、完整数据流

```
┌─────────────────────────────────────────────────────────┐
│  Diff 获取                                      │
│  (platform API)                                  │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  prepareFilesWithLineNumbers()                       │
│  ├─ handlePatchDeletions()                        │
│  └─ convertToHunksWithLinesNumbers()                │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  determineReviewMode()                              │
│  ├─ selectReviewMode()                            │
│  │   └─ LLM 分析判断模式                        │
│  └─ 返回 LIGHT_MODE or HEAVY_MODE            │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────┴──────────────┐
        │                           │
    LIGHT_MODE                  HEAVY_MODE
        │                           │
        ▼                           ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│ preparePrefixChain │       │ getRelevantFileContent()   │
│ 只发送:        │       ├─ awaitTask(taskId)        │
│ - patchWithLinesStr    │       ├─ getRelatedContentFromDiff() │
│ - filePath             │       │   ├─ 发送: diff, filePath     │
│ - suggestionsContext    │       │   └─ AST 微服务:             │
                       │           ├─ /api/ast/diff/content      │
                       │           ├─ 克隆仓库                      │
                       │           ├─ 构建 AST                      │
                       │           ├─ 提取相关代码片段              │
                       │           └─ 返回 content (相关片段)    │
                       │                   │
                       └──────────────────┴─────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────┐
│  preparePrefixChainForCache (final)                   │
│  ├─ LIGHT_MODE Prompt:                              │
│  │   <codeDiff>patchWithLinesStr</codeDiff> │
│  │   <filePath>.../filePath</filePath>        │
│  │   <suggestionsContext>...</suggestionsContext>  │
│  └─ HEAVY_MODE Prompt:                           │
│      <fileContent>relevantContent</fileContent>      │
│      <codeDiff>patchWithLinesStr</codeDiff>        │
│      <filePath>.../filePath</filePath>          │
│      <suggestionsContext>...</suggestionsContext>  │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Analysis (analyzeCodeWithAI_v2)              │
│  ├─ Temperature 0 (确定性)                        │
│  ├─ Zod Schema 验证                              │
│  ├─ 生成 codeSuggestions[]                          │
│  └─ 返回 AIAnalysisResult                         │
└─────────────────────────────────────────────────────────┘
```

---

## 六、关键技术点总结

### 6.1 Review Mode 选择

| 特性           | LIGHT_MODE             | HEAVY_MODE             |
| -------------- | ---------------------- | ---------------------- |
| **触发条件**   | LLM 自动判断或配置强制 | LLM 自动判断或配置强制 |
| **适用场景**   | 小型、局部、自包含变更 | 全局变更、大规模重构   |
| **上下文需求** | 只看 diff              | 需要完整文件上下文     |

### 6.2 Prompt 构建差异

| 字段                 | LIGHT_MODE | HEAVY_MODE            |
| -------------------- | ---------- | --------------------- |
| `fileContent`        | ❌         | ✅ 完整文件或相关片段 |
| `patchWithLinesStr`  | ✅         | ✅                    |
| `filePath`           | ✅         | ✅                    |
| `suggestionsContext` | ✅         | ✅                    |

### 6.3 AST 上下文扩展

| 特性         | 描述                                       |
| ------------ | ------------------------------------------ |
| **服务调用** | `/api/ast/diff/content`                    |
| **输入**     | baseRepo, headRepo, diff, filePath, taskId |
| **输出**     | `{ content: string }` - 相关代码片段       |
| **超时**     | 12 分钟                                    |
| **重试策略** | 线性回退：5s, 10s, 15s... up to 60s        |
| **失败回退** | 使用完整文件内容                           |

---

## 七、MCP 工具调用机制

### 7.1 完整 MCP 工具调用流程

**在 Heavy Mode 中，除了 AST 服务，还会调用 MCP 工具来获取额外的上下文**：

```
LoadExternalContextStage
    ├─ PromptContextEngineService.detectAndResolveReferences()
    │   ├─ 检测 prompt 中的 MCP 引用：@mcp<app|tool>
    │   └─ PromptContextLoader.loadExternalContext()
    │       └─ 加载外部上下文（knowledge、MCP）
    └─ CodeReviewContextPackService.buildContextPack()
        ├─ PromptContextEngineService.resolveMCPArgs()
        │   ├─ 解析 MCP 工具参数
        └─ MCPAdapterBackedMCPClient.invoke()
            └─ 调用 MCP 工具：code_search
```

### 7.2 MCP 工具：`kodus-mcp-server.get_diff_for_file`

```typescript
// MCP 工具定义（在外部服务器注册）
{
    "name": "kodus-mcp-server.get_diff_for_file",
    "description": "Get relevant code context from file based on diff",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "File path to search for"
            },
            "fileContent": {
                "type": "string",
                "description": "Full file content for analysis"
            },
            "patchWithLinesStr": {
                "type": "string",
                "description": "Diff with line numbers"
            }
        }
    },
    "outputSchema": {
        "type": "object",
        "properties": {
            "code_search": {
                "type": "array",
                "description": "Search results with file paths and line numbers"
            }
        }
    }
}
```

### 7.3 MCP 调用时机

**在 `getRelevantFileContent()` 中调用 MCP**：

```typescript
// libs/ee/codeReview/fileReviewContextPreparation/file-review-context-preparation.service.ts

const { content } = await this.astService.getRelatedContentFromDiff(
    context.repository,
    context.pullRequest,
    context.platformType,
    context.organizationAndTeamData,
    file.patch,
    file.filename,
    taskId,
);
```

### 7.4 MCP 调用参数

```typescript
{
    baseRepo: {...},           // 基础分支参数
    headRepo: {...},           // 目标分支参数
    diff: file.patch,          // 统一 diff
    filePath: file.filename,     // 文件路径
    taskId: taskId,             // AST 任务 ID
}
```

### 7.5 Prompt 中的 MCP 引用格式

```typescript
// 在 user prompt 中，MCP 结果会被格式化为：

### Source: MCP Tools

@mcp<kodusmcp|code_search>:
- 搜索了以下相关代码文件：
  - src/utils/logger.ts (line 42)
  - src/index.ts (line 15)
  - src/services/dataService.ts (line 88)
```

### 7.6 MCP 结果作为 ContextEvidence

```typescript
interface ContextEvidence {
    provider: string; // 'mcp'
    toolName: string; // 'code_search'
    payload: any; // MCP 工具的实际输出
    metadata?: Record<string, unknown>;
}
```

### 7.7 完整数据流（含 MCP）

```
┌─────────────────────────────────────────────────┐
│  Diff 获取                                      │
│  (platform API)                                  │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  LoadExternalContextStage (新增)                │
│  ├─ 检测 MCP 引用：@mcp<app|tool>             │
│  ├─ 加载外部上下文（knowledge、MCP）              │
│  ├─ 解析 MCP 参数                                │
│  └─ 调用 MCP 工具：code_search               │
│      └─ 输出：相关代码搜索结果                     │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  determineReviewMode()                              │
│  ├─ selectReviewMode()                            │
│  │   └─ LLM 分析判断模式                        │
│  └─ 返回 LIGHT_MODE or HEAVY_MODE            │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────┴──────────────┐
        │                           │
    LIGHT_MODE                  HEAVY_MODE
        │                           │
        ▼                           ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│ preparePrefixChain │       │ getRelevantFileContent()   │
│ 只发送:        │       ├─ awaitTask(taskId)        │
│ - patchWithLinesStr    │       ├─ getRelatedContentFromDiff() │
│ - filePath             │       │   ├─ AST 服务提取相关代码    │
│ - suggestionsContext    │       │   │   └─ 返回 { content: string }    │
                       │       │                   │
└─────────────────────┴──────────────┘         └─────────────────────┘
                       │                       │
                       ▼
        ┌─────────────────────────────────────────────────┐
│  LLM Analysis (analyzeCodeWithAI_v2)              │
│  ├─ Temperature 0 (确定性)                        │
│  ├─ Zod Schema 验证                              │
│  ├─ 生成 codeSuggestions[]                          │
│  └─ 接收：externalPromptContext (含 MCP 结果)  │
└─────────────────────────────────────────────────┘
```

---

## 八、MCP 工具调用机制（补充）

### 8.1 完整 MCP 调用流程

```
LoadExternalContextStage
    ├─ PromptContextEngineService.detectAndResolveReferences()
    │   ├─ 检测 MCP 引用：@mcp<app|tool>
    │   └─ PromptContextLoader.loadExternalContext()
    │       └─ 加载外部上下文（knowledge、MCP）
    └─ CodeReviewContextPackService.buildContextPack()
        ├─ 解析 MCP 参数：MCPToolArgResolverAgentService
        ├─ 构建 ContextPack
        ├─ MCPAdapterBackedMCPClient.invoke()
        └─ 调用 MCP 工具：code_search
```

### 8.2 MCP 工具：`kodus-mcp-server.get_diff_for_file`

```typescript
// MCP 工具定义
{
    "name": "kodus-mcp-server.get_diff_for_file",
    "description": "Get relevant code context from file based on diff",
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "File path to search for"
            },
            "fileContent": {
                "type": "string",
                "description": "Full file content for analysis"
            },
            "patchWithLinesStr": {
                "type": "string",
                "description": "Diff with line numbers"
            }
        }
    },
    "outputSchema": {
        "type": "object",
        "properties": {
            "code_search": {
                "type": "array",
                "description": "Search results with file paths and line numbers"
            }
        }
    }
}
```

### 8.3 MCP 调用时机

- **触发条件**：
    - 在 Heavy Mode 下
    - AST 服务不可用或任务失败时回退
    - 配置了外部上下文引用（MCP 或 knowledge）

- **调用流程**：
    1. `PromptContextEngineService` 检测 MCP 引用
    2. `PromptContextLoader` 加载外部上下文配置
    3. `MCPToolArgResolverAgent` 解析工具参数
    4. `CodeReviewContextPackService` 构建 ContextPack
    5. `MCPAdapterBackedMCPClient` 调用 MCP 工具
    6. `formatMCPOutput` 格式化 MCP 输出

### 8.4 MCP 结果作为 ContextEvidence

```typescript
interface ContextEvidence {
    provider: 'mcp',
    toolName: 'code_search',
    payload: any,  // MCP 工具的搜索结果
    metadata?: Record<string, unknown>;
}

// 在 Prompt 中会格式化为：
### Source: MCP Tools

@mcp<kodusmcp|code_search>:
- 搜索了以下相关代码文件：
  - src/utils/logger.ts (line 42)
  - src/index.ts (line 15)
  - src/services/dataService.ts (line 88)
```

### 8.5 与 AST 服务的区别

| 维度         | AST 服务                   | MCP 工具                 |
| ------------ | -------------------------- | ------------------------ |
| **目的**     | 从完整文件提取相关代码片段 | 搜索代码库中的相关文件   |
| **数据源**   | 当前 PR 的文件             | 整个代码库               |
| **返回类型** | `{ content: string }`      | `{ code_search: [...] }` |
| **使用场景** | Heavy Mode 智能提取        | 作为外部上下文引用       |

---

## 九、关键技术点总结

| 文件                                                                                         | 功能                             |
| -------------------------------------------------------------------------------------------- | -------------------------------- |
| `libs/ee/codeReview/fileReviewContextPreparation/file-review-context-preparation.service.ts` | Review Mode 选择、AST 上下文获取 |
| `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`                   | Prompt 构建、LLM 分析            |
| `libs/common/utils/langchainCommon/prompts/seletorLightOrHeavyMode.ts`                       | Review Mode 判断 Prompt          |
| `libs/ee/kodyAST/codeASTAnalysis.service.ts`                                                 | AST 微服务客户端                 |
| `libs/code-review/domain/contracts/ASTAnalysisService.contract.ts`                           | AST 服务接口                     |

---

## 总结

**Heavy Mode 的 diff 上下文扩展机制**：

1. **判断机制**：LLM 根据文件内容和 diff 自动判断需要 LIGHT_MODE 还是 HEAVY_MODE
2. **AST 服务**：外部微服务根据 diff 从完整文件中**智能提取相关代码片段**
3. **Prompt 构建**：
    - LIGHT_MODE：只发送 `patchWithLinesStr`
    - HEAVY_MODE：发送 `fileContent`（AST 提取的相关片段）+ `patchWithLinesStr`
4. **优化效果**：AST 提取相关内容，避免发送整个文件，节省 ~26% tokens
5. **容错机制**：AST 任务失败时，回退到完整文件内容

**核心创新**：AST 微服务不是简单返回整个文件，而是**智能提取与 diff 相关的代码上下文**，例如修改函数的完整函数体、相关的类定义、依赖的导入等。这样既提供了足够的上下文理解变更的影响，又避免了发送不相关代码导致的 token 浪费。

**关键差异对比**：

```
LIGHT_MODE:
  - 只看 diff
  - 适合小型、局部变更
  - Token 较少

HEAVY_MODE:
  - 看完整文件（或相关片段）
  - 适合全局变更、大规模重构
  - AST 智能提取相关代码
  - 节省 ~26% tokens（相比发送整个文件）
```
