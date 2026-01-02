/**
 * Diff Processor - Core Types
 * 
 * 核心类型定义，用于 diff 处理算法
 */

/**
 * Patch Hunk Header 解析结果
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
 * 修改的范围
 * 
 * 表示一个连续的修改区域
 */
export interface ModifiedRange {
    /** 修改范围的起始行号（绝对行号） */
    start: number;
    /** 修改范围的结束行号（绝对行号） */
    end: number;
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
 * Diff Hunk（带有行号）
 * 
 * 包含一个 hunk 的所有信息
 */
export interface PatchHunk {
    /** Hunk header */
    header: string;
    /** Hunk header 解析结果 */
    parsedHeader: PatchHunkHeader;
    /** 新代码行（带行号） */
    newLines: LineWithNumber[];
    /** 旧代码行（带行号，仅包含删除的行） */
    oldLines: LineWithNumber[];
}

/**
 * Patch 处理选项
 */
export interface PatchProcessorOptions {
    /** 是否移除只包含删除的 hunks（默认: true） */
    removeDeletionsOnly?: boolean;
    /** 是否添加行号标记（默认: true） */
    addLineNumbers?: boolean;
    /** 是否忽略 "no newline at end of file" 标记（默认: true） */
    ignoreNoNewlineMarker?: boolean;
    /** 上下文行数（默认: 3） */
    contextLines?: number;
}

/**
 * Patch 处理结果
 */
export interface PatchProcessorResult {
    /** 处理后的 patch 字符串 */
    patch: string;
    /** 修改范围列表 */
    modifiedRanges: ModifiedRange[];
    /** Hunk 列表（带行号） */
    hunks: PatchHunk[];
    /** 统计信息 */
    stats: {
        /** 总 hunks 数 */
        totalHunks: number;
        /** 总添加行数 */
        totalAdditions: number;
        /** 总删除行数 */
        totalDeletions: number;
        /** 总上下文行数 */
        totalContextLines: number;
        /** 总字符数 */
        totalCharacters: number;
        /** 预估 token 数 */
        estimatedTokens: number;
    };
}

/**
 * 建议过滤选项
 */
export interface SuggestionFilterOptions {
    /** 允许的误差行数（默认: 0） */
    tolerance?: number;
    /** 是否要求建议完全在范围内（默认: false） */
    requireFullyInRange?: boolean;
}

/**
 * 建议定义
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
    /** 建议摘要 */
    oneSentenceSummary?: string;
    /** 建议内容 */
    suggestionContent?: string;
    /** 严重程度 */
    severity?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Patch 验证结果
 */
export interface PatchValidationResult {
    /** 是否有效 */
    isValid: boolean;
    /** 错误列表 */
    errors: string[];
    /** 警告列表 */
    warnings: string[];
}

/**
 * Diff 统计信息
 */
export interface DiffStats {
    /** 添加的行数 */
    additions: number;
    /** 删除的行数 */
    deletions: number;
    /** 修改的行数 */
    modifications: number;
    /** 文件数 */
    files: number;
    /** 总 hunks 数 */
    hunks: number;
}

/**
 * 带注释的行
 */
export interface AnnotatedLine {
    /** 行号 */
    lineNumber: number;
    /** 行类型 */
    type: '+' | '-' | ' ' | '*';
    /** 行内容 */
    content: string;
    /** 是否在修改范围内 */
    isModified: boolean;
    /** 原因（为什么被标记） */
    reason?: string;
}
