# Kodus AI - Code Review 系统架构图

## 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Git/GitLab/Bitbucket/Azure                    │
│                                      │                                    │
│                                      ▼                                    │
│                          ┌─────────────────────┐                               │
│                          │   Webhook Event    │                               │
│                          │ (PR Open/Update)  │                               │
│                          └─────────────────────┘                               │
│                                      │                                    │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Webhooks Application                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         github.controller.ts / gitlab.controller.ts          │      │
│  │         • Verify signature                                          │      │
│  │         • Extract event                                             │      │
│  │         • Respond immediately (200 OK)                             │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
│                           ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │      EnqueueWebhookUseCase                                 │      │
│  │      • Validate payload                                         │      │
│  │      • Enqueue to RabbitMQ (WEBHOOK_PROCESSING)                   │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          RabbitMQ / Job Queue                             │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │WEBHOOK_       │  │CODE_REVIEW_    │  │OTHER_           │    │
│  │PROCESSING      │  │JOB            │  │WORKFLOWS        │    │
│  └────────┬───────┘  └───────┬────────┘  └──────────────────┘    │
│             │                     │                                       │
└─────────────┼─────────────────────┼───────────────────────────────────┘
              │                     │
              ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Worker Application                                │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │     WebhookProcessingJobProcessor                             │      │
│  │     • Dequeue WEBHOOK_PROCESSING                              │      │
│  │     • Delegate to platform-specific handlers                     │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
│                           ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   GitHubPullRequestHandler / GitLabPullRequestHandler       │      │
│  │   • Save PR to PostgreSQL                                     │      │
│  │   • Find team automation configuration                        │      │
│  │   • Validate automation is active                              │      │
│  │   • Enqueue CODE_REVIEW job                                  │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    Code Review Job Processor                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │     RunCodeReviewAutomationUseCase                            │      │
│  │                                                             │      │
│  │     1. Permission Validation:                                  │      │
│  │        • User ignored?                                           │      │
│  │        • Valid license?                                          │      │
│  │        • BYOK required?                                         │      │
│  │        • Auto-assign license (if configured)                  │      │
│  │                                                             │      │
│  │     2. Execute Automation Strategy:                              │      │
│  │        • Call ExecuteAutomationService                          │      │
│  │                                                             │      │
│  │     3. Error Handling:                                        │      │
│  │        • Add reaction (thumbs down) if no license               │      │
│  │        • Post error comment                                       │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
│                           ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │      ExecuteAutomationService                                  │      │
│  │      • Get strategy from AutomationRegistry                      │      │
│  │      • Run CodeReviewPipelineStrategy                          │      │
│  └──────────────────────────┬──────────────────────────────────────┘      │
│                           │                                               │
└───────────────────────────┼───────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                  Code Review Pipeline Strategy                            │
│                  (13 Sequential Stages)                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 1: ValidateNewCommitsStage                     │      │
│  │         → Check if new commits exist                              │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 2: ResolveConfigStage                          │      │
│  │         → Load code review configuration                        │      │
│  │         → Get ignore paths                                        │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 3: ValidateConfigStage                         │      │
│  │         → Validate configuration is valid                          │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 4: FetchChangedFilesStage                     │      │
│  │         → Get changed files from platform API                    │      │
│  │         → Apply ignore patterns                                  │      │
│  │         → Validate file count (max 500)                         │      │
│  │         → Generate diff with line numbers                        │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 5: LoadExternalContextStage                    │      │
│  │         → Load external file references                            │      │
│  │         → Execute MCP tools                                      │      │
│  │         → Build Context Pack                                     │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 6: FileContextGateStage                         │      │
│  │         → Check sufficient context                                  │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 7: InitialCommentStage                         │      │
│  │         → Post initial "Kody is reviewing..." comment             │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 8: ProcessFilesPrLevelReviewStage            │      │
│  │         → PR-level analysis                                     │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 9: ProcessFilesReview ⭐ (CORE)                │      │
│  │                                                             │      │
│  │         Batch Processing (20-30 files per batch):               │      │
│  │                                                             │      │
│  │         For each batch:                                             │      │
│  │           ┌──────────────────────────────────────┐               │      │
│  │           │  CodeAnalysisOrchestrator    │               │      │
│  │           │                            │               │      │
│  │           │  ┌────────────────────┐   │               │      │
│  │           │  │ 1. Standard LLM   │   │               │      │
│  │           │  │    Analysis      │   │               │      │
│  │           │  │  (Gemini 2.5)   │   │               │      │
│  │           │  └────────┬───────────┘   │               │      │
│  │           │           │               │               │      │
│  │           │  ┌────────▼──────────┐   │               │      │
│  │           │  │ 2. KodyRules      │   │               │      │
│  │           │  │    Analysis       │   │               │      │
│  │           │  │  (Classifier →     │   │               │      │
│  │           │  │   Generator →      │   │               │      │
│  │           │  │   Guardian)       │   │               │      │
│  │           │  └────────┬───────────┘   │               │      │
│  │           │           │               │               │      │
│  │           │  ┌────────▼──────────┐   │               │      │
│  │           │  │ 3. AST Analysis   │   │               │      │
│  │           │  │    (Optional)     │   │               │      │
│  │           │  └────────┬───────────┘   │               │      │
│  │           │           │               │               │      │
│  │           │  ┌────────▼──────────┐   │               │      │
│  │           │  │ 4. Merge &       │   │               │      │
│  │           │  │    Deduplicate    │   │               │      │
│  │           │  └────────┬───────────┘   │               │      │
│  │           │           │               │               │      │
│  │           │  ┌────────▼──────────┐   │               │      │
│  │           │  │ 5. Apply Filters │   │               │      │
│  │           │  │  (Safeguard,     │   │               │      │
│  │           │  │   Severity,       │   │               │      │
│  │           │  │   Fine-tuning)    │   │               │      │
│  │           │  └────────┬───────────┘   │               │      │
│  │           │           │               │               │      │
│  │           │           └───────────────┘               │      │
│  │           │                   (Suggestions)              │      │
│  │           └──────────────────────────────────────┘               │      │
│  │                                                             │      │
│  │         Return: validSuggestions, discardedSuggestions              │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │        Stage 10: CreatePrLevelCommentsStage               │      │
│  │        → Generate PR summary comment                             │      │
│  │        → Update PR description (if configured)                │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │        Stage 11: CreateFileCommentsStage ⭐                   │      │
│  │                                                             │      │
│  │         CommentManagerService:                                 │      │
│  │           • Calculate exact line ranges                          │      │
│  │           • Format comment body (markdown)                     │      │
│  │           • Create line comments on platform                    │      │
│  │           • Save suggestions to PostgreSQL                       │      │
│  │           • Track delivery status                                │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Stage 12: AggregateResultsStage                       │      │
│  │         → Aggregate all results                                     │      │
│  │         → Calculate metrics                                       │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Stage 13: UpdateCommentsAndGenerateSummaryStage           │      │
│  │   • Update initial comment status                               │      │
│  │   • Generate final summary                                    │      │
│  │   • Mark as COMPLETED                                         │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Stage 14: RequestChangesOrApproveStage                   │      │
│  │   • Request changes (if critical issues found)               │      │
│  │   • Approve (if configured and no issues)                 │      │
│  │   • Use GitHub Checks API                                  │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## LLM 分析详细流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    LLM Analysis Service                                 │
│                                                                         │
│  File Context: { fileContent, patchWithLinesStr, language, ... }          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Prepare Analysis Context                               │      │
│  │                                                             │      │
│  │         Review Mode Selection:                                   │      │
│  │           • LIGHT_MODE: Only diff (~5k tokens)                 │      │
│  │           • HEAVY_MODE: Full file + diff (~50k tokens)         │      │
│  │                                                             │      │
│  │         Context Optimization:                                  │      │
│  │           • Extract relevant content                             │      │
│  │           • Calculate line numbers                               │      │
│  │           • Format for prompt                                   │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         BYOK Prompt Runner                                │      │
│  │                                                             │      │
│  │         Provider Configuration:                                  │      │
│  │           • Primary: Gemini 2.5 Pro                               │      │
│  │           • Fallback: DeepSeek V3                                │      │
│  │           • BYOK: User's custom keys (if configured)            │      │
│  │                                                             │      │
│  │         Mode:                                                │      │
│  │           • KODY: Use Kodus API keys                             │      │
│  │           • BYOK: Use user's API keys                           │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Prompt Builder                                      │      │
│  │                                                             │      │
│  │         System Prompt:                                       │      │
│  │           • "Kody PR-Reviewer - Senior Engineer"                │      │
│  │           • Define review categories (8 labels)                    │      │
│  │           • Set guidelines (security, maintainability, etc.)        │      │
│  │           • Emphasize bug detection in production                  │      │
│  │                                                             │      │
│  │         User Prompt:                                         │      │
│  │           • PR Summary (to understand intent)                    │      │
│  │           • Complete File Content (heavy mode)                     │      │
│  │           • Code Diff (patch with line numbers)                  │      │
│  │           • Max suggestions limit                               │      │
│  │           • Language note (response language)                     │      │
│  │                                                             │      │
│  │         Context Injection (if external references exist):          │      │
│  │           • File references: "Source: File - path/to/file"      │      │
│  │           • MCP tool outputs: "Source: MCP Tools - tool result"   │      │
│  │           • Category overrides: Custom category definitions           │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         LLM Provider (via @kodus/kodus-common)             │      │
│  │                                                             │      │
│  │         Configuration:                                        │      │
│  │           • Temperature: 0 (deterministic)                      │      │
│  │           • JSON Mode: true                                      │      │
│  │           • Parser: STRING (then parse to JSON)                │      │
│  │                                                             │      │
│  │         Execution:                                           │      │
│  │           • Send request to LLM API                            │      │
│  │           • Track tokens used                                    │      │
│  │           • Record latency                                      │      │
│  │           • Handle errors (retry with fallback)                 │      │
│  │                                                             │      │
│  │         Response:                                            │      │
│  │           • Raw JSON string                                      │      │
│  │           • { codeSuggestions: [...] }                           │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         LLM Response Processor                              │      │
│  │                                                             │      │
│  │         Tasks:                                               │      │
│  │           1. Parse JSON response                                 │      │
│  │           2. Validate structure (required fields)                │      │
│  │           3. Sanitize content (remove unsafe HTML)              │      │
│  │           4. Calculate severity (if not provided)               │      │
│  │           5. Assign priority (critical > high > medium > low)   │      │
│  │           6. Add UUID to each suggestion                        │      │
│  │                                                             │      │
│  │         Output:                                              │      │
│  │           • AIAnalysisResult { codeSuggestions: [...] }            │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## KodyRules 分析详细流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                  KodyRules Analysis Service                             │
│                                                                         │
│  File Context + Applicable Rules                                    │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step A: Classifier (identify violations)                   │      │
│  │                                                             │      │
│  │   Prompt:                                                    │      │
│  │     "You are a panel of three expert engineers..."              │      │
│  │     "KodyRules: [...]"                                     │      │
│  │     "PR Diff: ..."                                         │      │
│  │                                                             │      │
│  │   LLM Call:                                                   │      │
│  │     → Analyze which rules are violated                          │      │
│  │     → Panel discussion (critique each other)                    │      │
│  │     → Merge duplicates                                       │      │
│  │                                                             │      │
│  │   Output: { violatedRules: ["uuid1", "uuid2"] }             │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step B: Generator (create suggestions)                     │      │
│  │                                                             │      │
│  │   Input: Violated rule IDs from Step A                        │      │
│  │   Prompt:                                                    │      │
│  │     "Generate clear, constructive suggestions..."                │      │
│  │     "KodyRules (violated): [...]"                           │      │
│  │     "File Content: ..."                                     │      │
│  │     "Diff: ..."                                             │      │
│  │                                                             │      │
│  │   LLM Call:                                                   │      │
│  │     → Generate separate suggestion for each violation              │      │
│  │     → Ensure no duplicates with standard suggestions             │      │
│  │     → Focus only on KodyRules (not general practices)          │      │
│  │                                                             │      │
│  │   Output: { codeSuggestions: [...] }                        │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step C: Guardian (filter invalid)                         │      │
│  │                                                             │      │
│  │   Input: Generated suggestions from Step B                       │      │
│  │   Prompt:                                                    │      │
│  │     "You are KodyGuardian, a strict gatekeeper..."            │      │
│  │     "Suggestions: [...]"                                     │      │
│  │     "KodyRules: [...]"                                     │      │
│  │                                                             │      │
│  │   LLM Call:                                                   │      │
│  │     → Check if each suggestion violates any rule               │      │
│  │     → Remove those that introduce new violations               │      │
│  │     → Do not reveal rules or reasoning                         │      │
│  │                                                             │      │
│  │   Output: { filtered: [...], removed: [...] }                │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step D: Updater (merge with standard)                   │      │
│  │                                                             │      │
│  │   Input:                                                      │      │
│  │     • Standard LLM suggestions                                 │      │
│  │     • Guardian-filtered KodyRules suggestions                  │      │
│  │   Prompt:                                                    │      │
│  │     "Review and adjust suggestions to comply..."               │      │
│  │     "Standard Suggestions: [...]"                           │      │
│  │     "KodyRules: [...]"                                     │      │
│  │                                                             │      │
│  │   LLM Call:                                                   │      │
│  │     → Refactor improvedCode if violates KodyRules             │      │
│  │     → List violated rule IDs                                  │      │
│  │     → Update 'llmPrompt' field with context                   │      │
│  │                                                             │      │
│  │   Output: { codeSuggestions: [...] }                        │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step E: Merge & Deduplicate                              │      │
│  │                                                             │      │
│  │   Combine:                                                    │      │
│  │     • Updated standard suggestions                              │      │
│  │     • KodyRules suggestions                                 │      │
│  │                                                             │      │
│  │   Deduplicate:                                                 │      │
│  │     • Calculate similarity (text + code)                      │      │
│  │     • Cluster similar suggestions                              │      │
│  │     • Generate cluster summaries                              │      │
│  │                                                             │      │
│  │   Output:                                                      │      │
│  │     • AIAnalysisResult { codeSuggestions: [...] }            │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Context 管理详细流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                 Context Management (MCP Integration)                    │
│                                                                         │
│  Prompt Text + Repository Info                                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 1: Reference Detection                              │      │
│  │                                                             │      │
│  │   Input: Prompt text                                          │      │
│  │   Tasks:                                                       │      │
│  │     • Scan for patterns: @file(path), #ref, etc.          │      │
│  │     • Regex pre-filter (skip if no patterns)               │      │
│  │     • Detect reference type (file, rule, etc.)              │      │
│  │                                                             │      │
│  │   Output:                                                      │      │
│  │     { references: [{filePath, lineRange, ...}] }            │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 2: Load External References                       │      │
│  │                                                             │      │
│  │   For each reference:                                         │      │
│  │     • If file reference:                                     │      │
│  │       → Fetch from Git repository                              │      │
│  │       → Extract relevant lines (lineRange)                    │      │
│  │     • If KodyRule reference:                                │      │
│  │       → Load from PostgreSQL (kody_rules table)            │      │
│  │       → Get rule description and examples                   │      │
│  │                                                             │      │
│  │   Error Handling:                                               │      │
│  │     • Record sync errors (file not found, etc.)            │      │
│  │     • Include in prompt with warning message                 │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 3: MCP Tool Execution                             │      │
│  │                                                             │      │
│  │   MCP Orchestrator:                                            │      │
│  │     • Register MCP servers (from configuration)               │      │
│  │     • Define ContextRequirement                              │      │
│  │       → domain: 'code'                                       │      │
│  │       → taskIntent: 'review'                                 │      │
│  │       → retrieval: { candidates: [] }                      │      │
│  │                                                             │      │
│  │   Build Pack Process:                                         │      │
│  │     • SequentialPackAssemblyPipeline                         │      │
│  │     • Stage 1: Core (base context)                        │      │
│  │     • Stage 2: Retrieval (load references)               │      │
│  │     • Stage 3: Assembly (combine layers)                  │      │
│  │                                                             │      │
│  │   Execute MCP Tools:                                          │      │
│  │     • code-structure-analyzer (analyze codebase)            │      │
│  │     • api-documentation-fetcher (fetch API specs)             │      │
│  │     • dependency-tracer (find dependencies)                 │      │
│  │                                                             │      │
│  │   Output: ContextPack { layers: [...], resources: [...] }      │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 4: Build Context Layer                          │      │
│  │                                                             │      │
│  │   For each reference source (custom_instructions,        │      │
│                            categories, severity, generation):        │      │
│  │                                                             │      │
│  │     Create Layer:                                               │      │
│  │       id: 'source-type-path'                                 │      │
│  │       stage: 'retrieval'                                     │      │
│  │       content:                                                │      │
│  │         • references: [FileReference, ...]                │      │
│  │         • syncErrors: [Error, ...]                          │      │
│  │       metadata:                                                 │      │
│  │         • sourceType: 'category_bug' | ...                   │      │
│  │         • path: ['categories', 'descriptions', 'bug']       │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 5: Extract MCP Augmentations                   │      │
│  │                                                             │      │
│  │   Parse MCP outputs from ContextPack:                        │      │
│  │                                                             │      │
│  │   For each tool output:                                      │      │
│  │     • Format: "--- Tool: tool-name ---\n{output}"            │      │
│  │     • Add to augmentation map                                 │      │
│  │     • Include provider and success status                     │      │
│  │                                                             │      │
│  │   Output:                                                      │      │
│  │     { augmentations: { pathKey: [{output, error}] } }      │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │   Step 6: Inject into Prompt                            │      │
│  │                                                             │      │
│  │   For each section (categories, severity, etc.):             │      │
│  │                                                             │      │
│  │     Priority:                                                   │      │
│  │       1. v2PromptOverrides (user custom text)              │      │
│  │       2. Layer context (from MCP & references)            │      │
│  │       3. External context (from externalPromptContext)        │      │
│  │       4. Default values (from config file)                │      │
│  │                                                             │      │
│  │     Format:                                                     │      │
│  │       Base text                                                 │      │
│  │       ↓                                                          │
│  │       ### Source: File - path/to/file (lines X-Y)           │      │
│  │       {file content}                                          │      │
│  │       ↓                                                          │      │
│  │       ### Source: MCP Tools                                │      │
│  │       {guidance}                                             │      │
│  │       {tool outputs}                                         │      │
│  │       ↓                                                          │      │
│  │       ### Source: System Messages                          │      │
│  │       {sync errors (if any)}                               │      │
│  │                                                             │      │
│  │   Output: Final prompt with all context injected                │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 评论生成与发布流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    Comment Manager Service                              │
│                                                                         │
│  Valid Suggestions (after filters)                                  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Calculate Line Ranges                               │      │
│  │                                                             │      │
│  │   Input:                                                      │      │
│  │     • relevantLinesStart: 45 (absolute line number)         │      │
│  │     • relevantLinesEnd: 67 (absolute line number)           │      │
│  │     • patch: String with diff format                       │      │
│  │                                                             │      │
│  │   Algorithm:                                                   │      │
│  │     1. Parse patch hunks                                     │      │
│  │     2. Find hunk containing line 45                         │      │
│  │     3. Count '+' lines within range (45-67)                 │      │
│  │     4. Return:                                               │      │
│  │        • lineRange: { start: 45, end: 67 } (for comment)     │      │
│  │        • relativeLines: [first '+', last '+'] (for display) │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Format Comment Body                                │      │
│  │                                                             │      │
│  │   Structure:                                                  │      │
│  │     ┌────────────────────────────────────────────────┐         │      │
│  │     │ **[CRITICAL]** security                │         │      │
│  │     │                                     │         │      │
│  │     │ {suggestionContent}                 │         │      │
│  │     │                                     │         │      │
│  │     │ **Action:** Fix the XSS...            │         │      │
│  │     │                                     │         │      │
│  │     │ ```javascript                          │         │      │
│  │     │ {improvedCode}                      │         │      │
│  │     │ ```                                  │         │      │
│  │     └────────────────────────────────────────────────┘         │      │
│  │                   │                                      │      │
│  │                   ▼                                      │      │
│  │     ┌────────────────────────────────────────────────┐         │      │
│  │     │ <details>                             │         │      │
│  │     │   <summary>🤖 Prompt for LLM</summary> │         │      │
│  │     │   ```text                               │         │      │
│  │     │   {llmPrompt}                         │         │      │
│  │     │   ```                                  │         │      │
│  │     │ </details>                            │         │      │
│  │     └────────────────────────────────────────────────┘         │      │
│  │                   │                                      │      │
│  │                   ▼                                      │      │
│  │     ┌────────────────────────────────────────────────┐         │      │
│  │     │ ---                                │         │      │
│  │     │ 💡 Powered by [Kodus AI](...) │         │      │
│  │     └────────────────────────────────────────────────┘         │      │
│  │                                                             │      │
│  │   Platform-specific formatting:                                  │      │
│  │     • GitHub: Markdown, collapse "Prompt" section           │      │
│  │     • GitLab: Markdown, no collapse                       │      │
│  │     • Bitbucket: Markdown, limited formatting                │      │
│  │     • Azure: Markdown, adapt to their API                    │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Create Platform Comment                               │      │
│  │                                                             │      │
│  │   For each suggestion:                                         │      │
│  │     • Call platform API (GitHub REST, GitLab GraphQL, etc.)   │      │
│  │     • Endpoint: POST /repos/{owner}/{repo}/pulls/{pr}/comments │      │
│  │     • Body: {                                                   │      │
│  │         path: suggestion.relevantFile,                      │      │
│  │         line: lineRange.start,                                 │      │
│  │         side: 'RIGHT' (on new code),                       │      │
│  │         body: formattedComment                                  │      │
│  │       }                                                         │      │
│  │     • Retry on failure (exponential backoff)                  │      │
│  │                                                             │      │
│  │   Batch creation (if API supports):                           │      │
│  │     • GitHub: Single POST per comment (rate limit)             │      │
│  │     • GitLab: Single POST per comment                           │      │
│  │     • Use concurrency limit (20)                             │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Save to PostgreSQL                                  │      │
│  │                                                             │      │
│  │   Table: suggestions                                           │      │
│  │     • id (UUID)                                               │      │
│  │     • pullRequestId (FK)                                     │      │
│  │     • relevantFile, relevantLinesStart, relevantLinesEnd        │      │
│  │     • suggestionContent, improvedCode, oneSentenceSummary         │      │
│  │     • label, severity, priority                               │      │
│  │     • llmPrompt (full prompt used)                       │      │
│  │     • deliveryStatus: DELIVERED | FAILED | REMOVED            │      │
│  │     • implementationStatus: NOT_IMPLEMENTED | IN_PROGRESS...       │      │
│  │     • createdAt, updatedAt                                   │      │
│  │                                                             │      │
│  │   Error handling:                                              │      │
│  │     • If API fails: deliveryStatus = FAILED                 │      │
│  │     • Record error in analytics_events                      │      │
│  │     • Retry in next job execution (if configured)           │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 数据模型关系图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                      │
│                                                                         │
│  organizations                                                      │
│    │ uuid PK                                                        │
│    │ name                                                            │
│    │ tenantName                                                      │
│    │ └─ teams (1:N)                                               │
│         │ uuid PK                                                      │
│         │ organizationId FK                                            │
│         │ └─ team_automations (1:N)                                │
│              │ uuid PK                                                │
│              │ teamId FK                                              │
│              │ automationId FK                                         │
│              │ status boolean                                            │
│                                                                         │
│  automations                                                        │
│    │ uuid PK                                                        │
│    │ type ENUM (AUTOMATION_CODE_REVIEW, ...)                        │
│    │ └─ team_automations                                            │
│                                                                         │
│  integrations (repository configs)                                     │
│    │ id PK                                                           │
│    │ configKey ENUM (REPOSITORIES, ...)                             │
│    │ configValue JSON (["repo-id"])                                 │
│    │ teamId FK                                                      │
│    │ platformType ENUM                                                │
│                                                                         │
│  pull_requests                                                     │
│    │ id PK                                                           │
│    │ number INT                                                      │
│    │ title TEXT                                                       │
│    │ state ENUM                                                       │
│    │ repositoryId VARCHAR                                              │
│    │ organizationId FK                                                │
│    │ teamId FK                                                       │
│    │ userId FK                                                       │
│    │ └─ suggestions (1:N)                                          │
│         │ id PK (UUID)                                            │
│         │ pullRequestId FK                                          │
│         │ relevantFile PATH                                          │
│         │ relevantLinesStart INT                                      │
│         │ relevantLinesEnd INT                                        │
│         │ suggestionContent TEXT                                       │
│         │ improvedCode TEXT                                           │
│         │ oneSentenceSummary TEXT                                     │
│         │ label ENUM                                                  │
│         │ severity ENUM                                               │
│         │ priority ENUM                                               │
│         │ deliveryStatus ENUM                                         │
│         │ implementationStatus ENUM                                    │
│         │ llmPrompt TEXT                                             │
│         │ createdAt, updatedAt                                         │
│         │ violatedKodyRulesIds JSON (["uuid", ...])                │
│         │ brokenKodyRulesIds JSON                                  │
│                                                                         │
│  kody_rules                                                        │
│    │ uuid PK                                                        │
│    │ title TEXT                                                      │
│    │ description TEXT                                                 │
│    │ rule TEXT                                                      │
│    │ repositoryId VARCHAR ('global' or specific repo)              │
│    │ scope ENUM                                                      │
│    │ language JSON (["typescript", "javascript"])                │
│    │ pathPattern TEXT                                                │
│    │ priority ENUM                                                   │
│    │ enabled BOOLEAN                                                   │
│    │ nonCompliantExamples JSON                                     │
│    │ compliantExamples JSON                                         │
│    │ contextReferenceId FK                                         │
│                                                                         │
│  code_review_executions                                             │
│    │ id PK                                                           │
│    │ pullRequestId FK                                              │
│    │ teamAutomationId FK                                            │
│    │ status ENUM (PENDING, RUNNING, COMPLETED, FAILED, SKIPPED)   │
│    │ startedAt                                                      │
│    │ finishedAt                                                     │
│    │ filesAnalyzed INT                                               │
│    │ suggestionsGenerated INT                                         │
│    │ suggestionsDelivered INT                                       │
│    │ tokensUsed INT                                                  │
│    │ error TEXT                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           MongoDB                                        │
│                                                                         │
│  suggestion_embedded (vector search for KodyFine-tuning)               │
│    │ suggestionId PK (FK to PostgreSQL)                         │
│    │ embedding ARRAY (float)                                        │
│    │ createdAt                                                     │
│                                                                         │
│  code_review_settings_log                                             │
│    │ id PK                                                          │
│    │ organizationId FK                                              │
│    │ teamId FK                                                       │
│    │ configChange JSON (before → after)                          │
│    │ changedBy FK                                                   │
│    │ changedAt                                                      │
│                                                                         │
│  analytics_events                                                   │
│    │ id PK                                                          │
│    │ organizationId FK                                              │
│    │ eventType ENUM (LLM_CALL, SUGGESTION_CREATED, ...)            │
│    │ metadata JSON                                                 │
│    │ timestamp                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 监控与可观测性流程

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    Observability Architecture                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         OpenTelemetry Tracing                             │      │
│  │                                                             │      │
│  │   Tracer Configuration:                                        │      │
│  │     • Service Name: "kodus-worker"                      │      │
│  │     • Exporter: OTLP (to observability backend)             │      │
│  │     • Sampling: 100% (production) / 10% (development)      │      │
│  │                                                             │      │
│  │   Span Naming:                                                │      │
│  │     • Service::Method: LLMAnalysisService::analyzeCodeWithAI   │      │
│  │     • Service::Stage: ProcessFilesReview::analyzeBatch         │      │
│  │     • Service::LLM: LLMAnalysisService::runPrompt            │      │
│  │                                                             │      │
│  │   Attributes:                                                 │      │
│  │     • organizationId                                           │      │
│  │     • teamId                                                 │      │
│  │     • pullRequestId                                          │      │
│  │     • repositoryId                                           │      │
│  │     • fileName                                               │      │
│  │     • language                                               │      │
│  │     • provider (GEMINI_2_5_PRO, DEEPSEEK_V3)            │      │
│  │     • mode (LIGHT, HEAVY)                                  │      │
│  │     • executionMode (BYOK, KODY)                             │      │
│  │     • filesCount                                             │      │
│  │     • suggestionsCount                                       │      │
│  │     • tokensUsed                                             │      │
│  │     • latency (ms)                                           │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Structured Logging (Pino)                            │      │
│  │                                                             │      │
│  │   Log Format:                                                 │      │
│  │     {                                                           │      │
│  │       "message": "Processing file batch",                   │      │
│  │       "context": "ProcessFilesReview",                       │      │
│  │       "metadata": {                                          │      │
│  │         "organizationAndTeamData": {...},                      │      │
│  │         "pullRequestNumber": 123,                            │      │
│  │         "batchIndex": 1,                                    │      │
│  │         "totalBatches": 5,                                 │      │
│  │         "filesInBatch": 25,                                 │      │
│  │         "estimatedTokens": 45000                            │      │
│  │       }                                                      │      │
│  │     }                                                          │      │
│  │                                                             │      │
│  │   Log Levels:                                                 │      │
│  │     • DEBUG: Detailed step-by-step information               │      │
│  │     • INFO: Key milestones and metrics                       │      │
│  │     • WARN: Unexpected but non-critical issues              │      │
│  │     • ERROR: Failures with stack traces                 │      │
│  │                                                             │      │
│  │   Output:                                                     │      │
│  │     • Development: Pretty JSON (API_LOG_PRETTY=true)      │      │
│  │     • Production: JSON lines (to log aggregation)         │      │
│  └────────────────┬───────────────────────────────────────────────┘      │
│                   │                                                       │
│                   ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐      │
│  │         Metrics Collection                                   │      │
│  │                                                             │      │
│  │   Key Metrics:                                               │      │
│  │     • code_review_latency_seconds (histogram)                 │      │
│  │     • llm_calls_total (counter)                              │      │
│  │     • llm_tokens_used_total (counter)                      │      │
│  │     • llm_errors_total (counter)                             │      │
│  │     • suggestions_created_total (counter)                   │      │
│  │     • suggestions_delivered_total (counter)                 │      │
│  │     • suggestions_implementation_rate (gauge)              │      │
│  │     • webhook_processing_latency_seconds (histogram)            │      │
│  │     • pipeline_failure_rate (gauge)                          │      │
│  │                                                             │      │
│  │   Labels (for filtering):                                     │      │
│  │     • organization_id                                          │      │
│  │     • team_id                                                │      │
│  │     • platform_type (GITHUB, GITLAB, ...)                  │      │
│  │     • provider (GEMINI, DEEPSEEK, ...)                    │      │
│  │     • language (typescript, javascript, ...)                   │      │
│  │     • severity (critical, high, medium, low)               │      │
│  │                                                             │      │
│  │   Export To:                                                   │      │
│  │     • Prometheus (via OTLP)                                │      │
│  │     • Grafana (visualization)                              │      │
│  │     • Sentry (error tracking)                                │      │
│  └──────────────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
