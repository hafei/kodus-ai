# Kodus AI - PR Diff 处理完整技术分析报告

> 分析日期：2025-01-03
> 项目：Kodus AI (kodus-ai)
> 分析范围：从 PR webhook 接收到 diff 处理的完整流程

---

## 目录

- [一、系统架构总览](#一系统架构总览)
- [二、Webhook 接收层](#二webhook-接收层)
- [三、Diff 获取与预处理层](#三diff-获取与预处理层)
- [四、文件分析编排层](#四文件分析编排层)
- [五、Review Mode 选择与 AST 上下文扩展](#五review-mode-选择与-ast-上下文扩展)
- [六、LLM 分析层](#六llm-分析层)
- [七、多重过滤层](#七多重过滤层)
- [八、评论生成与发布层](#八评论生成与发布层)
- [九、性能优化关键技术](#九性能优化关键技术)
- [十、关键技术栈总结](#十关键技术栈总结)
- [十一、完整数据流图](#十一完整数据流图)
- [十二、关键技术创新点](#十二关键技术创新点)
- [十三、附录](#十三附录)

---

## 一、系统架构总览

Kodus AI 采用**事件驱动、异步处理、流水线式**的架构设计，从 PR webhook 触发到最终评论发布，包含 13 个处理阶段的完整代码审查流程。

### 1.1 架构模式

```
GitHub Webhook → 立即响应 → 异步入队 → 后台处理 → 流水线分析 → LLM 分析 → 多重过滤 → 评论发布
```

### 1.2 核心组件

| 组件                     | 描述                     | 位置                                                                          |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------- |
| **Webhook Handler**      | 接收 GitHub webhook 事件 | `apps/webhooks/`                                                              |
| **Worker**               | 后台任务处理器           | `apps/worker/`                                                                |
| **Pipeline**             | 13 阶段代码审查流水线    | `libs/code-review/pipeline/`                                                  |
| **LLM Service**          | AI 分析服务              | `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`    |
| **Comment Manager**      | 评论发布与管理           | `libs/code-review/infrastructure/adapters/services/commentManager.service.ts` |
| **Platform Integration** | 多平台适配层             | `libs/platform/`                                                              |
| **Patch Utilities**      | Diff 处理核心库          | `libs/common/utils/patch.ts`                                                  |

---

## 二、Webhook 接收层

### 2.1 入口点：`apps/webhooks/src/controllers/github.controller.ts`

```typescript
@Post('/webhook')
handleWebhook(@Req() req: Request, @Res() res: Response) {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body as any;

    // 1. 事件过滤 - 只处理特定 actions
    if (event === 'pull_request') {
        if (
            payload?.action !== 'opened' &&
            payload?.action !== 'synchronize' &&
            payload?.action !== 'closed' &&
            payload?.action !== 'reopened' &&
            payload?.action !== 'ready_for_review'
        ) {
            return res.status(HttpStatus.OK).send('Webhook ignored (action not supported)');
        }
    }

    // 2. 关键：立即响应，避免 GitHub webhook 超时
    res.status(HttpStatus.OK).send('Webhook received');

    // 3. 异步入队处理
    setImmediate(() => {
        void this.enqueueWebhookUseCase.execute({
            platformType: PlatformType.GITHUB,
            event,
            payload,
        }).catch((error) => {
            this.logger.error({ message: 'Error enqueuing webhook', error });
        });
    });
}
```

### 2.2 Webhook 处理层：异步后台

```typescript
@Injectable()
export class WebhookProcessingJobProcessorService implements IJobProcessorService {
    private readonly webhookHandlersMap: Map<
        PlatformType,
        IWebhookEventHandler
    > = new Map([
        [PlatformType.GITHUB, githubPullRequestHandler],
        [PlatformType.GITLAB, gitlabMergeRequestHandler],
        [PlatformType.BITBUCKET, bitbucketPullRequestHandler],
        [PlatformType.AZURE_REPOS, azureReposPullRequestHandler],
    ]);

    async process(jobId: string): Promise<void> {
        const job = await this.jobRepository.findOne(jobId);
        const platformType = job.metadata?.platformType as PlatformType;
        const event = job.metadata?.event as string;

        // 获取平台对应的 handler
        const handler = this.webhookHandlersMap.get(platformType);

        // 检查是否可以处理此事件
        if (!handler.canHandle(webhookParams)) {
            await this.jobRepository.update(jobId, {
                status: JobStatus.COMPLETED,
            });
            return; // 不是错误，只是不处理
        }

        // 执行 handler
        await handler.execute(webhookParams);

        // 更新 job 状态
        await this.jobRepository.update(jobId, { status: JobStatus.COMPLETED });
    }
}
```

### 2.3 GitHub Handler：`libs/platform/infrastructure/webhooks/github/githubPullRequest.handler.ts`

```typescript
@Injectable()
export class GitHubPullRequestHandler implements IWebhookEventHandler {
    constructor(
        private readonly savePullRequestUseCase: SavePullRequestUseCase,
        private readonly runCodeReviewAutomationUseCase: RunCodeReviewAutomationUseCase,
        private readonly enqueueCodeReviewJobUseCase: EnqueueCodeReviewJobUseCase,
    ) {}

    canHandle(params: IWebhookEventParams): boolean {
        // 检查是否是 GitHub 平台
        if (params.platformType !== PlatformType.GITHUB) return false;

        // 检查事件类型
        const supportedEvents = [
            'pull_request',
            'issue_comment',
            'pull_request_review_comment',
        ];
        if (!supportedEvents.includes(params.event)) return false;

        // 检查 PR action 类型
        if (params.event === 'pull_request') {
            const allowedActions = [
                'opened',
                'synchronize',
                'closed',
                'reopened',
                'ready_for_review',
            ];
            return allowedActions.includes(params.payload?.action);
        }

        return true;
    }

    async execute(params: IWebhookEventParams): Promise<void> {
        const { event, payload } = params;

        switch (event) {
            case 'pull_request':
                await this.handlePullRequest(params);
                break;
            case 'issue_comment':
            case 'pull_request_review_comment':
                await this.handleComment(params);
                break;
        }
    }

    private async handlePullRequest(
        params: IWebhookEventParams,
    ): Promise<void> {
        const prNumber = payload?.pull_request?.number || payload?.number;
        const repository = {
            id: String(payload?.repository?.id),
            name: payload?.repository?.name,
            fullName: payload?.repository?.full_name,
        };

        // 1. 查找团队配置
        const validationResult =
            await this.runCodeReviewAutomationUseCase.findTeamWithActiveCodeReview(
                {
                    repository,
                    platformType: PlatformType.GITHUB,
                },
            );

        // 2. 保存 PR 数据
        await this.savePullRequestUseCase.execute(params);

        // 3. 如果有团队配置，入队 CODE_REVIEW job
        if (validationResult?.organizationAndTeamData) {
            const jobId = await this.enqueueCodeReviewJobUseCase.execute({
                payload,
                event,
                platformType: PlatformType.GITHUB,
                organizationAndTeam: validationResult.organizationAndTeamData,
                correlationId: params.correlationId,
            });

            this.logger.log({
                message: 'Code review job enqueued',
                metadata: { jobId, prNumber, repositoryId: repository.id },
            });
        }
    }
}
```

### 2.4 关键技术点

| 技术         | 描述                                     | 效果              |
| ------------ | ---------------------------------------- | ----------------- |
| **立即响应** | 先返回 200，再用 `setImmediate` 异步处理 | 避免 webhook 超时 |
| **事件过滤** | 只处理特定的 PR actions                  | 减少无效处理      |
| **异步入队** | 使用 RabbitMQ 队列解耦                   | 提高系统稳定性    |
| **Map 模式** | 动态路由到不同平台 handler               | 易扩展            |
| **策略模式** | 每个 handler 实现 `IWebhookEventHandler` | 统一接口          |

---

## 三、Diff 获取与预处理层

### 3.1 FetchChangedFilesStage：`libs/code-review/pipeline/stages/fetch-changed-files.stage.ts`

```typescript
@Injectable()
export class FetchChangedFilesStage extends BasePipelineStage<CodeReviewPipelineContext> {
    private readonly maxFilesToAnalyze = 500;

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        // 1. 从平台 API 获取变更文件
        const files = await this.pullRequestHandlerService.getChangedFiles(
            context.organizationAndTeamData,
            context.repository,
            context.pullRequest,
            context.codeReviewConfig.ignorePaths,
            context?.lastExecution?.lastAnalyzedCommit,
        );

        // 2. 验证文件数量
        if (!files?.length || files.length > this.maxFilesToAnalyze) {
            return this.updateContext(context, (draft) => {
                draft.statusInfo = {
                    status: AutomationStatus.SKIPPED,
                    message:
                        files?.length > this.maxFilesToAnalyze
                            ? AutomationMessage.TOO_MANY_FILES
                            : AutomationMessage.NO_FILES_AFTER_IGNORE,
                };
            });
        }

        // 3. 为每个文件准备带行号的 patch
        const filesWithLineNumbers = this.prepareFilesWithLineNumbers(files);

        // 4. 计算统计信息
        const stats = this.getStatsForPR(filesWithLineNumbers);

        return this.updateContext(context, (draft) => {
            draft.changedFiles = filesWithLineNumbers;
            draft.pullRequest.stats = stats;
        });
    }

    private prepareFilesWithLineNumbers(files: FileChange[]): FileChange[] {
        return files?.map((file) => {
            if (!file?.patch) return file;

            // Step 3.1: 移除只删除的 hunks
            const patchFormatted = handlePatchDeletions(
                file.patch,
                file.filename,
                file.status,
            );

            if (!patchFormatted) return file;

            // Step 3.2: 添加绝对行号
            const patchWithLinesStr = convertToHunksWithLinesNumbers(
                patchFormatted,
                file,
            );

            return {
                ...file,
                patchWithLinesStr,
            };
        });
    }
}
```

### 3.2 Diff 核心处理：`libs/common/utils/patch.ts`

这是 diff 处理的核心工具库，包含三个关键函数。

#### 3.2.1 `handlePatchDeletions` - 过滤只删除的 hunks

```typescript
export function handlePatchDeletions(
    patch: string,
    fileName: string,
    editType: string,
): string | null {
    if (!patch && editType !== 'modified' && editType !== 'added') {
        return null;
    }

    const patchLines = patch?.split('\n');
    const patchNew = omitDeletionHunks(patchLines);

    if (patch !== patchNew) {
        return patchNew;
    }

    return patch;
}

function omitDeletionHunks(patchLines: string[]): string {
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;
    let insideHunk = false;

    const RE_HUNK_HEADER =
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

    for (const line of patchLines) {
        if (line.startsWith('@@')) {
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
                if (insideHunk && addHunk) {
                    addedPatched.push(...tempHunk);
                }
                tempHunk.length = 0;
                addHunk = false;
                tempHunk.push(line);
                insideHunk = true;
            }
        } else {
            tempHunk.push(line);
            const editType = line.charAt(0);
            if (editType === '+') {
                addHunk = true; // 标记为有添加
            }
        }
    }

    if (insideHunk && addHunk) {
        addedPatched.push(...tempHunk);
    }

    return addedPatched.join('\n');
}
```

**算法要点**：

1. **状态跟踪**：使用 `addHunk` 标记当前 hunk 是否有添加的行
2. **累积模式**：使用 `tempHunk` 累积一个 hunk 的所有行
3. **选择性添加**：只有 `addHunk === true` 的 hunk 才被添加到结果

**优化效果**：

- 减少 27-50% 的 token 消耗（移除只删除代码的 hunks）
- 避免对删除代码的误报

---

#### 3.2.2 `convertToHunksWithLinesNumbers` - 添加绝对行号

```typescript
export function convertToHunksWithLineNumbers(
    patch: string,
    file: { filename?: string },
): string {
    let patchWithLinesStr = `\n\n## file: '${file.filename.trim()}'\n`;
    const patchLines = patch.split('\n');

    const RE_HUNK_HEADER =
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

    let newContentLines: string[] = [];
    let oldContentLines: string[] = [];
    let match: RegExpMatchArray | null = null;
    let start1 = -1,
        size1 = -1, // 旧文件起始、行数
        start2 = -1,
        size2 = -1; // 新文件起始、行数
    let prevHeaderLine = '';

    for (const line of patchLines) {
        if (line.toLowerCase().includes('no newline at end of file')) {
            continue;
        }

        if (line.startsWith('@@')) {
            headerLine = line;
            match = line.match(RE_HUNK_HEADER);

            if (
                match &&
                (newContentLines.length > 0 || oldContentLines.length > 0)
            ) {
                if (prevHeaderLine) {
                    patchWithLinesStr += `\n${prevHeaderLine}\n`;
                }

                // 添加新代码 hunk
                if (newContentLines.length > 0) {
                    const isPlusLines = newContentLines.some((line) =>
                        line.startsWith('+'),
                    );
                    if (isPlusLines) {
                        patchWithLinesStr =
                            patchWithLinesStr.trimEnd() + '\n__new hunk__\n';
                        for (let i = 0; i < newContentLines.length; i++) {
                            patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
                        }
                    }
                }

                // 添加旧代码 hunk（只包含删除的行）
                if (oldContentLines.length > 0) {
                    const isMinusLines = oldContentLines.some((line) =>
                        line.startsWith('-'),
                    );
                    if (isMinusLines) {
                        patchWithLinesStr =
                            patchWithLinesStr.trimEnd() + '\n__old hunk__\n';
                        for (const lineOld of oldContentLines) {
                            patchWithLinesStr += `${lineOld}\n`;
                        }
                    }
                }

                newContentLines = [];
                oldContentLines = [];
            }

            if (match) {
                prevHeaderLine = headerLine;
                const res = match
                    .slice(1, 5)
                    .map((val) => parseInt(val || '0', 10));
                [start1, size1, start2, size2] = res;
            }
        } else if (line.startsWith('+')) {
            newContentLines.push(line); // 添加的行
        } else if (line.startsWith('-')) {
            oldContentLines.push(line); // 删除的行
        } else {
            newContentLines.push(line);
            oldContentLines.push(line);
        }
    }

    // 处理最后一个 hunk
    if (match && newContentLines.length > 0) {
        patchWithLinesStr += `\n${headerLine}\n`;
        if (newContentLines.length > 0) {
            const isPlusLines = newContentLines.some((l) => l.startsWith('+'));
            if (isPlusLines) {
                patchWithLinesStr =
                    patchWithLinesStr.trimEnd() + '\n__new hunk__\n';
                for (let i = 0; i < newContentLines.length; i++) {
                    patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
                }
            }
        }
        if (oldContentLines.length > 0) {
            const isMinusLines = oldContentLines.some((l) => l.startsWith('-'));
            if (isMinusLines) {
                patchWithLinesStr =
                    patchWithLinesStr.trimEnd() + '\n__old hunk__\n';
                for (const lineOld of oldContentLines) {
                    patchWithLinesStr += `${lineOld}\n`;
                }
            }
        }
    }

    return patchWithLinesStr.trim();
}
```

**关键技术点**：

1. **行号计算公式**：`absoluteLineNumber = start2 + 索引位置`
2. **格式化输出**：

    ```typescript
    ## file: 'src/index.js'

    @@ -10,6 +10,7 @@ export function useData() {
    __new hunk__
    10  const items = [];
    11  const loading = false;
    12 +const error = null;  // 绝对行号 12
    ```

3. **标记符**：
    - `__new hunk__` - 新代码块（包含添加和上下文）
    - `__old hunk__` - 旧代码块（只包含删除）

---

#### 3.2.3 `extractLinesFromDiffHunk` - 提取修改范围

```typescript
interface ModifiedRange {
    start: number; // 修改范围的起始行号（绝对）
    end: number; // 修改范围的结束行号（绝对）
}

export function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    const lines = diffHunk?.split('\n');
    const modifiedRanges: ModifiedRange[] = [];
    let currentRange: ModifiedRange | null = null;

    for (const line of lines) {
        if (line?.startsWith('@@')) {
            const match = line?.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (match) {
                if (currentRange) {
                    modifiedRanges.push(currentRange);
                    currentRange = null;
                }
            }
            continue;
        }

        if (line?.includes('__new hunk__') || line?.includes('__old hunk__')) {
            continue;
        }

        const lineMatch = line?.match(/^(\d+) ([+-])/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const changeType = lineMatch[2];

            // 只处理添加的行（代码审查关注新代码）
            if (changeType === '+') {
                if (!currentRange) {
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber,
                    };
                } else if (lineNumber === currentRange.end + 1) {
                    // 连续行，扩展 range
                    currentRange.end = lineNumber;
                } else {
                    // 不连续，关闭当前 range 并创建新的
                    modifiedRanges.push(currentRange);
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber,
                    };
                }
            }
        } else {
            // 非修改行，关闭当前 range
            if (currentRange) {
                modifiedRanges.push(currentRange);
                currentRange = null;
            }
        }
    }

    if (currentRange) {
        modifiedRanges.push(currentRange);
    }

    return modifiedRanges;
}
```

**算法逻辑**：

1. **连续检测**：`lineNumber === currentRange.end + 1` 判断是否连续
2. **范围合并**：连续的修改行合并为一个 range
3. **只处理 + 行**：`changeType === '+'` 确保只关注新增代码

---

### 3.3 平台 Diff 获取

#### GitHub

```typescript
// GitHub 使用 Octokit REST API
const files = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
});
```

#### GitLab

```typescript
// GitLab 使用 GitLab API
const files = await gitlabAPI.MergeRequests.allDiffs({
    projectId,
    mergeRequestIid,
});
```

#### Azure DevOps

```typescript
// Azure DevOps 需要手动生成 patch
import { createTwoFilesPatch } from 'diff';

const patch = createTwoFilesPatch(
    'old/file.ts',
    'new/file.ts',
    oldContent,
    newContent,
    baseCommitId,
    targetCommitId,
    { context: 3 },
);
```

---

## 四、文件分析编排层

### 4.1 ProcessFilesReview Stage：`libs/code-review/pipeline/stages/process-files-review.stage.ts`

```typescript
@Injectable()
export class ProcessFilesReview extends BasePipelineStage<CodeReviewPipelineContext> {
    private readonly concurrencyLimit = 20;  // 并发限制

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        // 创建分析上下文
        const analysisContext = this.createAnalysisContextFromPipelineContext(context);

        // 1. 创建优化批次
        const batches = this.createOptimizedBatches(changedFiles);

        // 2. 顺序处理每个批次
        await this.processBatchesSequentially(batches, analysisContext, ...);

        // 3. 返回结果
        return this.updateContext(context, (draft) => {
            draft.validSuggestions = execution.validSuggestions;
            draft.discardedSuggestions = execution.discardedSuggestions;
        });
    }

    private createOptimizedBatches(files: FileChange[]): FileChange[][] {
        const batches = createOptimizedBatches(files, {
            minBatchSize: 20,
            maxBatchSize: 30,
        });

        this.validateBatchIntegrity(batches, files.length);

        return batches;
    }

    private async processBatchesSequentially(...) {
        for (const [index, batch] of batches.entries()) {
            // 准备文件上下文（带并发限制）
            const preparedFiles = await this.filterAndPrepareFiles(batch, context);

            // 并行执行文件分析
            const results = await Promise.allSettled(
                preparedFiles.map(({ fileContext }) =>
                    this.executeFileAnalysis(fileContext),
                ),
            );

            // 收集结果
            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    this.collectFileProcessingResult(result.value, ...);
                }
            });
        }
    }
}
```

### 4.2 关键技术点

| 技术                   | 描述                   | 效果             |
| ---------------------- | ---------------------- | ---------------- |
| **批次优化**           | 20-30 个文件/批次      | 平衡吞吐量和负载 |
| **并发控制**           | 使用 `pLimit(20)`      | 避免过载         |
| **顺序批次处理**       | 批次间串行，批次内并行 | 最大化吞吐量     |
| **Promise.allSettled** | 一个失败不影响其他结果 | 提高容错性       |

---

## 五、LLM 分析层

### 5.1 LLMAnalysisService：`libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`

```typescript
@Injectable()
export class LLMAnalysisService implements IAIAnalysisService {
    async analyzeCodeWithAI_v2(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        fileContext: FileChangeContext,
        reviewModeResponse: ReviewModeResponse,
        context: AnalysisContext,
        byokConfig: BYOKConfig,
    ): Promise<AIAnalysisResult> {
        const defaultProvider = LLMModelProvider.GEMINI_2_5_PRO;
        const defaultFallback = LLMModelProvider.NOVITA_DEEPSEEK_V3;

        const promptRunner = new BYOKPromptRunnerService(
            this.promptRunnerService,
            defaultProvider,
            defaultFallback,
            byokConfig,  // 支持 BYOK (Bring Your Own Key)
        );

        // 1. 准备分析上下文
        const baseContext = await this.prepareAnalysisContext(fileContext, context);

        // 2. 构建 Prompt
        const schema = z.object({
            codeSuggestions: z.array(
                z.object({
                    id: z.string().optional(),
                    relevantFile: z.string(),
                    language: z.string(),
                    suggestionContent: z.string(),
                    existingCode: z.string().optional(),
                    improvedCode: z.string(),
                    oneSentenceSummary: z.string().optional(),
                    relevantLinesStart: z.number().min(1).optional(),
                    relevantLinesEnd: z.number().min(1).optional(),
                    label: z.string(),  // security, error_handling, etc.
                    severity: z.string().optional(),
                }),
            ),
        });

        // 3. 调用 LLM
        const { result: analysis } = await this.observabilityService.runLLMInSpan({
            spanName: `${LLMAnalysisService.name}::analyzeCodeWithAI_v2`,
            runName: 'analyzeCodeWithAI_v2',
            attrs: {
                organizationId: organizationAndTeamData.organizationId,
                prNumber,
                file: { filePath: fileContext?.file?.filename },
            },
            exec: async (callbacks) => {
                return await promptRunner
                    .builder()
                    .setParser(ParserType.ZOD, schema, {...})
                    .setLLMJsonMode(true)
                    .setPayload(baseContext)
                    .addPrompt({
                        prompt: prompt_codereview_system_gemini_v2,
                        role: PromptRole.SYSTEM,
                        scope: PromptScope.MAIN,
                    })
                    .addPrompt({
                        prompt: prompt_codereview_user_gemini_v2,
                        role: PromptRole.USER,
                        scope: PromptScope.MAIN,
                    })
                    .setTemperature(0)  // 确定性输出
                    .addCallbacks(callbacks)
                    .addMetadata({
                        organizationId: baseContext?.organizationAndTeamData?.organizationId,
                        teamId: baseContext?.organizationAndTeamData?.teamId,
                        pullRequestId: baseContext?.pullRequest?.number,
                        provider: byokConfig?.main?.provider || defaultProvider,
                        model: byokConfig?.main?.model,
                    })
                    .setMaxReasoningTokens(3000)
                    .execute();
            },
        });

        // 4. 处理响应
        const analysisResult: AIAnalysisResult = {
            codeSuggestions: analysis.codeSuggestions,
            codeReviewModelUsed: {
                generateSuggestions: byokConfig?.main?.provider || defaultProvider,
            },
        };

        return analysisResult;
    }
}
```

### 5.2 Prompt 结构

**System Prompt**：

```
Kody PR-Reviewer: Code Analysis System

Mission: You are Kody PR-Reviewer, a senior engineer specialized in understanding and reviewing code.
Your mission is to provide detailed, constructive, and actionable feedback.

Review Focus:
Focus exclusively on **new lines of code** (lines starting with '+').

Only propose suggestions that strictly fall under exactly one of these labels:
- 'security': Vulnerabilities, unsafe handling
- 'error_handling': Exception handling improvements
- 'refactoring': Readability, maintainability
- 'performance_and_optimization': Speed, efficiency issues
- 'maintainability': Easier to maintain
- 'potential_issues': Bugs, logical errors
- 'code_style': Coding standards
- 'documentation_and_comments': Documentation improvements
```

**User Prompt 结构**：

```xml
## Context

<codeDiff>
    ## file: 'src/index.js'

    @@ -10,6 +10,7 @@ export function useData() {
    __new hunk__
    10  const items = [];
    11  const loading = false;
    12 +const error = null;
</codeDiff>

<filePath>
    src/index.js
</filePath>

<fileContent>
    // 完整文件内容（Heavy Mode）
</fileContent>

<suggestionsContext>
    [{"id": "uuid-1", "relevantFile": "src/index.js", ...}]
</suggestionsContext>
```

---

## 六、多重过滤层

### 6.1 完整过滤链

```typescript
// 阶段 1: Options Filter
const filteredByOptions = this.suggestionService.filterCodeSuggestionsByReviewOptions(
    context.codeReviewConfig?.reviewOptions,
    combinedResult,
);

// 阶段 2: Code Diff Filter
const filterSuggestionsCodeDiff = async (patchWithLinesStr, codeSuggestions) => {
    const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);
    return codeSuggestions?.filter((suggestion) => {
        return modifiedRanges.some((range) => {
            return (
                (suggestion?.relevantLinesStart >= range.start &&
                    suggestion?.relevantLinesStart <= range.end) ||
                (suggestion?.relevantLinesEnd >= range.start &&
                    suggestion?.relevantLinesEnd <= range.end)
            );
        });
    });
}

// 阶段 3: Kody Fine-Tuning Filter
const kodyFineTuningResult = await this.applyKodyFineTuningFilter(...);

// 阶段 4: Safeguard Filter
const safeGuardResult = await this.applySafeguardFilter(...);

// 阶段 5: Severity Analysis
const suggestionsWithSeverity = await this.suggestionService.analyzeSuggestionsSeverity(...);

// 阶段 6: Kody Rules Filter
const kodyRulesSuggestions = await this.codeAnalysisOrchestrator.executeKodyRulesAnalysis(...);

// 阶段 7: AST Analysis
const kodyASTSuggestions = await this.kodyAstAnalyzeContextPreparation.prepareKodyASTAnalyzeContext(context);
```

### 6.2 Code Diff Filter：范围检查

**重叠判断逻辑**：

```
建议范围: [10, 15]
修改范围: [12, 14]

✅ 保留：因为有重叠
❌ 过滤：完全不在范围内
```

### 6.3 Safeguard Filter：LLM 二次验证

```typescript
async filterSuggestionsSafeGuard(
    organizationAndTeamData: OrganizationAndTeamData,
    prNumber: number,
    file: any,
    relevantContent: string,
    codeDiff: string,
    suggestions: any[],
    languageResultPrompt: string,
    reviewMode: ReviewModeResponse,
    byokConfig: BYOKConfig,
): Promise<ISafeguardResponse> {
    const schema = z.object({
        codeSuggestions: z.array(
            z.object({
                id: z.string(),
                suggestionContent: z.string(),
                existingCode: z.string(),
                improvedCode: z.string().nullable(),
                oneSentenceSummary: z.string(),
                relevantLinesStart: z.number().min(1),
                relevantLinesEnd: z.number().min(1),
                label: z.string().optional(),
                action: z.string(),  // 'update' | 'discard'
                reason: z.string().optional(),
            }),
        ),
    });

    const { result: filteredSuggestionsRaw } = await this.observabilityService.runLLMInSpan({
        spanName: `${LLMAnalysisService.name}::filterSuggestionsSafeGuard`,
        runName: 'filterSuggestionsSafeGuard',
        attrs: { ... },
        exec: async (callbacks) => {
            return await promptRunner
                .builder()
                .setParser(ParserType.ZOD, schema as any, {
                    provider: LLMModelProvider.OPENAI_GPT_4O_MINI,
                    fallbackProvider: LLMModelProvider.OPENAI_GPT_4O,
                })
                .setLLMJsonMode(true)
                .setPayload(payload)
                .addPrompt({
                    prompt: prompt_codeReviewSafeguard_system,
                    role: PromptRole.SYSTEM,
                })
                .setTemperature(0)
                .addCallbacks(callbacks)
                .setMaxReasoningTokens(5000)
                .execute();
        },
    });
}
```

**Safeguard LLM 判断标准**：

- 移除建议的原因：Introduces bugs, Breaks existing code, Contradicts itself, Based on hallucination
- 保留建议：修复了真实问题，基于实际代码提出改进

---

## 七、评论生成与发布层

### 7.1 CommentManagerService：`libs/code-review/infrastructure/adapters/services/commentManager.service.ts`

```typescript
@Injectable()
export class CommentManagerService implements ICommentManagerService {
    async createLineComments(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        repository: { name: string; id: string; language: string },
        lineComments: Comment[],
        language: string,
        dryRun?: CodeReviewPipelineContext['dryRun'],
        suggestionCopyPrompt?: boolean,
    ): Promise<{
        lastAnalyzedCommit: any;
        commits: any[];
        commentResults: Array<CommentResult>;
    }> {
        // 1. 获取 commits
        const commits =
            await this.codeManagementService.getCommitsForPullRequestForCodeReview(
                {
                    organizationAndTeamData,
                    repository,
                    prNumber,
                },
            );

        const lastAnalyzedCommit = commits[commits.length - 1];
        const commentResults = [];

        // 2. 为每个建议创建行内评论
        for (const comment of lineComments) {
            const createdComment =
                await this.codeManagementService.createReviewComment(
                    {
                        organizationAndTeamData,
                        repository,
                        commit: lastAnalyzedCommit,
                        prNumber,
                        lineComment: comment,
                        language,
                        dryRun,
                        suggestionCopyPrompt,
                    },
                    dryRun?.enabled ? PlatformType.INTERNAL : undefined,
                );

            commentResults.push({
                comment,
                deliveryStatus: DeliveryStatus.SENT,
                codeReviewFeedbackData: {
                    commentId: createdComment?.id,
                    pullRequestReviewId: createdComment?.pullRequestReview_id,
                    suggestionId: comment.suggestion.id,
                },
            });
        }

        return { lastAnalyzedCommit, commits, commentResults };
    }

    async updateOverallComment(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        repository: { name: string; id: string },
        commentId: number,
        noteId: number,
        platformType: PlatformType,
        codeSuggestions?: Array<CommentResult>,
        codeReviewConfig?: CodeReviewConfig,
        threadId?: number,
        finalCommentBody?: string,
        dryRun?: CodeReviewPipelineContext['dryRun'],
    ): Promise<void> {
        let commentBody = finalCommentBody;

        if (!commentBody || commentBody === '') {
            commentBody = await this.generateLastReviewCommenBody(
                organizationAndTeamData,
                prNumber,
                platformType,
                codeSuggestions,
                codeReviewConfig,
                prLevelCommentResults,
            );
        }

        await this.codeManagementService.updateIssueComment(
            {
                organizationAndTeamData,
                prNumber,
                repository: { name: repository.name, id: repository.id },
                body: commentBody,
                noteId,
                threadId,
                dryRun,
            },
            dryRun?.enabled ? PlatformType.INTERNAL : undefined,
        );
    }
}
```

### 7.2 评论类型

| 类型         | 描述                 | 示例                                          |
| ------------ | -------------------- | --------------------------------------------- |
| **行内评论** | 针对特定代码行的评论 | "Line 45: Consider using async/await instead" |
| **整体评论** | PR 级别的总结性评论  | "## Code Review Completed!"                   |
| **PR 摘要**  | 自动生成的 PR 描述   | "This PR adds user authentication..."         |

### 7.3 评论追踪机制

```typescript
// GitHub 使用 HTML 注释标记追踪
const uniqueId = `completed-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const commentBody = `${resultText}\n\n<!-- kody-codereview-${uniqueId} -->\n<!-- kody-codereview -->\n&#8203;`;

// 更新时查找并最小化旧评论
await this.minimizeLastReviewComment(prNumber, platformType);
```

---

## 八、性能优化关键技术

### 8.1 Token 优化

| 阶段                    | 优化技术           | 效果                |
| ----------------------- | ------------------ | ------------------- |
| **Deletion-only hunks** | 移除只删除的 hunks | 节省 27% tokens     |
| **AST 上下文提取**      | 只提取相关代码     | 节省 26% tokens     |
| **批处理优化**          | 20-30 files/batch  | 提高吞吐量          |
| **总优化**              | 组合所有优化       | 节省 ~50-60% tokens |

### 8.2 并发控制

```typescript
// 文件分析并发限制：20
private readonly concurrencyLimit = 20;

// 批次间串行处理（避免负载过高）
await this.processBatchesSequentially(batches, context);

// 批次内并行处理（最大化吞吐量）
const results = await Promise.allSettled(
    preparedFiles.map(({ fileContext }) =>
        this.executeFileAnalysis(fileContext)
    ),
);
```

### 8.3 大文件处理

```typescript
// 最大文件数限制
private readonly maxFilesToAnalyze = 500;

// Token 分块处理
const chunkingResult = this.tokenChunkingService.chunkDataByTokens({
    data: files,
    model: 'gpt-4o',
    usagePercentage: 60,  // 60% token 限制
});

// 批次间延迟
const batchConfig = {
    maxConcurrentChunks: 10,
    batchDelay: 100  // ms between batches
};
```

---

## 九、关键技术栈总结

| 层级              | 技术                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| **Web Server**    | NestJS (Express)                                                                 |
| **LLM**           | Gemini 2.5 Pro + DeepSeek V3 (fallback)                                          |
| **Diff**          | 标准 unified diff + 自定义处理逻辑                                               |
| **Job Queue**     | RabbitMQ (Bull)                                                                  |
| **Database**      | PostgreSQL (TypeORM) + MongoDB (Mongoose)                                        |
| **验证**          | Zod (强类型检查)                                                                 |
| **API 客户端**    | Octokit (GitHub), @gitbeaker (GitLab), node-bitbucket (Bitbucket), axios (Azure) |
| **并发控制**      | p-limit                                                                          |
| **Observability** | OpenTelemetry + Pino Logger                                                      |
| **Prompt Runner** | @kodus/kodus-common/llm (统一接口)                                               |

---

## 十、完整数据流图

```
┌─────────────────────────────────────────────────────────┐
│ GitHub PR Webhook                                 │
│   ├─ Event: pull_request                           │
│   ├─ Action: opened/synchronize                 │
│   └─ Payload: {PR 数据}                    │
└─────────────────────┬──────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ 立即响应 (200 OK)                              │
└─────────────────────┬──────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ EnqueueWebhookUseCase (异步)                       │
│ ├─ 创建 WorkflowJob (PENDING 状态)              │
│ ├─ 保存到 PostgreSQL                           │
│ └─ 返回 correlationId                         │
└─────────────────────┬──────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ Worker (RabbitMQ Consumer)                        │
│ ├─ 拾取 PENDING Job                         │
│ ├─ 更新状态为 PROCESSING                      │
│ ├─ 调用 RunCodeReviewAutomationUseCase       │
└─────────────────────┬──────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ RunCodeReviewAutomationUseCase                     │
│ ├─ 验证团队配置                               │
│ ├─ 权限检查（被忽略用户、许可证）           │
│ ├─ 入队 CODE_REVIEW Job                   │
└─────────────────────┬──────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ Code Review Pipeline (13 阶段)               │
│                                                     │
│ 1. ResolveConfigStage                               │
│ 2. ValidateConfigStage                           │
│ 3. ValidateNewCommitsStage                        │
│ 4. FetchChangedFilesStage ← 关键入口          │
│ ├─ PullRequestManagerService.getChangedFiles()       │
│ ├─ 返回 FileChange[]                              │
│ ├─ prepareFilesWithLineNumbers()               │
│ └─ 存储到 changedFiles[]                          │
│                                                     │
│ 5. LoadExternalContextStage (可选)               │
│ └─ MCP 工具调用获取额外上下文                  │
│                                                     │
│ 6. InitialCommentStage                              │
│ ├─ 创建 "Kody is reviewing..." 评论              │
│ └─ 发布到平台                                 │
│                                                     │
│ 7. ProcessFilesReviewStage ← 核心分析      │
│ ├─ 批处理：20-30 files/batch               │
│ ├─ 并发限制：20                               │
│ ├─ 调用 LLM Analysis (Gemini/DeepSeek)     │
│ ├─ 多重过滤链                                   │
│ │   ├─ Options Filter                           │
│ │   ├─ Code Diff Filter (extractLinesFromDiffHunk) │
│   ├─ Kody Fine-Tuning                     │
│   ├─ Safeguard Filter (LLM 二次验证)           │
│ │   ├─ Severity Analysis (评估严重性)             │
│ │   ├─ Kody Rules (自定义规则)               │
│ │   └─ AST Analysis (结构分析)              │
│ │                                                     │
│ 8. CreateFileCommentsStage ← 发布评论       │
│ ├─ 为每个有效建议创建行内评论             │
│ └─ CodeManagementService.createReviewComment()       │
│                                                     │
│ 9. AggregateResultsStage                          │
│ ├─ 聚合文件级和 PR 级建议              │
│ │                                                     │
│ 10. CreatePrLevelCommentsStage (可选)           │
│ ├─ PR 级别建议（跨文件）                     │
│ └─ CommentManagerService.createIssueComment()        │
│                                                     │
│ 11. UpdateCommentsAndGenerateSummaryStage          │
│ ├─ 更新整体评论                                 │
│ ├─ 更新初始评论状态                             │
│ └─ 生成 PR 摘要（如果配置）               │
│                                                     │
│ 12. RequestChangesOrApproveStage (可选)        │
│ └─ 请求更改/批准（如果配置）               │
│                                                     │
│ 13. UpdateCommentsAndGenerateSummaryStage          │
│ ├─ 最终化评论状态                                 │
│ └─ 更新完成时间戳                                 │
└─────────────────────┬──────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ CommentManagerService                                  │
│ ├─ createLineComments() ← 行内评论             │
│ ├─ updateOverallComment() ← 整体评论            │
│ ├─ generateSummaryPR() ← PR 摘要生成        │
│ └─ minimizeLastReviewComment() ← 最小化旧评论   │
└─────────────────────┬──────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ CodeManagementService (Platform API 抽象)           │
│ ├─ GitHub (Octokit)                               │
│ ├─ GitLab (@gitbeaker)                             │
│ ├─ Bitbucket (node-bitbucket)                       │
│ └─ Azure Repos (axios)                            │
└─────────────────────────────────────────────────────────┘
```

---

## 十一、关键技术创新点

### 11.1 Diff 智能处理

| 技术                     | 描述                   | 效果           |
| ------------------------ | ---------------------- | -------------- |
| **删除-only hunks 过滤** | 移除只包含删除的 hunks | 减少 27% token |
| **绝对行号注入**         | 为 diff 添加绝对行号   | 精确的代码位置 |
| **修改范围提取**         | 自动识别连续修改块     | 用于建议过滤   |

### 11.2 批处理优化

- **动态批次大小**：20-30 files/batch
- **并发控制**：批次内并行，批次间串行
- **Token 基于分块**：60% usage per chunk

### 11.3 多重过滤机制

```
初始 LLM 建议：100 个
├─ Options Filter：保留 60 个
├─ Code Diff Filter：保留 40 个
├─ Kody Fine-Tuning：丢弃 15 个（历史重复）
├─ Safeguard Filter：丢弃 5 个（幻觉/错误）
├─ Severity Analysis：评估严重性
└─ 最终有效建议：20 个
```

### 11.4 评论发布优化

- **追踪机制**：HTML 注释标记避免重复
- **最小化**：自动最小化旧评论
- **干 Run 支持**：内部操作不发布评论

### 11.5 平台抽象

- **统一接口**：`ICodeManagementService`
- **Factory 模式**：动态获取平台服务
- **装饰器模式**：运行时类型标记

### 11.6 可观测性

- **OpenTelemetry**：分布式追踪
- **Pino Logger**：结构化日志
- **Span 命名**：清晰的阶段划分

---

## 十二、附录

### 12.1 核心文件路径

| 功能                     | 文件路径                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Diff 处理**            | `libs/common/utils/patch.ts`                                                  |
| **Webhook Handler**      | `libs/platform/infrastructure/webhooks/github/githubPullRequest.handler.ts`   |
| **LLM Analysis**         | `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`    |
| **Comment Manager**      | `libs/code-review/infrastructure/adapters/services/commentManager.service.ts` |
| **Pipeline Stages**      | `libs/code-review/pipeline/stages/`                                           |
| **Platform Integration** | `libs/platform/infrastructure/adapters/services/`                             |
| **Job Processing**       | `libs/automation/webhook-processing/webhook-processing-job.processor.ts`      |

### 12.2 数据结构定义

```typescript
// 文件变更
interface FileChange {
    filename: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string; // Raw unified diff
    patchWithLinesStr?: string; // Processed with line numbers
}

// 修改范围
interface ModifiedRange {
    start: number; // 起始行号（绝对）
    end: number; // 结束行号（绝对）
}

// 代码建议
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
    label: string; // security, error_handling, etc.
    severity: string;
}
```

### 12.3 环境变量配置

| 变量             | 描述                | 默认值                  |
| ---------------- | ------------------- | ----------------------- |
| `API_NODE_ENV`   | 运行环境            | `development`           |
| `RABBITMQ_URL`   | RabbitMQ 连接字符串 | `amqp://localhost:5672` |
| `API_PG_DB_HOST` | PostgreSQL 主机     | `localhost`             |
| `API_PG_DB_PORT` | PostgreSQL 端口     | `5432`                  |
| `API_MG_DB_HOST` | MongoDB 主机        | `localhost`             |
| `API_MG_DB_PORT` | MongoDB 端口        | `27017`                 |

### 12.4 性能指标

| 指标                 | 值                                    |
| -------------------- | ------------------------------------- |
| **Webhook 响应时间** | < 500ms                               |
| **Token 优化效果**   | ~50-60% 节省                          |
| **最大文件数**       | 500                                   |
| **批处理大小**       | 20-30 files                           |
| **并发限制**         | 20                                    |
| **LLM Provider**     | Gemini 2.5 Pro + DeepSeek V3 fallback |

---

## 总结

Kodus AI 的 diff 处理系统是一个**高度工程化、可扩展、高性能**的架构：

1. **解耦设计**：平台、分析、过滤、评论各层分离
2. **异步处理**：Webhook 立即响应，后台排队
3. **智能优化**：多层 Token 优化，减少 50%+ 成本
4. **严格验证**：7 重过滤机制确保质量
5. **可观测性**：完整的追踪和监控
6. **可扩展性**：支持多平台、自定义规则、MCP 工具

整个流程从 GitHub webhook 触发开始，经过 13 个流水线阶段，最终将精确、相关的代码审查评论发布回 PR。关键技术点包括 diff 智能解析、批处理优化、多重过滤、评论追踪等。
