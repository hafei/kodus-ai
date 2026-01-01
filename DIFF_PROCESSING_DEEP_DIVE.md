# Kodus AI - Diff 处理深度解析

## 概述

本文档深入分析 Kodus AI Code Review 系统中的 diff 处理机制，包括：
- Unified Diff 格式解析
- 行号计算与映射
- Patch 优化与过滤
- 建议过滤逻辑
- 平台特定的 diff 处理

---

## 一、核心 Diff 处理工具

### 1.1 主要函数概览

**文件**：`/Users/sean/research/kodus-ai/libs/common/utils/patch.ts`

| 函数 | 功能 | 输入 | 输出 |
|------|------|------|------|
| `handlePatchDeletions` | 移除只包含删除的 hunk | patch, fileName, editType | patch \| null |
| `convertToHunksWithLinesNumbers` | 将 diff 转换为带行号的格式 | patch, file | string |
| `extractLinesFromDiffHunk` | 提取修改的行范围 | diffHunk | ModifiedRange[] |

### 1.2 Unified Diff 格式

Kodus 使用标准的 Unified Diff 格式：

```
diff --git a/src/index.js b/src/index.js
index 1234567..abcdefg 100644
--- a/src/index.js
+++ b/src/index.js
@@ -10,6 +10,7 @@ export function useData() {
   const items = [];
   const loading = false;
+  const error = null;
   const [data, setData] = useState(null);
```

**Hunk Header 格式**：
```
@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ [optional_function_header]
```

**正则表达式**：
```typescript
const RE_HUNK_HEADER =
    /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;
```

**匹配组**：
- `$1` - oldStart (旧文件的起始行号)
- `$2` - oldCount (旧文件的行数，可选)
- `$3` - newStart (新文件的起始行号)
- `$4` - newCount (新文件的行数，可选)
- `$5` - function header (可选)

---

## 二、Patch 优化：handlePatchDeletions

### 2.1 功能描述

移除只包含删除的 hunk，只保留有实际代码添加的部分。

**为什么需要这个？**
- 代码审查只关注新增的代码（`+` 行）
- 删除的代码（`-` 行）通常不需要审查
- 减少传递给 LLM 的 token 数量

### 2.2 实现细节

```typescript
export function handlePatchDeletions(
    patch: string,
    fileName: string,
    editType: string,
): string | null {
    // 如果没有 patch 且不是修改/添加，返回 null
    if (!patch && editType !== 'modified' && editType !== 'added') {
        return null;
    }

    const patchLines = patch?.split('\n');
    const patchNew = omitDeletionHunks(patchLines);

    // 如果内容没有变化，返回原 patch
    if (patch !== patchNew) {
        return patchNew;
    }

    return patch;
}
```

### 2.3 omitDeletionHunks 算法

```typescript
function omitDeletionHunks(patchLines: string[]): string {
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;      // 标记当前 hunk 是否有添加
    let insideHunk = false;    // 标记是否在 hunk 中

    const RE_HUNK_HEADER =
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

    for (const line of patchLines) {
        if (line.startsWith('@@')) {
            // 遇到新的 hunk header
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
                // 处理上一个 hunk
                if (insideHunk && addHunk) {
                    addedPatched.push(...tempHunk);
                    tempHunk.length = 0;
                    addHunk = false;
                }
                tempHunk.push(line);
                insideHunk = true;
            }
        } else {
            tempHunk.push(line);
            const editType = line.charAt(0);
            if (editType === '+') {
                // 发现添加的行，标记当前 hunk
                addHunk = true;
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

### 2.4 算法流程图

```
输入: patchLines[]
    ↓
遍历每一行
    ↓
┌─────────────────────────────────────────────┐
│ Line 以 '@@' 开头？                     │
├─────────────────────────────────────────────┤
│ Yes → 是 hunk header                    │
│       ├─ 保存上一个 hunk (如果有 +)    │
│       ├─ 重置 tempHunk                 │
│       ├─ 添加 header 到 tempHunk        │
│       └─ insideHunk = true           │
├─────────────────────────────────────────────┤
│ No  → 检查行类型                     │
│       ├─ 添加到 tempHunk              │
│       ├─ 如果 line.startsWith('+')    │
│       │      addHunk = true          │
│       └─ 否则，保持 addHunk 状态     │
└─────────────────────────────────────────────┘
    ↓
返回: 只包含有添加的 hunks
```

### 2.5 示例

**输入**：
```
@@ -10,6 +10,7 @@ export function useData() {
   const items = [];
   const loading = false;
-  const oldState = null;
   const [data, setData] = useState(null);

@@ -25,4 +25,6 @@ export function processData() {
-  const value = 0;
+  const value = 1;
+  const multiplier = 2;
```

**输出**（移除第一个 hunk，因为它只有删除）：
```
@@ -25,4 +25,6 @@ export function processData() {
-  const value = 0;
+  const value = 1;
+  const multiplier = 2;
```

---

## 三、行号转换：convertToHunksWithLinesNumbers

### 3.1 功能描述

将标准的 unified diff 格式转换为带有绝对行号的格式，并分离新代码和旧代码。

**为什么需要这个？**
- LLM 需要知道每一行的绝对文件行号
- 分离 `__new hunk__` 和 `__old hunk__` 便于审查
- 为建议生成提供精确的行号参考

### 3.2 输出格式

```typescript
## file: 'src/index.js'

@@ -10,6 +10,7 @@ export function useData() {
__new hunk__
10  const items = [];
11  const loading = false;
12 +const error = null;
13  const [data, setData] = useState(null);
14  const result = processData(data);
__old hunk__
- const oldState = null;
```

**关键标识符**：
- `__new hunk__` - 标记新代码块（包含 `+` 和上下文）
- `__old hunk__` - 标记旧代码块（包含 `-` 和上下文）
- `## file: 'filename'` - 文件名头

### 3.3 实现细节

```typescript
export function convertToHunksWithLinesNumbers(
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
    let start1 = -1,  // oldStart
        size1 = -1,   // oldCount
        start2 = -1,  // newStart
        size2 = -1;   // newCount
    let prevHeaderLine = '';
    let headerLine = '';

    for (const line of patchLines) {
        // 跳过 "no newline at end of file" 标记
        if (line.toLowerCase().includes('no newline at end of file')) {
            continue;
        }

        if (line.startsWith('@@')) {
            headerLine = line;
            match = line.match(RE_HUNK_HEADER);

            // 如果有累积的行，处理它们
            if (
                match &&
                (newContentLines.length > 0 || oldContentLines.length > 0)
            ) {
                // 添加 header
                if (prevHeaderLine) {
                    patchWithLinesStr += `\n${prevHeaderLine}\n`;
                }

                // 添加新代码 hunk
                if (newContentLines.length > 0) {
                    const isPlusLines = newContentLines.some(
                        (line) => line.startsWith('+')
                    );
                    if (isPlusLines) {
                        patchWithLinesStr =
                            patchWithLinesStr.trimEnd() + '\n__new hunk__\n';
                        // 为每一行添加绝对行号
                        for (let i = 0; i < newContentLines.length; i++) {
                            patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
                        }
                    }
                }

                // 添加旧代码 hunk
                if (oldContentLines.length > 0) {
                    const isMinusLines = oldContentLines.some(
                        (line) => line.startsWith('-')
                    );
                    if (isMinusLines) {
                        patchWithLinesStr =
                            patchWithLinesStr.trimEnd() + '\n__old hunk__\n';
                        for (const lineOld of oldContentLines) {
                            patchWithLinesStr += `${lineOld}\n`;
                        }
                    }
                }

                // 重置累积
                newContentLines = [];
                oldContentLines = [];
            }

            // 解析新 hunk header
            if (match) {
                prevHeaderLine = headerLine;
                const res = match
                    .slice(1, 5)  // 提取数字部分
                    .map((val) => parseInt(val || '0', 10));
                [start1, size1, start2, size2] = res;
            }
        } else if (line.startsWith('+')) {
            // 添加的行
            newContentLines.push(line);
        } else if (line.startsWith('-')) {
            // 删除的行
            oldContentLines.push(line);
        } else {
            // 上下文行（两边都有）
            newContentLines.push(line);
            oldContentLines.push(line);
        }
    }

    // 处理最后一个 hunk
    // ...（与上面的逻辑相同）

    return patchWithLinesStr.trim();
}
```

### 3.4 行号计算逻辑

**关键公式**：
```typescript
// 新代码的绝对行号 = hunk 中的索引 + hunk 的起始行号
absoluteLineNumber = start2 + i;

// 例如：
// @@ -10,6 +10,7 @@  → start2 = 10
// + line 1 (index 0) → 10 + 0 = 10
// + line 2 (index 1) → 10 + 1 = 11
// + line 3 (index 2) → 10 + 2 = 12
```

**示例**：

```
@@ -10,6 +10,7 @@ export function useData() {
  10  const items = [];           // 上下文行（在新旧代码中都有）
  11  const loading = false;      // 上下文行
- 12  const oldState = null;     // 只在旧代码中（删除）
  12 +const error = null;        // 只在新代码中（添加）→ start2 + 2 = 12
  13  const [data, setData] = useState(null);  // 上下文行
```

### 3.5 输出示例

**输入**：
```
diff --git a/src/index.js b/src/index.js
index 1234567..abcdefg 100644
--- a/src/index.js
+++ b/src/index.js
@@ -10,6 +10,7 @@ export function useData() {
   const items = [];
   const loading = false;
+  const error = null;
   const [data, setData] = useState(null);
```

**输出**：
```
## file: 'src/index.js'

@@ -10,6 +10,7 @@ export function useData() {
__new hunk__
10  const items = [];
11  const loading = false;
12 +const error = null;
13  const [data, setData] = useState(null);
__old hunk__
```

---

## 四、范围提取：extractLinesFromDiffHunk

### 4.1 功能描述

从带行号的 diff hunk 中提取修改的行范围，用于过滤建议。

**为什么需要这个？**
- 过滤掉不在修改范围内的建议
- 验证建议是否针对实际修改的代码
- 避免对未修改代码的误报

### 4.2 返回格式

```typescript
interface ModifiedRange {
    start: number;  // 修改范围的起始行号（绝对）
    end: number;    // 修改范围的结束行号（绝对）
}

// 示例
[
    { start: 10, end: 10 },   // 单行修改
    { start: 25, end: 28 },   // 多行连续修改
    { start: 40, end: 40 },   // 另一个单行修改
    { start: 55, end: 60 }    // 另一个多行修改
]
```

### 4.3 实现细节

```typescript
export function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    const lines = diffHunk?.split('\n');
    const modifiedRanges: ModifiedRange[] = [];

    let currentHunkStart = 0;
    let currentRange: ModifiedRange | null = null;

    for (const line of lines) {
        // 匹配 hunk header
        if (line?.startsWith('@@')) {
            const match = line?.match(
                /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/
            );
            if (match) {
                currentHunkStart = parseInt(match[1], 10);

                // 关闭上一个 range
                if (currentRange) {
                    modifiedRanges.push(currentRange);
                    currentRange = null;
                }
            }
            continue;
        }

        // 忽略 hunk 标记行
        if (line?.includes('__new hunk__') ||
            line?.includes('__old hunk__')) {
            continue;
        }

        // 匹配带行号的修改行：例如 "45 +  const value = 1;"
        const lineMatch = line?.match(/^(\d+) ([+-])/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const changeType = lineMatch[2];

            // 只处理添加的行（代码审查关注新代码）
            if (changeType === '+') {
                if (!currentRange) {
                    // 创建新的 range
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

    // 关闭最后一个未处理的 range
    if (currentRange) {
        modifiedRanges.push(currentRange);
    }

    return modifiedRanges;
}
```

### 4.4 算法流程图

```
输入: diffHunk (带行号的 diff)
    ↓
遍历每一行
    ↓
┌─────────────────────────────────────────────┐
│ Line 以 '@@' 开头？                     │
├─────────────────────────────────────────────┤
│ Yes → 是 hunk header                    │
│       ├─ 提取 currentHunkStart         │
│       ├─ 关闭上一个 range              │
│       └─ 继续                             │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Line 包含 '__new hunk__' 或            │
│ '__old hunk__'？                         │
├─────────────────────────────────────────────┤
│ Yes → 跳过                               │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Line 匹配 /^(\d+) ([+-])$/？          │
├─────────────────────────────────────────────┤
│ Yes → 是带行号的修改行                 │
│       ├─ 提取 lineNumber 和 changeType  │
│       ├─ 如果 changeType === '+'          │
│       │      ├─ 如果没有 currentRange  │
│       │      │      创建新 range       │
│       │      ├─ 如果是连续行         │
│       │      │      扩展 range.end   │
│       │      └─ 否则                  │
│       │             关闭旧 range      │
│       │             创建新 range       │
│       └─ 否则（changeType === '-'）│
│              不处理（只关注 + 行）  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 其他行（上下文）                     │
├─────────────────────────────────────────────┤
│ 关闭当前 range                         │
└─────────────────────────────────────────────┘
    ↓
返回: modifiedRanges[]
```

### 4.5 示例

**输入**：
```
@@ -10,6 +10,7 @@ export function useData() {
__new hunk__
10  const items = [];
11  const loading = false;
12 +const error = null;
13  const [data, setData] = useState(null);

@@ -25,4 +25,6 @@ export function processData() {
__new hunk__
25  const value = 0;
26 +const multiplier = 2;
27 +const result = value * multiplier;
28 +export default processData;
```

**输出**：
```json
[
    { "start": 12, "end": 12 },   // 第一 hunk 的修改
    { "start": 26, "end": 28 }    // 第二 hunk 的修改（连续三行）
]
```

### 4.6 处理复杂场景

#### 场景 1：分散的单行修改

```
输入：
10  const name = 'John';
11 +const email = 'john@example.com';
12  const age = 30;
13 +const phone = '123-456-7890';
14  const active = true;

输出：
[
    { "start": 11, "end": 11 },
    { "start": 13, "end": 13 }
]
```

#### 场景 2：连续的多行修改

```
输入：
45  interface User {
46    id: string;
47 +  description: string;
48 +  labels: string[];
49    created_at: string;
50  }

输出：
[
    { "start": 47, "end": 48 }
]
```

#### 场景 3：混合修改（添加和删除）

```
输入：
20  function calculateTotal() {
21    const items = [
22 -    { id: 1, price: 10 },
23 +    { id: 1, price: 10.50 },
24      { id: 2, price: 20 }
25    ];

输出：
[
    { "start": 23, "end": 23 }  // 只有添加的行被记录
]
```

---

## 五、建议过滤：filterSuggestionsCodeDiff

### 5.1 功能描述

过滤建议，只保留那些在 diff 实际修改行范围内的建议。

**为什么需要这个？**
- LLM 可能会建议修改 diff 之外的代码
- 确保建议只针对实际修改的代码
- 提高建议的相关性和准确性

### 5.2 实现细节

```typescript
export class SuggestionService {
    public filterSuggestionsCodeDiff(
        patchWithLinesStr: string,
        codeSuggestions: Partial<CodeSuggestion>[],
    ) {
        // 1. 提取修改范围
        const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);

        // 2. 过滤建议
        return codeSuggestions?.filter((suggestion) => {
            return modifiedRanges.some((range) => {
                // 检查建议是否与修改范围有任何重叠
                return (
                    // 建议完全在范围内
                    (suggestion?.relevantLinesStart >= range.start &&
                        suggestion?.relevantLinesStart <= range.end) ||
                    // 建议的起始在范围内
                    (suggestion?.relevantLinesStart >= range.start &&
                        suggestion?.relevantLinesStart <= range.end) ||
                    // 建议的结束在范围内
                    (suggestion?.relevantLinesEnd >= range.start &&
                        suggestion?.relevantLinesEnd <= range.end) ||
                    // 范围完全在建议内
                    (suggestion?.relevantLinesStart <= range.start &&
                        suggestion?.relevantLinesEnd >= range.end)
                );
            });
        });
    }
}
```

### 5.3 过滤逻辑

**匹配条件（满足任一即可）**：

1. **建议完全在范围内**
   ```typescript
   suggestion.start >= range.start && suggestion.start <= range.end
   ```

2. **建议的起始在范围内**
   ```typescript
   suggestion.start >= range.start && suggestion.start <= range.end
   ```

3. **建议的结束在范围内**
   ```typescript
   suggestion.end >= range.start && suggestion.end <= range.end
   ```

4. **范围完全在建议内**
   ```typescript
   suggestion.start <= range.start && suggestion.end >= range.end
   ```

### 5.4 示例

**Diff 修改范围**：
```
[
    { start: 10, end: 15 },  // 修改范围 1
    { start: 25, end: 30 }   // 修改范围 2
]
```

**建议过滤**：

| 建议行范围 | 是否保留 | 原因 |
|------------|---------|------|
| { start: 5, end: 8 } | ❌ 不在修改范围内 |
| { start: 12, end: 14 } | ✅ 在修改范围 1 内 |
| { start: 20, end: 22 } | ❌ 不在修改范围内 |
| { start: 28, end: 29 } | ✅ 在修改范围 2 内 |
| { start: 8, end: 18 } | ✅ 与修改范围 1 重叠 |
| { start: 1, end: 35 } | ✅ 覆盖所有修改范围 |

---

## 六、Azure Repos 特殊处理

### 6.1 为什么需要特殊处理？

Azure DevOps API 在某些情况下不提供标准的 diff patch，需要手动生成。

**API 限制**：
- 某些文件类型的 patch 可能不完整
- 大文件变更可能导致 patch 被截断
- 二进制文件不支持 diff

### 6.2 手动 Patch 生成

**函数**：`_generateFileDiffForAzure`

```typescript
private async _generateFileDiffForAzure(params: {
    orgName: string;
    token: string;
    projectId: string;
    repositoryId: string;
    filePath: string;
    baseCommitId: string | null;
    targetCommitId: string;
    changeType: string;
}): Promise<{
    filename: string;
    sha: string;
    status: FileChange['status'];
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
    content: string;
} | null> {
    const {
        orgName,
        token,
        projectId,
        repositoryId,
        filePath,
        baseCommitId,
        targetCommitId,
        changeType,
    } = params;

    let originalFileContent = '';
    let modifiedFileContent = '';
    let patch = '';
    let additions = 0;
    let deletions = 0;

    const status = this.azureReposRequestHelper.mapAzureStatusToFileChangeStatus(
        changeType
    );

    try {
        // 1. 获取原始文件内容（如果不是新增文件）
        if (status !== 'added' && baseCommitId) {
            const originalFile =
                await this.azureReposRequestHelper.getFileContent({
                    orgName,
                    token,
                    projectId,
                    repositoryId,
                    filePath,
                    commitId: baseCommitId,
                });
            originalFileContent = originalFile.content;
        }

        // 2. 获取修改后的文件内容（如果不是删除的文件）
        if (status !== 'removed') {
            const modifiedFile =
                await this.azureReposRequestHelper.getFileContent({
                    orgName,
                    token,
                    projectId,
                    repositoryId,
                    filePath,
                    commitId: targetCommitId,
                });
            modifiedFileContent = modifiedFile.content;
        }

        // 3. 使用 diff 库生成 unified diff
        if (originalFileContent || modifiedFileContent) {
            patch = createTwoFilesPatch(
                status === 'renamed' ? params.filePath : filePath,
                filePath,
                originalFileContent,
                modifiedFileContent,
                baseCommitId ?? '',
                targetCommitId,
                { context: 3 }  // 显示 3 行上下文
            );

            // 4. 计算添加和删除的行数
            const diffLines = patch.split('\n');
            additions = diffLines.filter(
                (line) => line.startsWith('+') && !line.startsWith('+++')
            ).length;
            deletions = diffLines.filter(
                (line) => line.startsWith('-') && !line.startsWith('---')
            ).length;
        } else if (status === 'removed') {
            // 删除的文件
            patch = `--- a/${filePath}\n+++ /dev/null\n File deleted`;
        } else if (status === 'added') {
            // 新增的文件
            patch = `--- /dev/null\n+++ b/${filePath}\n File added`;
        }

        return {
            filename: filePath,
            sha: targetCommitId,
            status,
            additions,
            deletions,
            changes: additions + deletions,
            patch,
            content: modifiedFileContent,
        };
    } catch (error: any) {
        this.logger.error({
            message: `Error generating diff for file "${filePath}"`,
            context: this._generateFileDiffForAzure.name,
            error,
            metadata: { filePath, baseCommitId, targetCommitId },
        });
        return null;
    }
}
```

### 6.3 使用 diff 库

**导入**：
```typescript
import { createTwoFilesPatch } from 'diff';
```

**createTwoFilesPatch 参数**：
```typescript
createTwoFilesPatch(
    oldFileName: string,          // 旧文件名（或路径）
    newFileName: string,          // 新文件名
    oldContent: string,           // 旧文件内容
    newContent: string,           // 新文件内容
    oldHeader: string,           // 旧文件标识（通常是 commit SHA）
    newHeader: string,           // 新文件标识
    options?: {
        context?: number;         // 上下文行数（默认 3）
        ignoreWhitespace?: boolean; // 是否忽略空白
    }
): string  // 返回 unified diff 字符串
```

### 6.4 统计提取

**函数**：`extractDiffStatsFromPatch`

```typescript
private extractDiffStatsFromPatch(patch: string): {
    additions: number;
    deletions: number;
    patch: string;
} {
    const lines = patch.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
        // 添加的行（不包括 +++ header）
        if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        }
        // 删除的行（不包括 --- header）
        else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }

    return {
        additions,
        deletions,
        patch,
    };
}
```

### 6.5 Azure 使用场景

```typescript
// 场景 1：获取 PR 的变更文件
const files = await this.getFilesByPullRequestId({
    organizationAndTeamData,
    repository: { id, name },
    pullRequestId
});

// 场景 2：获取自上次 commit 以来的变更文件
const filesSinceCommit = await this.getChangedFilesSinceLastCommit({
    organizationAndTeamData,
    repository,
    lastCommit
});
```

---

## 七、Diff 处理流程

### 7.1 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 平台 API 获取 Patch                              │
│                                                             │
│ GitHub:   直接提供 patch                              │
│ GitLab:  直接提供 diff                                │
│ Bitbucket: 直接提供 diff                             │
│ Azure:   可能需要手动生成                           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 原始 Patch 数据                                  │
│                                                             │
│ {                                                           │
│   filename: 'src/index.js',                           │
│   patch: 'diff --git a/src/index.js...',       │
│   status: 'modified'                                │
│ }                                                           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. handlePatchDeletions()                           │
│                                                             │
│ 移除只包含删除的 hunks                               │
│ 减少传递给 LLM 的 token                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. convertToHunksWithLinesNumbers()               │
│                                                             │
│ 添加绝对行号                                           │
│ 分离 __new hunk__ 和 __old hunk__                   │
│                                                             │
│ 输出：                                                      │
│ ## file: 'src/index.js'                             │
│ @@ -10,6 +10,7 @@ ...                             │
│ __new hunk__                                         │
│ 10  const items = [];                              │
│ 11 +const error = null;                            │
│ 12  const [data] = useState();                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. LLM Analysis                                       │
│                                                             │
│ 发送 patchWithLinesStr 到 LLM                         │
│ LLM 返回建议 (带 relevantLinesStart/End)       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. extractLinesFromDiffHunk()                    │
│                                                             │
│ 从 patch 提取修改范围                             │
│ 返回: [{ start: 11, end: 11 }, ...]        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. filterSuggestionsCodeDiff()                    │
│                                                             │
│ 过滤建议，只保留在修改范围内的                 │
│ 提高建议的相关性                                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. 创建 Line Comments                                │
│                                                             │
│ 使用过滤后的建议                                      │
│ 计算精确的 line ranges                            │
│ 发布到平台                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 数据流

```
Platform API
    ↓
Raw FileChange[]
    ├─ filename
    ├─ patch (unified diff)
    ├─ status
    └─ sha
    ↓
handlePatchDeletions()
    ↓
Filtered FileChange[]
    ├─ patch (only with additions)
    └─ ...
    ↓
convertToHunksWithLinesNumbers()
    ↓
FileChange with patchWithLinesStr
    ├─ patch (unified diff)
    ├─ patchWithLinesStr (with line numbers)
    └─ ...
    ↓
LLM Analysis
    ↓
CodeSuggestions[]
    ├─ relevantLinesStart (absolute)
    ├─ relevantLinesEnd (absolute)
    └─ ...
    ↓
extractLinesFromDiffHunk()
    ↓
ModifiedRange[]
    └─ [{ start, end }, ...]
    ↓
filterSuggestionsCodeDiff()
    ↓
Filtered CodeSuggestions[]
    └─ only within modified ranges
    ↓
Create Comments
```

---

## 八、测试用例

### 8.1 单行修改测试

```typescript
describe('extractLinesFromDiffHunk', () => {
    it('should extract single line modifications', () => {
        const diff = `@@ -37,6 +37,7 @@ export function useData() {
__new hunk__
37              pull_number: number;
38              repository: string;
39              title: string;
40 +            url: string;
41          }[]
      }(CODE_MANAGEMENT_API_PATHS.GET_ONBOARDING_PULL_REQUESTS, {
          params: { teamId }`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([
            { start: 40, end: 40 }, // Addition of url field
        ]);
    });
});
```

### 8.2 多行连续修改测试

```typescript
it('should handle consecutive line additions', () => {
    const diff = `@@ -45,6 +45,9 @@ interface PullRequestData {
__new hunk__
45    repository: string;
46    title: string;
47 +  description: string;
48 +  labels: string[];
49    status: 'open' | 'closed';
50    created_at: string;`;

    const result = extractLinesFromDiffHunk(diff);
    expect(result).toEqual([
        { start: 47, end: 49 }, // Three consecutive lines added
    ]);
});
```

### 8.3 大文件分散修改测试

```typescript
it('should handle large file with multiple scattered changes', () => {
    const diff = `@@ -10,7 +10,7 @@ import { DotLoader } from "@components/ui/dot-loader";
__new hunk__
10  import { FormControl } from "@components/ui/form-control";
11  import { Heading } from "@components/ui/heading";
12 -import { SvgKody } from "@components/ui/icons/SvgKody";
13 +import { SvgKody, SvgLogo } from "@components/ui/icons";
14  import { Page } from "@components/ui/page";
15  import { Popover } from "@components/ui/popover";
16  import { useToast } from "@components/ui/toast";

@@ -45,12 +45,14 @@ interface PullRequestData {
__new hunk__
45    repository: string;
46    title: string;
47 +  description: string;
48 +  labels: string[];
49    created_at: string;
50    updated_at: string;
51 -  status: 'open' | 'closed';
52 +  status: 'open' | 'closed' | 'merged';
53    assignees: {
54      id: number;
55      login: string;
56 +    avatar_url: string;
57    }[]`;

    const result = extractLinesFromDiffHunk(diff);
    expect(result).toEqual([
        { start: 13, end: 13 },  // Change in import
        { start: 47, end: 48 },  // Addition of fields
        { start: 52, end: 52 },  // Change in status
        { start: 56, end: 56 },  // Addition of avatar_url
    ]);
});
```

### 8.4 新文件添加测试

```typescript
it('should handle new file additions', () => {
    const diff = `@@ -0,0 +1,5 @@
__new hunk__
1 +export interface Config {
2 +  name: string;
3 +  version: string;
4 +  description: string;
5 +}`;

    const result = extractLinesFromDiffHunk(diff);
    expect(result).toEqual([
        { start: 1, end: 5 }, // All lines are new
    ]);
});
```

### 8.5 大删除测试

```typescript
it('should handle large deletions', () => {
    const diff = `@@ -150,25 +150,0 @@ export class UserController {
__new hunk__
150 -  @Delete(':id')
151 -  @UseGuards(AdminGuard)
152 -  async remove(@Param('id') id: string) {
153 -    try {
154 -      await this.userService.remove(id);
155 -      return {
156 -        message: 'User deleted successfully',
157 -      };
158 -    } catch (error) {
159 -      if (error instanceof NotFoundException) {
160 -        throw new NotFoundException(error.message);
161 -      }

162 -      if (error instanceof ForbiddenException) {
163 -        throw new ForbiddenException(error.message);
164 -      }

165 -      this.logger.error(\`Failed to delete user \${id}: \${error.message}\`);
166 -      throw new InternalServerErrorException(
167 -        'An error occurred while deleting the user'
168 -      );
169 -    }
170 -}`;

    const result = extractLinesFromDiffHunk(diff);
    expect(result).toEqual([]); // No additions
});
```

---

## 九、性能优化

### 9.1 Token 优化

**策略**：
1. **删除-only hunks 过滤**：减少约 30-50% 的 token
2. **上下文行限制**：默认 3 行（可通过 diff 库配置）
3. **文件大小限制**：超过限制的文件只包含相关部分

**示例**：
```
原始 patch: 10,000 tokens
handlePatchDeletions: 7,000 tokens (减少 30%)
convertToHunksWithLinesNumbers: 7,200 tokens (添加行号)
```

### 9.2 处理优化

**批处理**：
- 使用 `p-limit` 控制并发（默认 20）
- 避免同时处理过多文件

**缓存**：
- 缓存相同 commit 之间的 diff 结果
- 避免重复计算修改范围

### 9.3 内存优化

**流式处理**：
- 逐行处理，避免一次性加载大文件
- 及时释放不需要的数据

---

## 十、常见问题与解决方案

### 10.1 问题：行号不正确

**原因**：
- Hunk header 解析错误
- 行号计算逻辑错误
- 文件编码问题

**解决方案**：
```typescript
// 添加调试日志
if (line.startsWith('@@')) {
    this.logger.debug({
        message: 'Hunk header parsed',
        header: line,
        match: match,
        start2: start2
    });
}
```

### 10.2 问题：建议被错误过滤

**原因**：
- 范围计算错误
- 建议行号不准确
- 边界条件处理不当

**解决方案**：
```typescript
// 更宽松的过滤条件（允许一定的误差）
const TOLERANCE = 2;  // 允许 2 行误差

return modifiedRanges.some((range) => {
    const suggestionStart = suggestion?.relevantLinesStart;
    const suggestionEnd = suggestion?.relevantLinesEnd;

    return (
        suggestionStart >= range.start - TOLERANCE &&
        suggestionEnd <= range.end + TOLERANCE
    );
});
```

### 10.3 问题：Azure Repos patch 为空

**原因**：
- API 不提供 patch
- 文件类型不支持 diff
- 文件过大被截断

**解决方案**：
```typescript
// 手动生成 patch
if (!patch || patch.trim() === '') {
    const result = await this._generateFileDiffForAzure({
        orgName,
        token,
        projectId,
        repositoryId,
        filePath,
        baseCommitId,
        targetCommitId,
        changeType,
    });

    if (result) {
        patch = result.patch;
    }
}
```

### 10.4 问题：特殊字符处理

**原因**：
- Unicode 字符
- 特殊空白字符
- Windows/Unix 换行符差异

**解决方案**：
```typescript
// 标准化行结束符
function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// 处理特殊字符
function escapeSpecialChars(text: string): string {
    return text.replace(/[\x00-\x1F\x7F]/g, (char) => {
        return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    });
}
```

---

## 十一、最佳实践

### 11.1 Diff 处理最佳实践

1. **始终使用统一 diff 格式**
   ```typescript
   import { createTwoFilesPatch } from 'diff';
   ```

2. **验证行号准确性**
   ```typescript
   expect(relevantLinesStart).toBeGreaterThanOrEqual(0);
   expect(relevantLinesStart).toBeLessThanOrEqual(relevantLinesEnd);
   ```

3. **处理边界情况**
   ```typescript
   // 空文件
   if (!patch || patch.trim() === '') {
       return null;
   }

   // 新增文件
   if (status === 'added') {
       baseCommitId = null;
   }
   ```

4. **添加详细日志**
   ```typescript
   this.logger.debug({
       message: 'Patch processing started',
       filename,
       patchLines: patch.split('\n').length,
       hunks: patch.split('@@').length - 1
   });
   ```

### 11.2 性能优化最佳实践

1. **使用批处理**
   ```typescript
   const limit = pLimit(20);
   const results = await Promise.all(
       files.map(file => limit(() => processFile(file)))
   );
   ```

2. **尽早过滤**
   ```typescript
   // 在获取内容之前过滤文件
   const relevantFiles = files.filter(file =>
       !file.status || file.status !== 'removed'
   );
   ```

3. **避免重复处理**
   ```typescript
   // 使用 Map 缓存处理结果
   const cache = new Map<string, ModifiedRange[]>();

   function getCachedRanges(patch: string) {
       if (!cache.has(patch)) {
           cache.set(patch, extractLinesFromDiffHunk(patch));
       }
       return cache.get(patch);
   }
   ```

### 11.3 测试最佳实践

1. **覆盖所有场景**
   ```typescript
   describe('extractLinesFromDiffHunk', () => {
       it('single line modification');
       it('multiple consecutive lines');
       it('scattered changes');
       it('new file');
       it('file deletion');
       it('complex refactoring');
   });
   ```

2. **使用真实 diff 样例**
   ```typescript
   const realDiff = `@@ -10,7 +10,7 @@
   import { Component } from '@angular/core';
   -import { OldService } from './old.service';
   +import { NewService } from './new.service';
   `;
   ```

3. **验证边界条件**
   ```typescript
   it('should handle empty diff', () => {
       expect(extractLinesFromDiffHunk('')).toEqual([]);
   });

   it('should handle single line file', () => {
       expect(extractLinesFromDiffHunk('1 +const x = 1;')).toEqual([
           { start: 1, end: 1 }
       ]);
   });
   ```

---

## 十二、未来改进方向

### 12.1 改进点

1. **增量 Diff 处理**
   - 当前：每次处理完整 diff
   - 改进：只处理新增的 hunks
   - 优势：减少处理时间和 token

2. **智能上下文选择**
   - 当前：固定 3 行上下文
   - 改进：根据代码复杂度动态调整
   - 优势：更相关的上下文，更准确的建议

3. **二进制 Diff 支持**
   - 当前：不支持二进制文件
   - 改进：使用特殊的 diff 格式
   - 优势：支持图片、字体等文件

4. **Diff 可视化**
   - 当前：纯文本格式
   - 改进：HTML/Markdown 可视化
   - 优势：更易读的 diff

### 12.2 性能优化

1. **并行处理**
   ```typescript
   // 使用 Worker Threads
   const worker = new Worker('./diff-processor.js');
   worker.postMessage({ patch, file });
   ```

2. **WebAssembly**
   ```typescript
   // 使用 WASM 加速 diff 计算
   import diffWasm from 'diff.wasm';
   ```

3. **GPU 加速**
   ```typescript
   // 使用 GPU 进行大规模 diff 处理
   // 适用于包含大量文件的 PR
   ```

---

## 附录：关键文件索引

| 文件路径 | 功能描述 |
|----------|----------|
| `libs/common/utils/patch.ts` | 核心 diff 处理工具 |
| `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts` | 文件获取与 diff 准备 |
| `libs/code-review/infrastructure/adapters/services/suggestion.service.ts` | 建议过滤 |
| `libs/platform/infrastructure/adapters/services/github/github.service.ts` | GitHub 集成 |
| `libs/platform/infrastructure/adapters/services/gitlab.service.ts` | GitLab 集成 |
| `libs/platform/infrastructure/adapters/services/bitbucket.service.ts` | Bitbucket 集成 |
| `libs/platform/infrastructure/adapters/services/azureRepos/azureRepos.service.ts` | Azure Repos 集成 |
| `test/unit/shared/utils/patch.spec.ts` | diff 处理测试 |

---

## 总结

Kodus AI 的 diff 处理机制是其代码审查系统的核心组件之一。通过精心设计的 diff 解析、行号计算和范围提取算法，系统能够：

1. **高效处理** - 过滤无关内容，减少 LLM token 消耗
2. **精确定位** - 为建议提供准确的行号参考
3. **智能过滤** - 确保建议只针对实际修改的代码
4. **跨平台兼容** - 支持主流代码托管平台的 diff 格式

这些功能共同确保了代码审查的准确性、相关性和效率。
