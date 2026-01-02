/**
 * Diff Processor - Core Algorithms
 * 
 * 核心算法实现，用于处理 unified diff 格式的 patch
 * 
 * 核心功能：
 * 1. handlePatchDeletions - 移除只包含删除的 hunks
 * 2. convertToHunksWithLinesNumbers - 转换为带行号的格式
 * 3. extractLinesFromDiffHunk - 提取修改的行范围
 * 
 * @module PatchProcessor
 */

import {
    PatchHunkHeader,
    ModifiedRange,
    LineWithNumber,
    PatchHunk,
    PatchProcessorOptions,
    PatchProcessorResult,
    Suggestion,
    SuggestionFilterOptions,
    PatchValidationResult,
    DiffStats,
    AnnotatedLine
} from './patch-processor.types';

// ============================================================================
// 常量
// ============================================================================

/**
 * Hunk Header 正则表达式
 * 
 * 格式: @@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ [optional_function_header]
 * 
 * 捕获组:
 * - $1: oldStart (旧文件的起始行号)
 * - $2: oldCount (旧文件的行数，可选)
 * - $3: newStart (新文件的起始行号)
 * - $4: newCount (新文件的行数，可选)
 * - $5: functionHeader (函数头或代码上下文描述，可选)
 */
const RE_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

/**
 * 带行号的 diff 行正则表达式
 * 
 * 格式: "123 +  const value = 1;" 或 "123  const value = 1;"
 * 
 * 捕获组:
 * - $1: lineNumber (绝对行号)
 * - $2: type ('+', '-', 或 ' ')
 * - $3: content (行内容)
 */
const RE_LINE_WITH_NUMBER = /^(\d+)\s+([+\- ])\s+(.*)$/;

/**
 * 标记: 新代码 hunk
 */
const MARKER_NEW_HUNK = '__new hunk__';

/**
 * 标记: 旧代码 hunk
 */
const MARKER_OLD_HUNK = '__old hunk__';

/**
 * 标记: 文件名头
 */
const MARKER_FILE_HEADER = '## file:';

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<PatchProcessorOptions> = {
    removeDeletionsOnly: true,
    addLineNumbers: true,
    ignoreNoNewlineMarker: true,
    contextLines: 3
};

// ============================================================================
// 算法 1: 移除只包含删除的 hunks
// ============================================================================

/**
 * 移除 patch 中只包含删除的 hunks
 * 
 * 算法:
 * 1. 遍历 patch 的每一行
 * 2. 检测 hunk header (@@ 开头）
 * 3. 累积每个 hunk 的所有行
 * 4. 检查 hunk 是否包含任何添加的行（'+' 开头）
 * 5. 只保留包含添加的 hunks
 * 
 * @param patch - 原始 patch 字符串
 * @param fileName - 文件名（用于日志）
 * @param editType - 编辑类型 ('added', 'modified', 'removed', etc.)
 * @returns 处理后的 patch，或 null（如果没有需要审查的代码）
 * 
 * @example
 * ```typescript
 * const cleanedPatch = handlePatchDeletions(
 *   `@@ -10,6 +10,7 @@
 *    const items = [];
 *   -const oldState = null;
 *   +const error = null;`,
 *   'src/index.js',
 *   'modified'
 * );
 * // 结果: 只保留第二个 hunk
 * ```
 */
export function handlePatchDeletions(
    patch: string,
    fileName: string,
    editType: string
): string | null {
    // 如果没有 patch 且不是修改/添加，返回 null
    if (!patch && editType !== 'modified' && editType !== 'added') {
        return null;
    }

    const patchLines = patch?.split('\n');
    const result = omitDeletionHunks(patchLines);

    // 如果内容没有变化，返回原 patch
    if (patch !== result) {
        return result;
    }

    return result || null;
}

/**
 * 移除只包含删除的 hunks（内部实现）
 * 
 * @param patchLines - patch 的所有行
 * @returns 只包含添加的 hunks
 */
function omitDeletionHunks(patchLines: string[]): string {
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;
    let insideHunk = false;

    for (const line of patchLines) {
        if (line.startsWith('@@')) {
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
                // 保存上一个 hunk（如果有添加）
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

// ============================================================================
// 算法 2: 转换为带行号的格式
// ============================================================================

/**
 * 将 unified diff patch 转换为带绝对行号的格式
 * 
 * 算法:
 * 1. 解析 hunk header，提取 oldStart 和 newStart
 * 2. 遍历 patch 的每一行
 * 3. 为新代码的每一行计算绝对行号: lineNumber = newStart + index
 * 4. 将行格式化为: "{lineNumber} {type} {content}"
 * 5. 分离新代码 (__new hunk__) 和旧代码 (__old hunk__)
 * 
 * 输出格式:
 * ```
 * ## file: 'src/index.js'
 * 
 * @@ -10,6 +10,7 @@ export function useData() {
 * __new hunk__
 * 10  const items = [];
 * 11 +const error = null;
 * 12  const [data] = useState();
 * __old hunk__
 * - const oldState = null;
 * ```
 * 
 * @param patch - unified diff 格式的 patch 字符串
 * @param file - 文件信息
 * @param options - 处理选项
 * @returns 带行号的 patch 字符串
 * 
 * @example
 * ```typescript
 * const formattedPatch = convertToHunksWithLinesNumbers(
 *   `@@ -10,6 +10,7 @@
 *    const items = [];
 *   +const error = null;`,
 *   { filename: 'src/index.js' }
 * );
 * ```
 */
export function convertToHunksWithLinesNumbers(
    patch: string,
    file: { filename?: string },
    options?: PatchProcessorOptions
): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let result = `\n\n${MARKER_FILE_HEADER} '${file.filename?.trim()}'\n`;
    
    const patchLines = patch.split('\n');
    
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
        // 忽略 "no newline at end of file" 标记
        if (opts.ignoreNoNewlineMarker &&
            line.toLowerCase().includes('no newline at end of file')) {
            continue;
        }

        if (line.startsWith('@@')) {
            headerLine = line;
            match = line.match(RE_HUNK_HEADER);

            // 如果有累积的行，处理它们
            if (match && (newContentLines.length > 0 || oldContentLines.length > 0)) {
                result += processHunk(
                    prevHeaderLine,
                    newContentLines,
                    oldContentLines,
                    start2
                );
                
                // 重置累积
                newContentLines = [];
                oldContentLines = [];
            }

            // 解析新的 hunk header
            if (match) {
                prevHeaderLine = headerLine;
                const res = match
                    .slice(1, 5)
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
    if (match && newContentLines.length > 0) {
        result += processHunk(
            headerLine,
            newContentLines,
            oldContentLines,
            start2
        );
    }

    return result.trim();
}

/**
 * 处理单个 hunk（内部实现）
 * 
 * @param headerLine - hunk header 行
 * @param newContentLines - 新代码行数组
 * @param oldContentLines - 旧代码行数组
 * @param start2 - 新代码的起始行号
 * @returns 处理后的 hunk 字符串
 */
function processHunk(
    headerLine: string,
    newContentLines: string[],
    oldContentLines: string[],
    start2: number
): string {
    let result = '';
    
    // 添加 header
    result += `\n${headerLine}\n`;
    
    // 添加新代码 hunk
    if (newContentLines.length > 0) {
        const isPlusLines = newContentLines.some((line) => line.startsWith('+'));
        if (isPlusLines) {
            result += `${MARKER_NEW_HUNK}\n`;
            for (let i = 0; i < newContentLines.length; i++) {
                // 计算绝对行号
                const lineNumber = start2 + i;
                result += `${lineNumber} ${newContentLines[i]}\n`;
            }
        }
    }
    
    // 添加旧代码 hunk
    if (oldContentLines.length > 0) {
        const isMinusLines = oldContentLines.some((line) => line.startsWith('-'));
        if (isMinusLines) {
            result += `${MARKER_OLD_HUNK}\n`;
            for (const lineOld of oldContentLines) {
                result += `${lineOld}\n`;
            }
        }
    }
    
    return result;
}

// ============================================================================
// 算法 3: 提取修改的行范围
// ============================================================================

/**
 * 从带行号的 diff hunk 中提取修改的行范围
 * 
 * 算法:
 * 1. 解析 hunk header，获取 newStart（新代码的起始行号）
 * 2. 遍历每一行，匹配带行号的格式
 * 3. 只处理添加的行（'+' 类型）
 * 4. 将连续的添加行合并为一个范围
 * 5. 返回所有修改范围的列表
 * 
 * 输入格式:
 * ```
 * @@ -10,6 +10,7 @@ export function useData() {
 * __new hunk__
 * 10  const items = [];
 * 11 +const error = null;
 * 12  const [data] = useState();
 * ```
 * 
 * 输出格式:
 * ```typescript
 * [
 *   { start: 11, end: 11 }  // 单行修改
 * ]
 * ```
 * 
 * @param diffHunk - 带行号的 diff hunk 字符串
 * @returns 修改范围列表
 * 
 * @example
 * ```typescript
 * const ranges = extractLinesFromDiffHunk(
 *   `@@ -10,6 +10,7 @@
 * __new hunk__
 * 10  const items = [];
 * 11 +const error = null;`
 * );
 * // 结果: [{ start: 11, end: 11 }]
 * ```
 */
export function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    const lines = diffHunk?.split('\n') || [];
    const modifiedRanges: ModifiedRange[] = [];

    let currentHunkStart = 0;
    let currentRange: ModifiedRange | null = null;

    for (const line of lines) {
        // 匹配 hunk header
        if (line?.startsWith('@@')) {
            const match = line?.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
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

        // 忽略标记行
        if (line?.includes(MARKER_NEW_HUNK) || line?.includes(MARKER_OLD_HUNK)) {
            continue;
        }

        // 匹配带行号的修改行: "123 +  const value = 1;"
        const lineMatch = line?.match(RE_LINE_WITH_NUMBER);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const changeType = lineMatch[2] as '+' | '-' | ' ';

            // 只处理添加的行
            if (changeType === '+') {
                if (!currentRange) {
                    // 创建新的 range
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber
                    };
                } else if (lineNumber === currentRange.end + 1) {
                    // 连续行，扩展 range
                    currentRange.end = lineNumber;
                } else {
                    // 不连续，关闭当前 range 并创建新的
                    modifiedRanges.push(currentRange);
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber
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

// ============================================================================
// 高级功能: 完整的 Patch 处理
// ============================================================================

/**
 * 完整的 patch 处理函数
 * 
 * 执行所有必要的处理步骤:
 * 1. 移除只包含删除的 hunks
 * 2. 转换为带行号的格式
 * 3. 提取修改范围
 * 4. 计算统计信息
 * 
 * @param patch - 原始 unified diff patch
 * @param fileName - 文件名
 * @param editType - 编辑类型
 * @param options - 处理选项
 * @returns 完整的处理结果
 */
export function processPatch(
    patch: string,
    fileName: string,
    editType: string,
    options?: PatchProcessorOptions
): PatchProcessorResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const result: PatchProcessorResult = {
        patch: '',
        modifiedRanges: [],
        hunks: [],
        stats: {
            totalHunks: 0,
            totalAdditions: 0,
            totalDeletions: 0,
            totalContextLines: 0,
            totalCharacters: 0,
            estimatedTokens: 0
        }
    };

    // 步骤 1: 移除只包含删除的 hunks
    if (opts.removeDeletionsOnly) {
        const cleanedPatch = handlePatchDeletions(patch, fileName, editType);
        if (!cleanedPatch) {
            return result;  // 没有需要审查的代码
        }
        patch = cleanedPatch;
    }

    // 步骤 2: 转换为带行号的格式
    const file = { filename: fileName };
    result.patch = opts.addLineNumbers 
        ? convertToHunksWithLinesNumbers(patch, file, opts)
        : patch;

    // 步骤 3: 提取修改范围
    if (opts.addLineNumbers) {
        result.modifiedRanges = extractLinesFromDiffHunk(result.patch);
    }

    // 步骤 4: 解析 hunks（如果添加了行号）
    if (opts.addLineNumbers) {
        result.hunks = parseHunks(result.patch);
    }

    // 步骤 5: 计算统计信息
    result.stats = calculatePatchStats(result.patch, result.hunks);

    return result;
}

/**
 * 解析 patch 中的所有 hunks（内部实现）
 */
function parseHunks(patchWithLinesStr: string): PatchHunk[] {
    const hunks: PatchHunk[] = [];
    const lines = patchWithLinesStr.split('\n');
    
    let currentHunk: PatchHunk | null = null;
    let inNewSection = false;
    let inOldSection = false;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            // 保存上一个 hunk
            if (currentHunk) {
                hunks.push(currentHunk);
            }
            
            // 解析 header
            const match = line.match(RE_HUNK_HEADER);
            const parsedHeader: PatchHunkHeader = match ? {
                oldStart: parseInt(match[1] || '0', 10),
                oldCount: parseInt(match[2] || '0', 10),
                newStart: parseInt(match[3] || '0', 10),
                newCount: parseInt(match[4] || '0', 10),
                functionHeader: match[5] || ''
            } : {
                oldStart: 0,
                oldCount: 0,
                newStart: 0,
                newCount: 0
            };
            
            currentHunk = {
                header: line,
                parsedHeader,
                newLines: [],
                oldLines: []
            };
            inNewSection = false;
            inOldSection = false;
        } else if (line.includes(MARKER_NEW_HUNK)) {
            inNewSection = true;
            inOldSection = false;
        } else if (line.includes(MARKER_OLD_HUNK)) {
            inNewSection = false;
            inOldSection = true;
        } else if (currentHunk) {
            const lineMatch = line.match(RE_LINE_WITH_NUMBER);
            if (lineMatch) {
                const lineNumber = parseInt(lineMatch[1], 10);
                const type = lineMatch[2] as '+' | '-' | ' ';
                const content = lineMatch[3];
                
                const lineWithNumber: LineWithNumber = {
                    lineNumber,
                    type,
                    content
                };
                
                if (inNewSection && type !== '-') {
                    currentHunk.newLines.push(lineWithNumber);
                } else if (inOldSection) {
                    currentHunk.oldLines.push(lineWithNumber);
                }
            }
        }
    }
    
    // 保存最后一个 hunk
    if (currentHunk) {
        hunks.push(currentHunk);
    }
    
    return hunks;
}

/**
 * 计算 patch 统计信息（内部实现）
 */
function calculatePatchStats(
    patch: string,
    hunks: PatchHunk[]
): PatchProcessorResult['stats'] {
    const stats: PatchProcessorResult['stats'] = {
        totalHunks: hunks.length,
        totalAdditions: 0,
        totalDeletions: 0,
        totalContextLines: 0,
        totalCharacters: patch.length,
        estimatedTokens: Math.ceil(patch.length / 4)  // 粗略估算: 每 4 字符 ≈ 1 token
    };
    
    for (const hunk of hunks) {
        stats.totalAdditions += hunk.newLines.filter(l => l.type === '+').length;
        stats.totalDeletions += hunk.oldLines.filter(l => l.type === '-').length;
        stats.totalContextLines += hunk.newLines.filter(l => l.type === ' ').length;
    }
    
    return stats;
}

// ============================================================================
// 辅助功能: 建议过滤
// ============================================================================

/**
 * 过滤建议，只保留在 diff 实际修改行范围内的建议
 * 
 * @param patchWithLinesStr - 带行号的 patch 字符串
 * @param suggestions - 建议列表
 * @param options - 过滤选项
 * @returns 过滤后的建议列表
 * 
 * @example
 * ```typescript
 * const filteredSuggestions = filterSuggestionsByDiff(
 *   formattedPatch,
 *   suggestions,
 *   { tolerance: 2 }
 * );
 * ```
 */
export function filterSuggestionsByDiff(
    patchWithLinesStr: string,
    suggestions: Suggestion[],
    options?: SuggestionFilterOptions
): Suggestion[] {
    const opts = { tolerance: 0, requireFullyInRange: false, ...options };
    const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);
    
    if (modifiedRanges.length === 0) {
        return [];  // 没有修改，返回空
    }
    
    return suggestions.filter((suggestion) => {
        const start = suggestion.relevantLinesStart;
        const end = suggestion.relevantLinesEnd;
        
        // 检查是否与任何修改范围重叠
        return modifiedRanges.some((range) => {
            return checkOverlap(
                { start, end },
                range,
                opts.tolerance,
                opts.requireFullyInRange
            );
        });
    });
}

/**
 * 检查两个范围是否重叠（内部实现）
 */
function checkOverlap(
    range1: { start: number; end: number },
    range2: { start: number; end: number },
    tolerance: number,
    requireFullyInRange: boolean
): boolean {
    if (requireFullyInRange) {
        // 要求范围 1 完全在范围 2 内（考虑误差）
        return (
            range1.start >= range2.start - tolerance &&
            range1.end <= range2.end + tolerance
        );
    } else {
        // 检查是否重叠（满足任一条件）
        return (
            // 范围 1 完全在范围 2 内
            (range1.start >= range2.start && range1.end <= range2.end) ||
            // 范围 1 的起始在范围 2 内
            (range1.start >= range2.start && range1.start <= range2.end) ||
            // 范围 1 的结束在范围 2 内
            (range1.end >= range2.start && range1.end <= range2.end) ||
            // 范围 2 完全在范围 1 内
            (range1.start <= range2.start && range1.end >= range2.end)
        );
    }
}

// ============================================================================
// 辅助功能: Patch 验证
// ============================================================================

/**
 * 验证 patch 格式是否有效
 * 
 * @param patch - patch 字符串
 * @returns 验证结果
 */
export function validatePatchFormat(patch: string): PatchValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查是否有 hunk header
    if (!/@@\s+-\d+/g.test(patch)) {
        errors.push('缺少 hunk header (@@ -X +Y @@)');
    }
    
    // 检查行号是否为正数
    const lineNumbers = patch.match(/^(\d+)\s+/gm);
    if (lineNumbers) {
        for (const ln of lineNumbers) {
            const num = parseInt(ln.trim(), 10);
            if (num <= 0) {
                errors.push(`无效的行号: ${num}`);
            }
        }
    }
    
    // 检查行号是否递增
    const lines = patch.split('\n');
    let lastLineNumber = 0;
    for (const line of lines) {
        const match = line.match(/^(\d+)\s+/);
        if (match) {
            const lineNumber = parseInt(match[1], 10);
            if (lineNumber <= lastLineNumber) {
                warnings.push(`行号未递增: ${lastLineNumber} -> ${lineNumber}`);
            }
            lastLineNumber = lineNumber;
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================================================
// 辅助功能: 统计分析
// ============================================================================

/**
 * 计算 diff 统计信息
 * 
 * @param patch - unified diff patch
 * @returns 统计信息
 */
export function calculateDiffStats(patch: string): DiffStats {
    const lines = patch.split('\n');
    let additions = 0;
    let deletions = 0;
    let modifications = 0;
    let files = 0;
    let hunks = 0;
    
    // 检查文件数（diff --git 开头的行）
    files = (patch.match(/^diff --git/gm) || []).length;
    
    for (const line of lines) {
        if (line.startsWith('@@')) {
            hunks++;
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }
    
    modifications = Math.min(additions, deletions);  // 修改行数 = min(添加, 删除)
    
    return {
        additions,
        deletions,
        modifications,
        files,
        hunks
    };
}

// ============================================================================
// 辅助功能: Patch 可视化
// ============================================================================

/**
 * 可视化 patch，标记修改范围
 * 
 * @param fileContent - 完整的文件内容
 * @param modifiedRanges - 修改范围列表
 * @returns 带注释的行列表
 * 
 * @example
 * ```typescript
 * const annotatedLines = visualizePatch(
 *   fileContent,
 *   modifiedRanges
 * );
 * // 输出: 带颜色标记的行
 * ```
 */
export function visualizePatch(
    fileContent: string,
    modifiedRanges: ModifiedRange[]
): AnnotatedLine[] {
    const lines = fileContent.split('\n');
    
    return lines.map((line, index) => {
        const lineNumber = index + 1;
        const inRange = modifiedRanges.some(r =>
            lineNumber >= r.start && lineNumber <= r.end
        );
        
        const annotatedLine: AnnotatedLine = {
            lineNumber,
            type: ' ',
            content: line,
            isModified: inRange,
            reason: inRange ? '在修改范围内' : ''
        };
        
        return annotatedLine;
    });
}

/**
 * 格式化 patch 为带颜色标记的字符串
 * 
 * @param annotatedLines - 带注释的行列表
 * @param useColors - 是否使用 ANSI 颜色（默认: true）
 * @returns 格式化的字符串
 */
export function formatAnnotatedPatch(
    annotatedLines: AnnotatedLine[],
    useColors: boolean = true
): string {
    return annotatedLines.map((line) => {
        const prefix = line.isModified ? '>>>' : '   ';
        const content = useColors && line.isModified
            ? `\x1b[32m${line.content}\x1b[0m`  // 绿色高亮
            : line.content;
        
        return `${prefix} ${line.lineNumber}: ${content}`;
    }).join('\n');
}

// ============================================================================
// 导出
// ============================================================================

export const PatchProcessor = {
    // 核心算法
    handlePatchDeletions,
    convertToHunksWithLinesNumbers,
    extractLinesFromDiffHunk,
    
    // 高级功能
    processPatch,
    
    // 辅助功能
    filterSuggestionsByDiff,
    validatePatchFormat,
    calculateDiffStats,
    visualizePatch,
    formatAnnotatedPatch
};

export default PatchProcessor;
