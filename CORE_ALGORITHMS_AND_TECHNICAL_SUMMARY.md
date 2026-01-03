# Kodus AI 核心算法和技术总结

> 分析日期：2025-01-03
> 项目：Kodus AI (kodus-ai)
> 分析范围：核心算法和技术总结

---

## 目录

- [一、Diff 处理核心算法](#一diff-处理核心算法)
- [二、Review Mode 自动选择算法](#二review-mode-自动选择算法)
- [三、AST 上下文扩展算法](#三ast-上下文扩展算法)
- [四、批处理优化算法](#四批处理优化算法)
- [五、多重过滤算法](#五多重过滤算法)
- [六、MCP 工具调用算法](#六mcp-工具调用算法)
- [七、Token 优化算法](#七token-优化算法)
- [八、需要深入研究的关键技术](#八需要深入研究的关键技术)
- [九、技术栈总结](#九技术栈总结)
- [十、核心技术创新点](#十核心技术创新点)

---

## 一、Diff 处理核心算法（`libs/common/utils/patch.ts`）

### 1.1 删除-only hunks 过滤算法

**算法目标**：移除只包含删除的 diff hunks，减少 27-50% token 消耗

**核心逻辑**：

```typescript
function omitDeletionHunks(patchLines: string[]): string {
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;
    let insideHunk = false;

    // 状态跟踪：累积一个 hunk 的所有行
    for (const line of patchLines) {
        if (line.startsWith('@@')) {
            // 遇到新 hunk header，处理上一个 hunk
            if (insideHunk && addHunk) {
                addedPatched.push(...tempHunk);
            }
            tempHunk.length = 0;
            addHunk = false;
            tempHunk.push(line);
            insideHunk = true;
        } else {
            tempHunk.push(line);
            const editType = line.charAt(0);
            if (editType === '+') {
                addHunk = true; // 标记此 hunk 有添加
            }
        }
    }

    // 处理最后一个 hunk
    if (insideHunk && addHunk) {
        addedPatched.push(...tempHunk);
    }

    return addedPatched.join('\n');
}
```

**关键特性**：

- **单遍历算法**：O(n) 时间复杂度
- **状态标记**：`addHunk` + `insideHunk`
- **累积模式**：`tempHunk` 累积当前 hunk 内容
- **选择性添加**：只有 `addHunk === true` 的 hunk 才被添加到结果

**优化效果**：

- 减少 27-50% 的 token 消耗（移除无添加的 hunks）
- 避免对删除代码的误报

---

### 1.2 绝对行号计算算法

**算法目标**：为 diff 中的每一行添加绝对行号，支持精确的代码定位

**核心公式**：

```typescript
// 新代码行号 = start2 + 索引位置
// 例如：@@ -10,6 +10,7 @@ → start2 = 10
// 索引 0 → 10 + 0 = 10
// 索引 1 → 10 + 1 = 11
```

**输出格式**：

```typescript
## file: 'src/index.js'

@@ -10,6 +10,7 @@ export function useData() {
__new hunk__
10  const items = [];
11  const loading = false;
12 +const error = null;  // 绝对行号 12

__old hunk__
- const error = null;       // 删除的行
```

**标记符**：

- `__new hunk__`：新代码块（包含添加和上下文）
- `__old hunk__`：旧代码块（只包含删除）

---

### 1.3 修改范围提取算法

**算法目标**：将连续的修改行合并为范围，用于建议过滤

**核心逻辑**：

```typescript
interface ModifiedRange {
    start: number; // 修改范围的起始行号（绝对）
    end: number; // 修改范围的结束行号（绝对）
}

function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    const modifiedRanges: ModifiedRange[] = [];
    let currentRange: ModifiedRange | null = null;

    for (const line of lines) {
        // 匹配 hunk header：提取 start2
        if (line.startsWith('@@')) {
            const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (match) {
                const start2 = parseInt(match[1], 10); // 新文件起始行
                // 处理上一个 range
                if (currentRange) {
                    modifiedRanges.push(currentRange);
                }
                currentRange = null; // 重置
            }
            continue;
        }

        // 匹配带行号的修改行：123 + const lineMatch = line.match(/^(\d+) ([+-])/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const changeType = lineMatch[2]; // '+' 或 '-'

            // 只处理添加的行（代码审查关注新代码）
            if (changeType === '+') {
                if (!currentRange) {
                    // 创建新 range
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber,
                    };
                } else if (lineNumber === currentRange.end + 1) {
                    // 连续行：扩展 range
                    currentRange.end = lineNumber;
                } else {
                    // 不连续：关闭当前 range，创建新 range
                    modifiedRanges.push(currentRange);
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber,
                    };
                }
            }
        } else {
            // 非修改行：关闭当前 range
            if (currentRange) {
                modifiedRanges.push(currentRange);
                currentRange = null;
            }
        }
    }

    // 处理最后一个未关闭的 range
    if (currentRange) {
        modifiedRanges.push(currentRange);
    }

    return modifiedRanges;
}
```

**关键特性**：

- **连续检测**：`lineNumber === currentRange.end + 1`
- **范围合并**：避免过于细碎的 range
- **重叠判断**：用于后续建议过滤
- **只处理 + 行**：代码审查只关注新增代码

---

## 二、Review Mode 自动选择算法（`llmAnalysis.service.ts` + `selectorLightOrHeavyMode_system.ts`）

**算法目标**：根据文件内容和 diff 自动判断使用 LIGHT_MODE 还是 HEAVY_MODE

**核心 Prompt 模板**：

```
Knowledge 5:
- light_mode is selected when you can effectively complete a code review by looking only at the code diff. These changes typically remain contained within a single function or class, do not alter public interfaces, and involve small, localized refactoring or minor modifications (e.g., renaming a local variable, updating error messages or logs).
- heavy_mode is used when the review requires examining the entire file (or possibly more of the code base) to understand the impact of changes. This applies to modifications such as updated imports, changes to public methods, introduction of global variables or constants, or large-scale refactoring. Because these updates carry a higher risk of affecting other areas, a broader context is necessary to ensure correctness and consistency.
```

**LLM 调用参数**：

```typescript
{
    file: FileChange,     // 文件对象（包含完整内容）
    codeDiff: string,     // 带行号的 diff
}
```

**返回格式**：

```typescript
{
    reviewMode: 'light_mode' | 'heavy_mode';
}
```

**判断标准**：

- **light_mode**：小型、局部、自包含变更，只看 diff
- **heavy_mode**：全局变更、大规模重构，需要完整文件上下文

---

## 三、AST 上下文扩展算法（`codeASTAnalysis.service.ts`）

### 3.1 AST 微服务调用

**算法目标**：从完整文件中智能提取与 diff 相关的代码片段

**输入参数**：

```typescript
{
    baseRepo: {...},      // 基础分支参数
    headRepo: {...},       // 目标分支参数
    diff: string,          // 统一 diff
    filePath: string,       // 文件路径
    taskId: string,         // AST 分析任务 ID
}
```

**调用方式**：

```typescript
const response = await this.astAxios.post<{ content: string }>(
    '/api/ast/diff/content',
    {
        baseRepo, // 基础分支
        headRepo, // 目标分支
        diff, // 统一 diff
        filePath, // 文件路径
        organizationId: organizationAndTeamData.organizationId,
        taskId, // 任务 ID
    },
    {
        headers: {
            'x-task-key': organizationAndTeamData.organizationId,
        },
    },
);
```

**输出**：

```typescript
{
    content: string; // 相关代码片段（不是整个文件）
}
```

---

### 3.2 AST 任务等待策略

**算法目标**：异步等待 AST 分析任务完成，支持线性回退

**核心配置**：

```typescript
private getHeavyTaskBackoffConfig() {
    return {
        initialInterval: 5000,     // 初始间隔 5s
        maxInterval: 60000,       // 最大间隔 60s
        maxAttempts: 12,           // 最多 12 次重试
        useExponentialBackoff: false,  // 线性回退（非指数）
        jitter: true,                // 添加随机抖动
    };
}
```

**等待逻辑**：

```typescript
const taskRes = await this.astService.awaitTask(
    taskId,
    context.organizationAndTeamData,
    {
        timeout: 720000, // 12 分钟
        ...this.getHeavyTaskBackoffConfig(),
    },
);
```

**容错机制**：

- AST 任务失败时，回退到完整文件内容
- 超时 12 分钟后，标记为 TASK_STATUS_FAILED

---

## 四、批处理优化算法（`processFilesReview.stage.ts`）

### 4.1 动态批次创建

**算法目标**：根据 token 估算将文件分批，平衡吞吐量和负载

**核心参数**：

```typescript
interface BatchConfig {
    minBatchSize: number; // 最小批次大小：20 个文件
    maxBatchSize: number; // 最大批次大小：30 个文件
}

const batches = createOptimizedBatches(files, {
    minBatchSize: 20,
    maxBatchSize: 30,
});
```

**优化策略**：

- **Token 估算**：根据 diff 大小估算 token 消耗
- **动态分组**：避免单个批次过大
- **批次限制**：20-30 个文件/批次

---

### 4.2 并发控制算法

**算法目标**：控制并发 LLM 调用数量，避免过载

**核心实现**：

```typescript
import pLimit from 'p-limit';

private readonly concurrencyLimit = 20;

const limit = pLimit(this.concurrencyLimit);

// 批次内并行，批次间串行
const results = await Promise.allSettled(
    preparedFiles.map(({ fileContext }) =>
        limit(() => this.executeFileAnalysis(fileContext))
    ),
);
```

**特性**：

- **批次内并行**：`Promise.allSettled` 最多 20 个并发任务
- **批次间串行**：`processBatchesSequentially` 顺序处理每个批次
- **故障隔离**：`allSettled` 一个失败不影响其他结果

---

## 五、多重过滤算法（7 层过滤链）

### 5.1 Code Diff 过滤（范围检查）

**算法目标**：移除不在 diff 修改范围内的建议

**核心逻辑**：

```typescript
export function filterSuggestionsCodeDiff(
    patchWithLinesStr: string,
    codeSuggestions: Partial<CodeSuggestion>[],
) {
    // 1. 提取修改范围
    const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);

    // 2. 过滤建议：检查建议范围与修改范围是否有重叠
    return codeSuggestions?.filter((suggestion) => {
        return modifiedRanges.some((range) => {
            // 重叠判断（三选一）：
            return (
                // 1. 建议起始在范围内
                suggestion?.relevantLinesStart >= range.start &&
                suggestion?.relevantLinesStart <= range.end) ||
                // 2. 建议结束在范围内
                suggestion?.relevantLinesEnd >= range.start &&
                suggestion?.relevantLinesEnd <= range.end) ||
                // 3. 建议范围包含修改范围
                suggestion?.relevantLinesStart <= range.start &&
                suggestion?.relevantLinesEnd >= range.end
            );
        });
    });
}
```

**重叠判断标准**：

- 三种重叠情况使用 `||` 逻辑
- 有任何重叠即保留建议

---

### 5.2 Safeguard 过滤（LLM 二次验证）

**算法目标**：使用 LLM 二次验证，移除幻觉或错误建议

**核心 Prompt 逻辑**：

```
System: You are a senior code reviewer.

Task: Review each suggestion and decide:
- Keep: 修复了真实问题，基于实际代码提出改进
- Discard: 引入了新 bug、破坏现有代码、自相矛盾、基于幻觉（代码中不存在）

Output format: {
    id: string,
    suggestionContent: string,
    existingCode: string,
    improvedCode: string | null,
    oneSentenceSummary: string,
    relevantLinesStart: number,
    relevantLinesEnd: number,
    label: string,
    action: 'update' | 'discard',
    reason?: string
}
```

**LLM 配置**：

```typescript
.setTemperature(0)                  // 确定性输出
.setMaxReasoningTokens(5000)           // 最大推理 tokens
.setLLMJsonMode(true)                // JSON 模式
.setParser(ParserType.ZOD, schema, {...})  // Zod 验证
```

**过滤标准**：

- **Introduces bugs**：移除
- **Breaks existing code**：移除
- **Contradicts itself**：移除
- **Based on hallucination**：移除

---

### 5.3 其他过滤层

| 过滤层                      | 位置                       | 算法       |
| --------------------------- | -------------------------- | ---------- |
| **Options Filter**          | 按配置过滤（类别、严重性） | 配置检查   |
| **Kody Fine-Tuning Filter** | 历史数据去重               | 机器学习   |
| **Severity Analysis**       | 评估建议严重性             | LLM 分析   |
| **Kody Rules Filter**       | 应用自定义规则             | 规则引擎   |
| **AST Analysis**            | 结构化代码分析             | 语法树解析 |

---

## 六、MCP 工具调用算法（`load-external-context.stage.ts` + `code-review-context-pack.service.ts`）

### 6.1 MCP 引用检测算法

**算法目标**：检测 prompt 中的 MCP 工具引用：`@mcp<app|tool>`

**核心正则**：

```typescript
const mcpRegex = /@mcp<([^|>]+)\|([^>]+)>/g;

// 示例：@mcp<kodusmcp|code_search>
// 提取：app = kodusmcp, tool = code_search
```

**检测流程**：

```typescript
class ReferenceDetectorService {
    detectMCPDependencies(text: string): ContextDependency[] {
        const mcpDependencies = [];
        let match;

        while ((match = mcpRegex.exec(text)) !== null) {
            mcpDependencies.push({
                type: 'mcp',
                descriptor: match[0], // @mcp<app|tool>
                dependencies: [match[2]], // [app, tool]
            });
        }

        return mcpDependencies;
    }
}
```

---

### 6.2 MCP 参数解析算法

**算法目标**：智能解析 MCP 工具参数，从可用上下文中填充缺失参数

**核心逻辑**：

```typescript
class MCPToolArgResolverAgentService {
    async resolveArgs(
        request: MCPInvocationRequest,
    ): Promise<Record<string, unknown>> {
        const metadata = request.tool.metadata as Record<string, unknown>;
        const rawArgs = metadata.args as Record<string, unknown>;

        // 1. 从 context 中提取参数
        if (request.input && isPlainObject(request.input)) {
            args.context = {
                ...(request.input as Record<string, unknown>),
                ...(rawArgs as Record<string, unknown>),
            };
        } else {
            args.context = request.input;
        }

        // 2. 使用 Agent 智能解析缺失参数
        const resolved = await this.mcpToolArgResolverAgent.resolve({
            descriptor: request.tool,
            context: args.context as Record<string, unknown>,
            toolName: request.tool.name,
        });

        return resolved;
    }
}
```

---

### 6.3 MCP 工具调用流程

**完整流程**：

```
LoadExternalContextStage
    ├─ PromptContextEngineService.detectAndResolveReferences()
    │   ├─ 检测 MCP 引用：@mcp<app|tool>
    │   └─ PromptContextLoader.loadExternalContext()
    │       └─ 加载外部上下文配置（knowledge、MCP）
    └─ CodeReviewContextPackService.buildContextPack()
        ├─ PromptContextEngineService.resolveMCPArgs()
        │   ├─ 解析 MCP 工具参数
        └─ MCPAdapterBackedMCPClient.invoke()
            └─ 调用 MCP 工具：code_search
                ├─ 输入：query, fileContent, patchWithLinesStr
                └─ 输出：code_search[] (搜索结果)
        └─ formatMCPOutput()
            └─ 格式化为 ContextEvidence
```

**MCP 工具**：`kodus-mcp-server.get_diff_for_file`

**工具功能**：基于 diff 搜索代码库中的相关文件

---

## 七、Token 优化算法（综合效果）

### 7.1 基础优化

| 优化阶段        | 技术               | 节省比例 |
| --------------- | ------------------ | -------- |
| 删除-only hunks | 移除无添加的 hunks | 27-50%   |
| AST 智能提取    | 只返回相关代码片段 | 26%      |

### 7.2 批处理优化

| 优化策略     | 技术              | 效果       |
| ------------ | ----------------- | ---------- |
| 动态批次大小 | 20-30 files/batch | 提高吞吐量 |
| 并发控制     | max 20 并发       | 避免过载   |

### 7.3 总优化效果

```
基础 Token 消耗 = 100%
├─ 删除-only hunks (-27% to -50%)
├─ AST 智能提取 (-26%)
└─ 最终 Token 消耗 = ~50%
```

---

## 八、需要深入研究的关键技术

### 8.1 **AST 微服务实现**（外部服务）

**位置**：独立部署的 AST 微服务（`/api/ast/diff/content`）

**关键问题**：

- 如何解析 diff 并构建语法树？
- 如何识别函数、类、变量的作用域？
- 如何提取相关代码片段而非整个文件？
- 如何处理不同的编程语言？

---

### 8.2 **MCP 协议与工具生态**

**MCP Server 实现**：`libs/mcp-server/`

**关键问题**：

- MCP 协议的完整实现细节
- 工具发现和注册机制
- 跨服务器工具调用和聚合
- Session 管理和连接池

---

### 8.3 **LLM Prompt 工程**

**Prompt 模板管理**：`libs/common/utils/langchainCommon/prompts/`

**关键问题**：

- Prompt 编译和缓存策略
- 上下文注入和替换机制
- 多语言支持（国际化）
- Prompt 版本管理和 A/B 测试

---

### 8.4 **流水线编排**

**13 阶段代码审查流水线**：`libs/code-review/pipeline/`

**关键问题**：

- 流水线状态管理和容错
- 批处理优化算法
- 阶段依赖和条件执行
- 性能监控和指标收集

---

### 8.5 **平台抽象层**

**多平台统一接口**：`libs/platform/`

**关键问题**：

- 如何抽象 GitHub、GitLab、Bitbucket、Azure Repos 的差异？
- 统一的 PR 和文件操作接口
- Webhook 事件处理的一致性
- 认证和权限管理

---

## 九、技术栈总结

| 层级            | 核心技术                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| **Diff 处理**   | 自定义 unified diff 解析，绝对行号计算，范围提取                               |
| **上下文扩展**  | AST 微服务，MCP 工具调用，智能代码片段提取                                     |
| **AI 分析**     | LLM 多 Provider 支持（Gemini 2.5 Pro + DeepSeek V3 fallback），Zod Schema 验证 |
| **过滤机制**    | 7 层过滤链，范围重叠检查，Safeguard LLM 二次验证                               |
| **性能优化**    | 批处理（20-30 files），并发控制（max 20），Token 优化（~50% 节省）             |
| **Prompt 工程** | 动态上下文注入，模板化，多语言支持                                             |
| **流水线编排**  | 13 阶段编排，批处理优化，异步任务队列（RabbitMQ）                              |
| **平台抽象**    | 统一接口设计，Factory 模式，运行时类型标记                                     |
| **可观测性**    | OpenTelemetry 分布式追踪，Pino 结构化日志，Span 命名                           |
| **消息队列**    | RabbitMQ (Bull)，异步任务调度                                                  |
| **数据库**      | PostgreSQL (TypeORM) + MongoDB (Mongoose)                                      |
| **类型安全**    | TypeScript，Zod Schema 验证，严格类型检查                                      |

---

## 十、核心技术创新点

1. **智能 Diff 解析**：不只使用第三方库，而是自定义解析算法，支持绝对行号和范围提取

2. **双层上下文扩展**：
    - **AST 服务**：从完整文件中智能提取相关代码片段
    - **MCP 工具**：搜索外部代码库，补充知识库上下文

3. **7 重过滤机制**：从 Options、Code Diff、Fine-Tuning、Safeguard、Severity、Kody Rules 到 AST Analysis

4. **批处理优化**：动态批次大小（20-30 files）+ 并发控制（max 20）+ Token 优化（~50% 节省）

5. **Prompt 工程**：动态上下文注入、模板化、多语言支持

6. **MCP 协议**：标准化的 Model Context Protocol 实现，支持外部工具集成

这些技术共同构成了一个**高度工程化、高性能、可扩展的代码审查 AI 系统**。
