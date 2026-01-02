/**
 * Kodus AI Diff 处理完整流程 - 可调试版本
 * 
 * 包含所有核心步骤：
 * 1. Diff 处理 (handlePatchDeletions, convertToHunksWithLinesNumbers)
 * 2. 上下文扩展 (extractRelevantContext, getRelatedContentFromDiff 模拟)
 * 3. AST 分析接口 (FunctionAffect, 影响分析)
 * 4. MCP 工具调用模拟
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface FileInfo {
    filename: string;
    patch?: string;
    status?: 'modified' | 'added' | 'deleted';
    fileContent?: string;
}

export interface ModifiedRange {
    start: number;
    end: number;
}

export interface FunctionAffect {
    functionName: string;
    filePath: string;
    impact: string;
    affectedBy: string[];
}

export interface ImpactAnalysisResponse {
    functionsAffect: FunctionAffect[];
    functionSimilarity: Array<{
        functionName: string;
        filePath: string;
        similarTo: Array<{
            functionName: string;
            filePath: string;
            similarity: number;
        }>;
    }>;
}

export interface ProcessingStep {
    step: number;
    name: string;
    description: string;
    input: any;
    output: any;
    tokensBefore?: number;
    tokensAfter?: number;
    tokensSaved?: string;
    duration?: number;
}

export interface ContextEvidence {
    provider: string;
    toolName: string;
    payload: any;
    metadata?: Record<string, unknown>;
}

export interface AnalysisContext {
    file: FileInfo;
    patchWithLinesStr: string;
    modifiedRanges: ModifiedRange[];
    relevantContent?: string;
    impactAnalysis?: ImpactAnalysisResponse;
    contextEvidences?: ContextEvidence[];
    processingSteps: ProcessingStep[];
}

// ============================================================================
// Step 1: Diff 处理
// ============================================================================

const RE_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

/**
 * Step 1.1: 移除只删除的 hunks
 */
export function handlePatchDeletions(
    patch: string,
    fileName: string,
    editType: string,
): string | null {
    if (!patch && editType !== 'modified' && editType !== 'added') {
        return null;
    }

    const patchLines = patch?.split('\n') || [];
    const tempHunk: string[] = [];
    const addedPatched: string[] = [];
    let addHunk = false;
    let insideHunk = false;

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
            if (line.charAt(0) === '+') {
                addHunk = true;
            }
        }
    }

    if (insideHunk && addHunk) {
        addedPatched.push(...tempHunk);
    }

    return addedPatched.join('\n');
}

/**
 * Step 1.2: 添加绝对行号
 */
export function convertToHunksWithLinesNumbers(
    patch: string,
    file: FileInfo,
): string {
    let patchWithLinesStr = `\n\n## file: '${file.filename?.trim() || 'unknown'}'\n`;
    const patchLines = patch.split('\n');

    let newContentLines: string[] = [];
    let oldContentLines: string[] = [];
    let match: RegExpMatchArray | null = null;
    let start1 = -1, size1 = -1, start2 = -1, size2 = -1;
    let prevHeaderLine = '';
    let headerLine = '';

    for (const line of patchLines) {
        if (line.toLowerCase().includes('no newline at end of file')) {
            continue;
        }

        if (line.startsWith('@@')) {
            headerLine = line;
            match = line.match(RE_HUNK_HEADER);

            if (match && (newContentLines.length > 0 || oldContentLines.length > 0)) {
                if (prevHeaderLine) {
                    patchWithLinesStr += `\n${prevHeaderLine}\n`;
                }

                if (newContentLines.length > 0) {
                    const isPlusLines = newContentLines.some(l => l.startsWith('+'));
                    if (isPlusLines) {
                        patchWithLinesStr = patchWithLinesStr.trimEnd() + '\n__new hunk__\n';
                        for (let i = 0; i < newContentLines.length; i++) {
                            patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
                        }
                    }
                }

                if (oldContentLines.length > 0) {
                    const isMinusLines = oldContentLines.some(l => l.startsWith('-'));
                    if (isMinusLines) {
                        patchWithLinesStr = patchWithLinesStr.trimEnd() + '\n__old hunk__\n';
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
                const res = match.slice(1, 5).map(val => parseInt(val || '0', 10));
                [start1, size1, start2, size2] = res;
            }
        } else if (line.startsWith('+')) {
            newContentLines.push(line);
        } else if (line.startsWith('-')) {
            oldContentLines.push(line);
        } else {
            newContentLines.push(line);
            oldContentLines.push(line);
        }
    }

    if (match && newContentLines.length > 0) {
        patchWithLinesStr += `\n${headerLine}\n`;
        if (newContentLines.length > 0) {
            const isPlusLines = newContentLines.some(l => l.startsWith('+'));
            if (isPlusLines) {
                patchWithLinesStr = patchWithLinesStr.trimEnd() + '\n__new hunk__\n';
                for (let i = 0; i < newContentLines.length; i++) {
                    patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
                }
            }
        }
        if (oldContentLines.length > 0) {
            const isMinusLines = oldContentLines.some(l => l.startsWith('-'));
            if (isMinusLines) {
                patchWithLinesStr = patchWithLinesStr.trimEnd() + '\n__old hunk__\n';
                for (const lineOld of oldContentLines) {
                    patchWithLinesStr += `${lineOld}\n`;
                }
            }
        }
    }

    return patchWithLinesStr.trim();
}

/**
 * Step 1.3: 提取修改范围
 */
export function extractLinesFromDiffHunk(diffHunk: string): ModifiedRange[] {
    const lines = diffHunk?.split('\n') || [];
    const modifiedRanges: ModifiedRange[] = [];
    let currentRange: ModifiedRange | null = null;

    for (const line of lines) {
        if (line?.startsWith('@@')) {
            if (currentRange) {
                modifiedRanges.push(currentRange);
                currentRange = null;
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

            if (changeType === '+') {
                if (!currentRange) {
                    currentRange = { start: lineNumber, end: lineNumber };
                } else if (lineNumber === currentRange.end + 1) {
                    currentRange.end = lineNumber;
                } else {
                    modifiedRanges.push(currentRange);
                    currentRange = { start: lineNumber, end: lineNumber };
                }
            }
        } else {
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

// ============================================================================
// Step 2: 上下文扩展
// ============================================================================

/**
 * Step 2.1: 从文件内容中提取与 diff 相关的上下文
 * 模拟 getRelatedContentFromDiff 的本地实现
 */
export function extractRelevantContext(
    fullFileContent: string,
    modifiedRanges: ModifiedRange[],
    contextLines: number = 15,
): string {
    if (!fullFileContent || !modifiedRanges.length) {
        return fullFileContent || '';
    }

    const lines = fullFileContent.split('\n');
    const relevantLineNumbers = new Set<number>();

    // 扩展每个修改范围
    for (const range of modifiedRanges) {
        for (let i = range.start - contextLines; i <= range.end + contextLines; i++) {
            if (i >= 1 && i <= lines.length) {
                relevantLineNumbers.add(i);
            }
        }
    }

    // 按行号排序并组合
    const sortedLines = Array.from(relevantLineNumbers).sort((a, b) => a - b);
    const resultLines: string[] = [];
    let lastLine = -1;

    for (const lineNum of sortedLines) {
        // 如果有间隔，添加省略标记
        if (lastLine !== -1 && lineNum > lastLine + 1) {
            resultLines.push(`... (省略 ${lineNum - lastLine - 1} 行) ...`);
        }
        resultLines.push(`${lineNum}: ${lines[lineNum - 1]}`);
        lastLine = lineNum;
    }

    return resultLines.join('\n');
}

/**
 * Step 2.2: 模拟 AST 服务的 getRelatedContentFromDiff
 * 实际服务会解析 AST 找到相关的函数和类
 */
export function mockGetRelatedContentFromDiff(
    fileContent: string,
    diff: string,
    filePath: string,
): { content: string; functions: string[] } {
    // 简单的函数提取（实际 AST 服务会更精确）
    const functionRegex = /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|=\s*(?:async\s*)?function|\()/g;
    const functions: string[] = [];
    let match;

    while ((match = functionRegex.exec(fileContent)) !== null) {
        functions.push(match[1]);
    }

    // 提取修改范围附近的函数
    const lines = fileContent.split('\n');
    const modifiedRanges = extractLinesFromDiffHunk(diff);
    const relevantFunctions: string[] = [];

    for (const range of modifiedRanges) {
        // 查找包含修改行的函数
        for (let i = range.start - 1; i >= 0 && i < lines.length; i--) {
            const line = lines[i];
            const funcMatch = line.match(/(?:function|const|let|var)\s+(\w+)/);
            if (funcMatch) {
                if (!relevantFunctions.includes(funcMatch[1])) {
                    relevantFunctions.push(funcMatch[1]);
                }
                break;
            }
        }
    }

    return {
        content: extractRelevantContext(fileContent, modifiedRanges),
        functions: relevantFunctions,
    };
}

// ============================================================================
// Step 3: AST 影响分析 (模拟)
// ============================================================================

/**
 * Step 3.1: 模拟 AST 影响分析
 * 实际服务会构建完整的函数调用图
 */
export function mockImpactAnalysis(
    fileContent: string,
    modifiedFunctions: string[],
): ImpactAnalysisResponse {
    // 简单的调用关系分析（实际 AST 服务会更精确）
    const functionsAffect: FunctionAffect[] = [];

    for (const func of modifiedFunctions) {
        // 查找调用这个函数的地方
        const callerRegex = new RegExp(`\\b${func}\\s*\\(`, 'g');
        const lines = fileContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            if (callerRegex.test(lines[i])) {
                functionsAffect.push({
                    functionName: func,
                    filePath: 'current-file',
                    impact: `Function ${func} is called at line ${i + 1}`,
                    affectedBy: [func],
                });
            }
        }
    }

    return {
        functionsAffect,
        functionSimilarity: [],
    };
}

// ============================================================================
// Step 4: MCP 工具调用 (模拟)
// ============================================================================

/**
 * Step 4.1: 模拟 MCP 工具调用
 */
export function mockMCPToolCall(
    toolName: string,
    args: Record<string, unknown>,
): ContextEvidence {
    // 模拟不同工具的响应
    const mockResponses: Record<string, any> = {
        'code_search': {
            results: [
                { file: 'src/utils.ts', line: 42, content: 'function helper() {...}' },
                { file: 'src/index.ts', line: 15, content: 'import { helper } from "./utils"' },
            ],
        },
        'documentation_lookup': {
            docs: 'This function is used for processing data...',
            examples: ['helper(data)', 'await helper(asyncData)'],
        },
        'dependency_check': {
            dependencies: ['lodash', 'axios'],
            vulnerabilities: [],
        },
    };

    return {
        provider: 'mock-mcp-server',
        toolName,
        payload: mockResponses[toolName] || { message: 'Tool not found' },
        metadata: {
            executionStatus: 'success',
            timestamp: new Date().toISOString(),
        },
    };
}

// ============================================================================
// 完整处理流程
// ============================================================================

export class DiffProcessor {
    private steps: ProcessingStep[] = [];

    /**
     * 处理完整的 PR diff，返回所有处理步骤
     */
    async process(
        file: FileInfo,
        fileContent?: string,
        enableMockAST: boolean = true,
        enableMockMCP: boolean = true,
    ): Promise<AnalysisContext> {
        this.steps = [];
        const startTime = Date.now();

        // Step 1.1: 过滤只删除的 hunks
        const step1Start = Date.now();
        const originalPatch = file.patch || '';
        const filteredPatch = handlePatchDeletions(
            originalPatch,
            file.filename,
            file.status || 'modified',
        );

        this.addStep({
            step: 1,
            name: 'handlePatchDeletions',
            description: '过滤只包含删除的 hunks，减少 token 消耗',
            input: { patchLength: originalPatch.length },
            output: { filteredPatchLength: filteredPatch?.length || 0 },
            tokensBefore: originalPatch.length,
            tokensAfter: filteredPatch?.length || 0,
            tokensSaved: `${Math.round((1 - (filteredPatch?.length || 0) / Math.max(originalPatch.length, 1)) * 100)}%`,
            duration: Date.now() - step1Start,
        });

        if (!filteredPatch) {
            return {
                file,
                patchWithLinesStr: '',
                modifiedRanges: [],
                processingSteps: this.steps,
            };
        }

        // Step 1.2: 添加绝对行号
        const step2Start = Date.now();
        const patchWithLinesStr = convertToHunksWithLinesNumbers(filteredPatch, file);

        this.addStep({
            step: 2,
            name: 'convertToHunksWithLinesNumbers',
            description: '添加绝对行号，便于 LLM 精确定位',
            input: { filteredPatch: filteredPatch.substring(0, 100) + '...' },
            output: { patchWithLinesStr: patchWithLinesStr.substring(0, 200) + '...' },
            duration: Date.now() - step2Start,
        });

        // Step 1.3: 提取修改范围
        const step3Start = Date.now();
        const modifiedRanges = extractLinesFromDiffHunk(patchWithLinesStr);

        this.addStep({
            step: 3,
            name: 'extractLinesFromDiffHunk',
            description: '提取修改行范围，用于过滤建议',
            input: { patchWithLinesStr: '...' },
            output: { modifiedRanges },
            duration: Date.now() - step3Start,
        });

        let relevantContent: string | undefined;
        let impactAnalysis: ImpactAnalysisResponse | undefined;
        const contextEvidences: ContextEvidence[] = [];

        // Step 2: 上下文扩展
        if (fileContent) {
            const step4Start = Date.now();
            const contextResult = mockGetRelatedContentFromDiff(
                fileContent,
                patchWithLinesStr,
                file.filename,
            );
            relevantContent = contextResult.content;

            this.addStep({
                step: 4,
                name: 'getRelatedContentFromDiff (模拟)',
                description: '从完整文件中提取与 diff 相关的代码（非整个文件）',
                input: {
                    fullFileLines: fileContent.split('\n').length,
                    modifiedRanges,
                },
                output: {
                    relevantContentLines: relevantContent.split('\n').length,
                    extractedFunctions: contextResult.functions,
                },
                tokensBefore: fileContent.length,
                tokensAfter: relevantContent.length,
                tokensSaved: `${Math.round((1 - relevantContent.length / Math.max(fileContent.length, 1)) * 100)}%`,
                duration: Date.now() - step4Start,
            });

            // Step 3: AST 影响分析
            if (enableMockAST && contextResult.functions.length > 0) {
                const step5Start = Date.now();
                impactAnalysis = mockImpactAnalysis(fileContent, contextResult.functions);

                this.addStep({
                    step: 5,
                    name: 'initializeImpactAnalysis (模拟)',
                    description: '分析修改函数对其他函数的影响',
                    input: { modifiedFunctions: contextResult.functions },
                    output: {
                        affectedFunctions: impactAnalysis.functionsAffect.length,
                        functionsAffect: impactAnalysis.functionsAffect,
                    },
                    duration: Date.now() - step5Start,
                });
            }
        }

        // Step 4: MCP 工具调用
        if (enableMockMCP) {
            const step6Start = Date.now();
            const codeSearchResult = mockMCPToolCall('code_search', {
                query: file.filename,
            });
            contextEvidences.push(codeSearchResult);

            this.addStep({
                step: 6,
                name: 'MCP Tool: code_search (模拟)',
                description: 'Agent 调用 MCP 工具搜索相关代码',
                input: { query: file.filename },
                output: codeSearchResult.payload,
                duration: Date.now() - step6Start,
            });
        }

        // 最终汇总
        this.addStep({
            step: 99,
            name: '处理完成',
            description: '所有处理步骤完成，准备发送给 LLM',
            input: {},
            output: {
                totalSteps: this.steps.length - 1,
                totalDuration: Date.now() - startTime,
                finalPatchLength: patchWithLinesStr.length,
                modifiedRangesCount: modifiedRanges.length,
                hasRelevantContent: !!relevantContent,
                hasImpactAnalysis: !!impactAnalysis,
                contextEvidencesCount: contextEvidences.length,
            },
            duration: Date.now() - startTime,
        });

        return {
            file,
            patchWithLinesStr,
            modifiedRanges,
            relevantContent,
            impactAnalysis,
            contextEvidences,
            processingSteps: this.steps,
        };
    }

    private addStep(step: ProcessingStep): void {
        this.steps.push(step);
    }

    /**
     * 打印处理步骤（用于调试）
     */
    static printSteps(context: AnalysisContext): void {
        console.log('\n' + '='.repeat(80));
        console.log('📊 PR Diff 处理流程详情');
        console.log('='.repeat(80));
        console.log(`📁 文件: ${context.file.filename}`);
        console.log('='.repeat(80));

        for (const step of context.processingSteps) {
            console.log(`\n📌 Step ${step.step}: ${step.name}`);
            console.log(`   描述: ${step.description}`);
            console.log(`   耗时: ${step.duration}ms`);

            if (step.tokensBefore !== undefined && step.tokensAfter !== undefined) {
                console.log(`   Token: ${step.tokensBefore} → ${step.tokensAfter} (节省 ${step.tokensSaved})`);
            }

            console.log(`   输入:`, JSON.stringify(step.input, null, 2).split('\n').map(l => '      ' + l).join('\n'));
            console.log(`   输出:`, JSON.stringify(step.output, null, 2).split('\n').map(l => '      ' + l).join('\n'));
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ 最终输出（发送给 LLM 的内容）');
        console.log('='.repeat(80));
        console.log('\n--- patchWithLinesStr ---');
        console.log(context.patchWithLinesStr);

        if (context.relevantContent) {
            console.log('\n--- relevantContent (相关代码上下文) ---');
            console.log(context.relevantContent);
        }

        if (context.impactAnalysis?.functionsAffect?.length) {
            console.log('\n--- impactAnalysis (影响分析) ---');
            console.log(JSON.stringify(context.impactAnalysis, null, 2));
        }

        console.log('\n' + '='.repeat(80));
    }
}

export default DiffProcessor;
