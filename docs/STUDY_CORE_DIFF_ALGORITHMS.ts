/**
 * ============================================================================
 * Kodus AI - Diff 处理核心算法（学习版）
 * ============================================================================
 * 
 * 本文件包含 Kodus AI Code Review 系统中 diff 处理的所有核心算法
 * 这些算法被独立提取出来，用于学习和理解
 * 
 * 核心功能：
 * 1. handlePatchDeletions - 移除只包含删除的 hunks
 * 2. convertToHunksWithLinesNumbers - 转换为带行号的格式
 * 3. extractLinesFromDiffHunk - 提取修改的行范围
 * 
 * 使用方法：
 * ```typescript
 * // 导入所有功能
 * import { PatchProcessor } from './STUDY_CORE_DIFF_ALGORITHMS';
 * 
 * // 或者单独导入
 * import { 
 *   handlePatchDeletions,
 *   convertToHunksWithLinesNumbers,
 *   extractLinesFromDiffHunk
 * } from './STUDY_CORE_DIFF_ALGORITHMS';
 * ```
 * 
 * @author Kodus AI Research
 * @version 1.0.0
 */

// ============================================================================
// 第一部分：类型定义
// ============================================================================

/**
 * 修改的范围
 * 
 * 表示一个连续的修改区域
 * 
 * @example
 * // 第 10-12 行被修改
 * { start: 10, end: 12 }
 */
export interface ModifiedRange {
    /** 修改范围的起始行号（绝对） */
    start: number;
    /** 修改范围的结束行号（绝对） */
    end: number;
}

/**
 * Patch Hunk Header 解析结果
 * 
 * 解析 unified diff 格式的 hunk header
 * 
 * @example
 * // Input: "@@ -10,6 +10,7 @@ export function useData() {"
 * // Output:
 * {
 *   oldStart: 10,
 *   oldCount: 6,
 *   newStart: 10,
 *   newCount: 7,
 *   functionHeader: "export function useData() {"
 * }
 */
export interface PatchHunkHeader {
    /** 旧文件的起始行号 */
    oldStart: number;
    /** 旧文件的行数 */
    oldCount: number;
    /** 新文件的起始行号 */
    newStart: number;
    /** 新文件的行数 */
    newCount: number;
    /** 可选：函数头或代码上下文描述 */
    functionHeader?: string;
}

/**
 * 带行号的 diff 行
 * 
 * 格式: "123 +  const value = 1;" 或 "123  const value = 1;"
 */
export interface LineWithNumber {
    /** 绝对行号 */
    lineNumber: number;
    /** 行类型: '+', '-', ' ' (上下文） */
    type: '+' | '-' | ' ';
    /** 行内容（不含行号和类型标记） */
    content: string;
}

/**
 * 建议定义
 * 
 * 用于过滤建议
 */
export interface Suggestion {
    /** 建议的唯一标识 */
    id: string;
    /** 建议的起始行号（绝对） */
    relevantLinesStart: number;
    /** 建议的结束行号（绝对） */
    relevantLinesEnd: number;
    /** 建议标签 */
    label: string;
}

// ============================================================================
// 第二部分：常量定义
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
 * 
 * @example
 * // 匹配: "@@ -10,6 +10,7 @@ export function useData() {"
 * // 结果: ["-10", "6", "+10", "7", "export function useData() {"]
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
 * 
 * @example
 * // 匹配: "123 +  const value = 1;"
 * // 结果: ["123", "+", "const value = 1;"]
 */
const RE_LINE_WITH_NUMBER = /^(\d+)\s+([+\- ])\s+(.*)$/;

/**
 * 标记: 新代码 hunk
 * 
 * 用于标记新代码块的开始
 */
const MARKER_NEW_HUNK = '__new hunk__';

/**
 * 标记: 旧代码 hunk
 * 
 * 用于标记旧代码块的开始
 */
const MARKER_OLD_HUNK = '__old hunk__';

// ============================================================================
// 第三部分：算法 1 - handlePatchDeletions
// ============================================================================

/**
 * 算法 1: 移除 patch 中只包含删除的 hunks
 * 
 * ========================================
 * 算法目的
 * ========================================
 * 
 * 代码审查只关注新增的代码（+ 行），删除的代码（- 行）通常不需要审查
 * 这个函数移除只包含删除的 hunks，减少传递给 LLM 的 token 数量
 * 
 * ========================================
 * 算法逻辑
 * ========================================
 * 
 * 1. 遍历 patch 的每一行
 * 2. 检测 hunk header (@@ 开头）
 * 3. 累积每个 hunk 的所有行到临时数组 tempHunk
 * 4. 检查 hunk 是否包含任何添加的行（'+' 开头）
 *    - 如果有，标记 addHunk = true
 * 5. 当遇到新的 hunk header 时，检查上一个 hunk
 *    - 如果 addHunk = true，保存这个 hunk
 *    - 否则，丢弃这个 hunk
 * 
 * ========================================
 * 时间复杂度
 * ========================================
 * 
 * O(n)，其中 n 是 patch 的行数
 * 
 * ========================================
 * 示例
 * ========================================
 * 
 * 输入:
 * ```
 * @@ -10,6 +10,7 @@
 *    const items = [];
 *    const loading = false;
 *   -const oldState = null;
 *    const [data, setData] = useState(null);
 * 
 * @@ -25,4 +25,6 @@
 *    const value = 0;
 *    const multiplier = 2;
 * +  const result = value * multiplier;
 * ```
 * 
 * 输出（移除第一个 hunk，因为它只有删除）:
 * ```
 * @@ -25,4 +25,6 @@
 *    const value = 0;
 *    const multiplier = 2;
 * +  const result = value * multiplier;
 * ```
 * 
 * ========================================
 * 使用示例
 * ========================================
 * 
 * ```typescript
 * const cleanedPatch = handlePatchDeletions(
 *   rawPatch,
 *   'src/index.js',
 *   'modified'
 * );
 * ```
 * 
 * @param patch - 原始 patch 字符串（unified diff 格式）
 * @param fileName - 文件名（用于日志）
 * @param editType - 编辑类型 ('added', 'modified', 'removed', etc.)
 * @returns 处理后的 patch，或 null（如果没有需要审查的代码）
 */
export function handlePatchDeletions(
    patch: string,
    fileName: string,
    editType: string
): string | null {
    // ========================================
    // 步骤 1: 边界检查
    // ========================================
    // 
    // 如果没有 patch 且不是修改/添加，返回 null
    // 
    // 为什么需要这个？
    // - 删除的文件不需要代码审查
    // - 没有内容的新文件也可能不需要审查
    //
    
    if (!patch && editType !== 'modified' && editType !== 'added') {
        return null;
    }

    // ========================================
    // 步骤 2: 准备数据结构
    // ========================================
    // 
    // patchLines: split patch into array of lines
    // tempHunk: temporary storage for current hunk
    // addedPatched: final result (hunks with additions)
    // addHunk: flag to mark if current hunk has additions
    // insideHunk: flag to mark if we are inside a hunk
    //
    
    const patchLines = patch?.split('\n');
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;
    let insideHunk = false;

    // ========================================
    // 步骤 3: 遍历 patch 的每一行
    // ========================================
    // 
    // 对每一行进行处理，根据行类型决定操作
    //
    
    for (const line of patchLines) {
        // ========================================
        // 情况 1: Hunk Header (@@ 开头）
        // ========================================
        // 
        // 当遇到新的 hunk header 时，我们需要：
        // 1. 处理上一个 hunk（如果存在）
        // 2. 开始新的 hunk
        //
        
        if (line.startsWith('@@')) {
            // ========================================
            // 步骤 3.1: 匹配 hunk header
            // ========================================
            // 
            // 使用正则表达式解析 hunk header
            // 提取: oldStart, oldCount, newStart, newCount, functionHeader
            //
            
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
                // ========================================
                // 步骤 3.2: 处理上一个 hunk
                // ========================================
                // 
                // 如果我们在一个 hunk 中，且这个 hunk 有添加
                // 则保存这个 hunk 到结果中
                //
                
                if (insideHunk && addHunk) {
                    addedPatched.push(...tempHunk);
                    tempHunk.length = 0;  // 清空临时数组
                    addHunk = false;      // 重置 flag
                }
                
                // ========================================
                // 步骤 3.3: 开始新的 hunk
                // ========================================
                // 
                // 将 hunk header 添加到临时数组
                // 标记我们在一个 hunk 中
                //
                
                tempHunk.push(line);
                insideHunk = true;
            }
        } 
        // ========================================
        // 情况 2: 非 hunk header 的行
        // ========================================
        // 
        // 检查行类型：
        // - '+' : 添加的行
        // - '-' : 删除的行
        // - ' ' : 上下文行
        //
        
        else {
            // ========================================
            // 步骤 3.4: 添加行到临时数组
            // ========================================
            // 
            // 无论什么类型，都添加到临时数组
            // 后续检查 addHunk 决定是否保留
            //
            
            tempHunk.push(line);
            
            // ========================================
            // 步骤 3.5: 检查行类型
            // ========================================
            // 
            // 如果是 '+' 开头的行，标记当前 hunk 有添加
            //
            
            const editType = line.charAt(0);
            if (editType === '+') {
                addHunk = true;  // 当前 hunk 有添加
            }
        }
    }

    // ========================================
    // 步骤 4: 处理最后一个 hunk
    // ========================================
    // 
    // 循环结束后，可能还有一个未处理的 hunk
    // 如果这个 hunk 有添加，保存它
    //
    
    if (insideHunk && addHunk) {
        addedPatched.push(...tempHunk);
    }

    // ========================================
    // 步骤 5: 返回结果
    // ========================================
    // 
    // 如果内容没有变化，返回原 patch
    // 否则返回处理后的 patch
    //
    
    if (patch !== addedPatched.join('\n')) {
        return addedPatched.join('\n');
    }

    return patch;
}

// ============================================================================
// 第四部分：算法 2 - convertToHunksWithLinesNumbers
// ============================================================================

/**
 * 算法 2: 将 unified diff patch 转换为带绝对行号的格式
 * 
 * ========================================
 * 算法目的
 * ========================================
 * 
 * LLM 需要知道每一行的绝对文件行号，以便精确定位代码
 * 这个函数将标准的 unified diff 格式转换为带行号的格式
 * 
 * ========================================
 * 算法逻辑
 * ========================================
 * 
 * 1. 解析 hunk header，提取 oldStart 和 newStart
 *    - oldStart: 旧文件的起始行号
 *    - newStart: 新文件的起始行号
 * 
 * 2. 遍历 patch 的每一行
 *    - 遇到新的 hunk header 时，处理上一个 hunk
 *    - 累积新代码行到 newContentLines
 *    - 累积旧代码行到 oldContentLines
 * 
 * 3. 为新代码的每一行计算绝对行号
 *    - 公式: absoluteLineNumber = newStart + index
 *    - index 是该行在 hunk 中的索引
 * 
 * 4. 分离新代码 (__new hunk__) 和旧代码 (__old hunk__)
 *    - 新代码包含：上下文行 + 添加的行
 *    - 旧代码包含：删除的行
 * 
 * ========================================
行号计算详解
 * ========================================
 * 
 * Hunk Header 格式:
 * ```
 * @@ -10,6 +10,7 @@ export function useData() {
 * ```
 * 
 * 解析结果:
 * - oldStart = 10 (旧文件第 10 行)
 * - oldCount = 6 (旧文件 6 行)
 * - newStart = 10 (新文件第 10 行)
 * - newCount = 7 (新文件 7 行)
 * 
 * 行号映射:
 * ```
 * 索引 | 行类型 | 绝对行号 | 说明
 * -----|-------|---------|------
 * 0    | ' '   | 10      | 上下文行
 * 1    | ' '   | 11      | 上下文行
 * 2    | ' '   | 12      | 上下文行
 * 3    | '-'   | -       | 删除的行（不计入新文件）
 * 4    | '+'   | 13      | 添加的行 (newStart + 3 = 13)
 * 5    | '+'   | 14      | 添加的行 (newStart + 4 = 14)
 * 6    | ' '   | 15      | 上下文行 (newStart + 5 = 15)
 * ```
 * 
 * 注意：删除的行（'-'）不计算绝对行号，因为它们不在新文件中
 * 
 * ========================================
 * 输出格式
 * ========================================
 * 
 * ```
 * ## file: 'src/index.js'
 * 
 * @@ -10,6 +10,7 @@ export function useData() {
 * __new hunk__
 * 10  const items = [];
 * 11  const loading = false;
 * 12 +const error = null;
 * 13  const [data, setData] = useState(null);
 * __old hunk__
 * - const oldState = null;
 * ```
 * 
 * ========================================
 * 示例
 * ========================================
 * 
 * 输入:
 * ```
 * @@ -10,6 +10,7 @@
 *    const items = [];
 *    const loading = false;
 * +  const error = null;
 *    const [data, setData] = useState(null);
 * ```
 * 
 * 输出:
 * ```
 * ## file: 'src/index.js'
 * 
 * @@ -10,6 +10,7 @@
 * __new hunk__
 * 10  const items = [];
 * 11  const loading = false;
 * 12 +const error = null;
 * 13  const [data, setData] = useState(null);
 * ```
 * 
 * ========================================
 * 使用示例
 * ========================================
 * 
 * ```typescript
 * const formattedPatch = convertToHunksWithLinesNumbers(
 *   rawPatch,
 *   { filename: 'src/index.js' }
 * );
 * ```
 * 
 * @param patch - unified diff 格式的 patch 字符串
 * @param file - 文件信息，至少包含 filename
 * @returns 带行号的 patch 字符串
 */
export function convertToHunksWithLinesNumbers(
    patch: string,
    file: { filename?: string }
): string {
    // ========================================
    // 步骤 1: 初始化结果字符串
    // ========================================
    // 
    // 添加文件名标记
    // 格式: ## file: 'filename'
    //
    
    let result = `\n\n## file: '${file.filename?.trim()}'\n`;
    
    // ========================================
    // 步骤 2: 准备数据结构
    // ========================================
    // 
    // patchLines: split patch into array of lines
    // newContentLines: 新代码行（用于计算行号）
    // oldContentLines: 旧代码行（删除的行）
    // match: 正则匹配结果
    // start1, size1: 旧文件的起始行号和行数
    // start2, size2: 新文件的起始行号和行数
    // prevHeaderLine: 上一个 hunk header
    // headerLine: 当前 hunk header
    //
    
    const patchLines = patch.split('\n');
    const newContentLines: string[] = [];
    const oldContentLines: string[] = [];
    let match: RegExpMatchArray | null = null;
    let start1 = -1,  // oldStart
        size1 = -1,   // oldCount
        start2 = -1,  // newStart
        size2 = -1;   // newCount
    let prevHeaderLine = '';
    let headerLine = '';

    // ========================================
    // 步骤 3: 遍历 patch 的每一行
    // ========================================
    // 
    // 对每一行进行处理，根据行类型决定操作
    //
    
    for (const line of patchLines) {
        // ========================================
        // 情况 1: 忽略特殊标记
        // ========================================
        // 
        // "no newline at end of file" 标记不需要处理
        // 这是 git diff 自动添加的标记
        //
        
        if (line.toLowerCase().includes('no newline at end of file')) {
            continue;
        }

        // ========================================
        // 情况 2: Hunk Header (@@ 开头）
        // ========================================
        // 
        // 当遇到新的 hunk header 时，我们需要：
        // 1. 处理上一个 hunk（如果存在）
        // 2. 解析新的 hunk header
        //
        
        if (line.startsWith('@@')) {
            headerLine = line;
            match = line.match(RE_HUNK_HEADER);

            // ========================================
            // 步骤 3.1: 处理上一个 hunk
            // ========================================
            // 
            // 如果上一个 hunk 有内容，处理它
            // - 添加 header
            // - 添加新代码（带行号）
            // - 添加旧代码（不带行号）
            //
            
            if (match && (newContentLines.length > 0 || oldContentLines.length > 0)) {
                // 添加 hunk header
                result += `\n${prevHeaderLine}\n`;
                
                // 处理新代码行
                if (newContentLines.length > 0) {
                    // 检查是否有添加的行
                    const isPlusLines = newContentLines.some((line) => line.startsWith('+'));
                    
                    if (isPlusLines) {
                        // 添加新代码 hunk 标记
                        result = result.trimEnd() + '\n__new hunk__\n';
                        
                        // 为每一行添加绝对行号
                        // 公式: lineNumber = start2 + index
                        for (let i = 0; i < newContentLines.length; i++) {
                            result += `${start2 + i} ${newContentLines[i]}\n`;
                        }
                    }
                }
                
                // 处理旧代码行
                if (oldContentLines.length > 0) {
                    // 检查是否有删除的行
                    const isMinusLines = oldContentLines.some((line) => line.startsWith('-'));
                    
                    if (isMinusLines) {
                        // 添加旧代码 hunk 标记
                        result = result.trimEnd() + '\n__old hunk__\n';
                        
                        // 旧代码行不需要行号（因为它们不在新文件中）
                        for (const lineOld of oldContentLines) {
                            result += `${lineOld}\n`;
                        }
                    }
                }
                
                // 重置累积
                newContentLines = [];
                oldContentLines = [];
            }

            // ========================================
            // 步骤 3.2: 解析新的 hunk header
            // ========================================
            // 
            // 从 hunk header 中提取数字部分
            // - start1: 旧文件的起始行号
            // - size1: 旧文件的行数
            // - start2: 新文件的起始行号
            // - size2: 新文件的行数
            //
            
            if (match) {
                prevHeaderLine = headerLine;
                
                // 提取数字部分（$1-$4）
                const res = match
                    .slice(1, 5)
                    .map((val) => parseInt(val || '0', 10));
                
                [start1, size1, start2, size2] = res;
                
                // start2 是关键！
                // 它是新文件的起始行号
                // 用于计算绝对行号
            }
        } 
        // ========================================
        // 情况 3: 添加的行（'+' 开头）
        // ========================================
        // 
        // 只在新代码中
        // 用于代码审查
        //
        
        else if (line.startsWith('+')) {
            newContentLines.push(line);
        } 
        // ========================================
        // 情况 4: 删除的行（'-' 开头）
        // ========================================
        // 
        // 只在旧代码中
        // 不需要行号（因为不在新文件中）
        //
        
        else if (line.startsWith('-')) {
            oldContentLines.push(line);
        } 
        // ========================================
        // 情况 5: 上下文行（' ' 开头）
        // ========================================
        // 
        // 在新旧代码中都有
        // 需要行号（因为在新文件中）
        //
        
        else {
            newContentLines.push(line);
            oldContentLines.push(line);
        }
    }

    // ========================================
    // 步骤 4: 处理最后一个 hunk
    // ========================================
    // 
    // 循环结束后，可能还有一个未处理的 hunk
    // 处理逻辑与步骤 3.1 相同
    //
    
    if (match && newContentLines.length > 0) {
        result += `\n${headerLine}\n`;
        
        if (newContentLines.length > 0) {
            const isPlusLines = newContentLines.some((line) => line.startsWith('+'));
            
            if (isPlusLines) {
                result = result.trimEnd() + '\n__new hunk__\n';
                
                for (let i = 0; i < newContentLines.length; i++) {
                    result += `${start2 + i} ${newContentLines[i]}\n`;
                }
            }
        }
        
        if (oldContentLines.length > 0) {
            const isMinusLines = oldContentLines.some((line) => line.startsWith('-'));
            
            if (isMinusLines) {
                result = result.trimEnd() + '\n__old hunk__\n';
                
                for (const lineOld of oldContentLines) {
                    result += `${lineOld}\n`;
                }
            }
        }
    }

    // ========================================
    // 步骤 5: 返回结果
    // ========================================
    // 
    // 移除末尾的空白字符
    //
    
    return result.trim();
}

// ============================================================================
// 第五部分：算法 3 - extractLinesFromDiffHunk
// ============================================================================

/**
 * 算法 3: 从带行号的 diff hunk 中提取修改的行范围
 * 
 * ========================================
 * 算法目的
 * ========================================
 * 
 * 过滤 LLM 返回的建议，只保留那些在 diff 实际修改行范围内的建议
 * 提高建议的相关性和准确性
 * 
 * ========================================
 * 算法逻辑
 * ========================================
 * 
 * 1. 解析 hunk header，获取 newStart（新代码的起始行号）
 * 
 * 2. 遍历每一行，匹配带行号的格式
 *    - 格式: "123 +  const value = 1;"
 *    - 正则: /^(\d+)\s+([+\-])\s+(.*)$/
 * 
 * 3. 只处理添加的行（'+' 类型）
 *    - 为什么只处理 '+' 行？
 *    - 因为代码审查只关注新增的代码
 * 
 * 4. 将连续的添加行合并为一个范围
 *    - 例如: 第 10, 11, 12 行都被修改
 *    - 合并为: { start: 10, end: 12 }
 * 
 * 5. 遇到非添加行时，关闭当前 range
 * 
 * ========================================
 * 连续行的判断
 * ========================================
 * 
 * 如何判断两个行是否连续？
 * 
 * 示例:
 * ```
 * 行号: 10, 11, 12, 15, 16
 * 
 * 第一组连续: 10, 11, 12
 *   - 11 = 10 + 1 ✓ 连续
 *   - 12 = 11 + 1 ✓ 连续
 *   - 15 = 12 + 1 ✗ 不连续
 * 
 * 第二组连续: 15, 16
 *   - 16 = 15 + 1 ✓ 连续
 * 
 * 结果:
 * [
 *   { start: 10, end: 12 },  // 第一组
 *   { start: 15, end: 16 }   // 第二组
 * ]
 * ```
 * 
 * ========================================
 * 输入输出示例
 * ========================================
 * 
 * 输入:
 * ```
 * @@ -10,6 +10,7 @@ export function useData() {
 * __new hunk__
 * 10  const items = [];
 * 11  const loading = false;
 * 12 +const error = null;
 * 13  const [data, setData] = useState(null);
 * ```
 * 
 * 输出:
 * ```typescript
 * [
 *   { start: 12, end: 12 }  // 只有第 12 行被修改
 * ]
 * ```
 * 
 * ========================================
 * 复杂场景示例
 * ========================================
 * 
 * 场景 1: 分散的单行修改
 * 
 * 输入:
 * ```
 * 10  const name = 'John';
 * 11 +const email = 'john@example.com';
 * 12  const age = 30;
 * 13 +const phone = '123-456-7890';
 * 14  const active = true;
 * ```
 * 
 * 输出:
 * ```typescript
 * [
 *   { start: 11, end: 11 },
 *   { start: 13, end: 13 }
 * ]
 * ```
 * 
 * 场景 2: 连续的多行修改
 * 
 * 输入:
 * ```
 * 45  interface User {
 * 46    id: string;
 * 47 +  description: string;
 * 48 +  labels: string[];
 * 49 +  status: 'open' | 'closed';
 * 50    created_at: string;
 * ```
 * 
 * 输出:
 * ```typescript
 * [
 *   { start: 47, end: 49 }  // 连续三行
 * ]
 * ```
 * 
 * ========================================
 * 使用示例
 * ========================================
 * 
 * ```typescript
 * const ranges = extractLinesFromDiffHunk(formattedPatch);
 * // 结果: [{ start: 10, end: 12 }, { start: 25, end: 28 }]
 * ```
 * 
 * @param diffHunk - 带行号的 diff hunk 字符串
 * @returns 修改范围列表
 */
export function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    // ========================================
    // 步骤 1: 准备数据结构
    // ========================================
    // 
    // lines: split diffHunk into array of lines
    // modifiedRanges: 最终结果（修改范围列表）
    // currentHunkStart: 当前 hunk 的起始行号
    // currentRange: 当前正在处理的 range
    //
    
    const lines = diffHunk?.split('\n') || [];
    const modifiedRanges: ModifiedRange[] = [];
    let currentHunkStart = 0;
    let currentRange: ModifiedRange | null = null;

    // ========================================
    // 步骤 2: 遍历每一行
    // ========================================
    // 
    // 对每一行进行处理，根据行类型决定操作
    //
    
    for (const line of lines) {
        // ========================================
        // 情况 1: Hunk Header (@@ 开头）
        // ========================================
        // 
        // 当遇到 hunk header 时：
        // 1. 提取 newStart（新文件的起始行号）
        // 2. 关闭上一个 range（如果存在）
        //
        
        if (line?.startsWith('@@')) {
            // 解析 hunk header，提取 newStart
            const match = line?.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            
            if (match) {
                currentHunkStart = parseInt(match[1], 10);
                
                // 关闭上一个 range
                if (currentRange) {
                    modifiedRanges.push(currentRange);
                    currentRange = null;
                }
            }
            continue;  // 继续下一行
        }

        // ========================================
        // 情况 2: 标记行（__new hunk__, __old hunk__）
        // ========================================
        // 
        // 忽略这些标记行
        //
        
        if (line?.includes(MARKER_NEW_HUNK) || line?.includes(MARKER_OLD_HUNK)) {
            continue;
        }

        // ========================================
        // 情况 3: 带行号的修改行
        // ========================================
        // 
        // 匹配格式: "123 +  const value = 1;"
        // 正则: /^(\d+)\s+([+\-])\s+(.*)$/
        // 
        // 提取:
        // - $1: lineNumber (绝对行号)
        // - $2: type ('+', '-', 或 ' ')
        // - $3: content (行内容)
        //
        
        const lineMatch = line?.match(RE_LINE_WITH_NUMBER);
        
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const changeType = lineMatch[2] as '+' | '-' | ' ';

            // ========================================
            // 只处理添加的行（'+'）
            // ========================================
            // 
            // 为什么只处理 '+' 行？
            // - 代码审查只关注新增的代码
            // - 删除的代码（'-'）不需要审查
            //
            
            if (changeType === '+') {
                // ========================================
                // 情况 3.1: 创建新的 range
                // ========================================
                // 
                // 如果当前没有 range，创建一个新的
                // 初始: start = end = lineNumber
                //
                
                if (!currentRange) {
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber
                    };
                } 
                // ========================================
                // 情况 3.2: 连续行，扩展 range
                // ========================================
                // 
                // 如果当前行是上一行的下一行（lineNumber == currentRange.end + 1）
                // 扩展 range 的结束行号
                //
                // 示例:
                // - 当前 range: { start: 10, end: 12 }
                // - 当前行: 13
                // - 判断: 13 == 12 + 1? Yes ✓
                // - 扩展: { start: 10, end: 13 }
                //
                
                else if (lineNumber === currentRange.end + 1) {
                    currentRange.end = lineNumber;
                } 
                // ========================================
                // 情况 3.3: 不连续，关闭当前 range 并创建新的
                // ========================================
                // 
                // 如果当前行不是连续的：
                // 1. 保存当前 range 到结果中
                // 2. 创建新的 range
                //
                // 示例:
                // - 当前 range: { start: 10, end: 12 }
                // - 当前行: 15
                // - 判断: 15 == 12 + 1? No ✗
                // - 保存: { start: 10, end: 12 }
                // - 创建: { start: 15, end: 15 }
                //
                
                else {
                    modifiedRanges.push(currentRange);
                    currentRange = {
                        start: lineNumber,
                        end: lineNumber
                    };
                }
            }
        } 
        // ========================================
        // 情况 4: 非修改行
        // ========================================
        // 
        // 包括：
        // - 上下文行（' '）
        // - 删除的行（'-'）
        // 
        // 关闭当前 range（如果存在）
        //
        
        else {
            if (currentRange) {
                modifiedRanges.push(currentRange);
                currentRange = null;
            }
        }
    }

    // ========================================
    // 步骤 3: 处理最后一个 range
    // ========================================
    // 
    // 循环结束后，可能还有一个未处理的 range
    // 保存它到结果中
    //
    
    if (currentRange) {
        modifiedRanges.push(currentRange);
    }

    // ========================================
    // 步骤 4: 返回结果
    // ========================================
    // 
    // 返回所有修改范围的列表
    //
    
    return modifiedRanges;
}

// ============================================================================
// 第六部分：辅助功能 - filterSuggestionsByDiff
// ============================================================================

/**
 * 辅助功能: 过滤建议，只保留在 diff 实际修改行范围内的建议
 * 
 * ========================================
 * 功能说明
 * ========================================
 * 
 * LLM 可能会建议修改 diff 之外的代码
 * 这个函数过滤建议，确保只保留在修改范围内的建议
 * 
 * ========================================
 * 匹配逻辑
 * ========================================
 * 
 * 建议被保留的条件（满足任一即可）:
 * 
 * 1. 建议完全在修改范围内
 *    - start >= range.start && end <= range.end
 * 
 * 2. 建议的起始在修改范围内
 *    - start >= range.start && start <= range.end
 * 
 * 3. 建议的结束在修改范围内
 *    - end >= range.start && end <= range.end
 * 
 * 4. 修改范围完全在建议内
 *    - start <= range.start && end >= range.end
 * 
 * ========================================
 * 示例
 * ========================================
 * 
 * 修改范围:
 * ```
 * [
 *   { start: 10, end: 15 },  // 修改范围 1
 *   { start: 25, end: 30 }   // 修改范围 2
 * ]
 * ```
 * 
 * 建议过滤:
 * 
 * | 建议行范围 | 是否保留 | 原因 |
 * |------------|---------|------|
 * | { start: 5, end: 8 } | ❌ 不在修改范围内 |
 * | { start: 12, end: 14 } | ✅ 在修改范围 1 内 |
 * | { start: 20, end: 22 } | ❌ 不在修改范围内 |
 * | { start: 28, end: 29 } | ✅ 在修改范围 2 内 |
 * | { start: 8, end: 18 } | ✅ 与修改范围 1 重叠 |
 * | { start: 1, end: 35 } | ✅ 覆盖所有修改范围 |
 * 
 * ========================================
 * 使用示例
 * ========================================
 * 
 * ```typescript
 * const validSuggestions = filterSuggestionsByDiff(
 *   formattedPatch,
 *   suggestions
 * );
 * ```
 * 
 * @param patchWithLinesStr - 带行号的 patch 字符串
 * @param suggestions - 建议列表
 * @returns 过滤后的建议列表
 */
export function filterSuggestionsByDiff(
    patchWithLinesStr: string,
    suggestions: Suggestion[]
): Suggestion[] {
    // ========================================
    // 步骤 1: 提取修改范围
    // ========================================
    // 
    // 使用 extractLinesFromDiffHunk 获取修改范围
    //
    
    const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);
    
    // 如果没有修改范围，返回空列表
    if (modifiedRanges.length === 0) {
        return [];
    }

    // ========================================
    // 步骤 2: 过滤建议
    // ========================================
    // 
    // 只保留在修改范围内的建议
    //
    
    return suggestions.filter((suggestion) => {
        const start = suggestion.relevantLinesStart;
        const end = suggestion.relevantLinesEnd;

        // 检查是否与任何修改范围重叠
        return modifiedRanges.some((range) => {
            return (
                // 建议完全在范围内
                (start >= range.start && start <= range.end) ||
                // 建议的起始在范围内
                (start >= range.start && start <= range.end) ||
                // 建议的结束在范围内
                (end >= range.start && end <= range.end) ||
                // 范围完全在建议内
                (start <= range.start && end >= range.end)
            );
        });
    });
}

// ============================================================================
// 第七部分：导出
// ============================================================================

/**
 * 导出所有核心算法
 * 
 * @example
 * ```typescript
 * import { PatchProcessor } from './STUDY_CORE_DIFF_ALGORITHMS';
 * 
 * // 使用方法
 * const cleanedPatch = PatchProcessor.handlePatchDeletions(...);
 * const formattedPatch = PatchProcessor.convertToHunksWithLinesNumbers(...);
 * const ranges = PatchProcessor.extractLinesFromDiffHunk(...);
 * ```
 */
export const PatchProcessor = {
    // 核心算法
    handlePatchDeletions,
    convertToHunksWithLinesNumbers,
    extractLinesFromDiffHunk,
    
    // 辅助功能
    filterSuggestionsByDiff
};

export default PatchProcessor;
