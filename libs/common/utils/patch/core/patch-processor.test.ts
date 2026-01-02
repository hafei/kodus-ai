/**
 * Patch Processor - Unit Tests
 * 
 * 核心算法的单元测试，覆盖所有功能和边界情况
 */

import { describe, it, expect } from 'vitest';
import {
    handlePatchDeletions,
    convertToHunksWithLinesNumbers,
    extractLinesFromDiffHunk,
    processPatch,
    filterSuggestionsByDiff,
    validatePatchFormat,
    calculateDiffStats,
    visualizePatch,
    formatAnnotatedPatch
} from './patch-processor';
import type { Suggestion } from './patch-processor.types';

// ============================================================================
// 算法 1: handlePatchDeletions 测试
// ============================================================================

describe('PatchProcessor - handlePatchDeletions', () => {
    it('should remove hunks with only deletions', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
   const loading = false;
-  const oldState = null;
   const [data, setData] = useState(null);

@@ -25,4 +25,6 @@
   const value = 0;
+  const multiplier = 2;
+  const result = value * multiplier;`;

        const result = handlePatchDeletions(patch, 'src/index.js', 'modified');
        
        // 应该移除第一个 hunk（只有删除）
        // 保留第二个 hunk（有添加）
        expect(result).not.toContain('-  const oldState = null;');
        expect(result).toContain('+  const multiplier = 2;');
    });

    it('should keep hunks with both additions and deletions', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
-  const oldState = null;
+  const error = null;
   const [data, setData] = useState(null);`;

        const result = handlePatchDeletions(patch, 'src/index.js', 'modified');
        
        // 应该保留（有添加）
        expect(result).toContain('+  const error = null;');
        expect(result).toContain('-  const oldState = null;');
    });

    it('should return null for non-modified files without patch', () => {
        const result = handlePatchDeletions('', 'src/index.js', 'removed');
        expect(result).toBeNull();
    });

    it('should return patch as-is if no deletions-only hunks', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
   const loading = false;
+  const error = null;`;

        const result = handlePatchDeletions(patch, 'src/index.js', 'modified');
        expect(result).toEqual(patch);
    });
});

// ============================================================================
// 算法 2: convertToHunksWithLinesNumbers 测试
// ============================================================================

describe('PatchProcessor - convertToHunksWithLinesNumbers', () => {
    it('should add line numbers to patch', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
   const loading = false;
+  const error = null;
   const [data, setData] = useState(null);`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        
        expect(result).toContain('## file: \'src/index.js\'');
        expect(result).toContain('10  const items = [];');
        expect(result).toContain('11 +  const error = null;');
        expect(result).toContain('12  const [data, setData] = useState(null);');
    });

    it('should separate new and old hunks', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
   const loading = false;
-  const oldState = null;
+  const error = null;
   const [data, setData] = useState(null);`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        
        expect(result).toContain('__new hunk__');
        expect(result).toContain('__old hunk__');
    });

    it('should handle multiple hunks', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
+  const error = null;

@@ -25,4 +25,6 @@
   const value = 0;
+  const multiplier = 2;`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        
        expect(result).toContain('10 +  const error = null;');
        expect(result).toContain('26 +  const multiplier = 2;');
    });

    it('should ignore "no newline at end of file" marker', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
+  const error = null;
\\ No newline at end of file`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        
        expect(result).not.toContain('No newline at end of file');
    });
});

// ============================================================================
// 算法 3: extractLinesFromDiffHunk 测试
// ============================================================================

describe('PatchProcessor - extractLinesFromDiffHunk', () => {
    it('should extract single line modification', () => {
        const diff = `@@ -37,6 +37,7 @@
__new hunk__
37              pull_number: number;
38              repository: string;
39              title: string;
40 +            url: string;
41          }[]`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([{ start: 40, end: 40 }]);
    });

    it('should extract consecutive line additions', () => {
        const diff = `@@ -45,6 +45,9 @@
__new hunk__
45    repository: string;
46    title: string;
47 +  description: string;
48 +  labels: string[];
49 +  status: 'open' | 'closed';`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([{ start: 47, end: 49 }]);
    });

    it('should extract non-consecutive line additions', () => {
        const diff = `@@ -10,7 +10,9 @@
__new hunk__
10    name: string;
11 +  email: string;
12    age: number;
13 +  phone: string;
14    active: boolean;
15 +  role: string;`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([
            { start: 11, end: 11 },
            { start: 13, end: 13 },
            { start: 15, end: 15 }
        ]);
    });

    it('should handle new file additions', () => {
        const diff = `@@ -0,0 +1,5 @@
__new hunk__
1 +export interface Config {
2 +  name: string;
3 +  version: string;
4 +  description: string;
5 +}`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([{ start: 1, end: 5 }]);
    });

    it('should handle large deletions (no additions)', () => {
        const diff = `@@ -150,25 +150,0 @@
__new hunk__
150 -  @Delete(':id')
151 -  @UseGuards(AdminGuard)`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([]);
    });

    it('should handle complex file with multiple scattered changes', () => {
        const diff = `@@ -10,7 +10,7 @@
__new hunk__
10  import { FormControl } from "@components/ui/form-control";
13 +import { SvgKody, SvgLogo } from "@components/ui/icons";

@@ -45,12 +45,14 @@
__new hunk__
45    repository: string;
47 +  description: string;
48 +  labels: string[];
52 +  status: 'open' | 'closed' | 'merged';
56 +    avatar_url: string;

@@ -100,15 +100,15 @@
__new hunk__
100 +  const [searchQuery, setSearchQuery] = useState('');
104 +  const debouncedSearch = useDebounce(searchQuery, 300);
108 +  const filteredPRs = useMemo(() => {`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([
            { start: 13, end: 13 },
            { start: 47, end: 48 },
            { start: 52, end: 52 },
            { start: 56, end: 56 },
            { start: 100, end: 108 }
        ]);
    });

    it('should handle empty diff', () => {
        const result = extractLinesFromDiffHunk('');
        expect(result).toEqual([]);
    });

    it('should ignore old hunk lines', () => {
        const diff = `@@ -10,6 +10,7 @@
__new hunk__
10 +const value = 1;
__old hunk__
- const value = 0;`;

        const result = extractLinesFromDiffHunk(diff);
        expect(result).toEqual([{ start: 10, end: 10 }]);
    });
});

// ============================================================================
// 高级功能: processPatch 测试
// ============================================================================

describe('PatchProcessor - processPatch', () => {
    it('should process complete patch', () => {
        const patch = `@@ -10,6 +10,7 @@
   const items = [];
+  const error = null;
   const [data, setData] = useState(null);`;

        const result = processPatch(patch, 'src/index.js', 'modified');
        
        expect(result.patch).toContain('## file: \'src/index.js\'');
        expect(result.patch).toContain('11 +  const error = null;');
        expect(result.modifiedRanges).toEqual([{ start: 11, end: 11 }]);
        expect(result.hunks.length).toBeGreaterThan(0);
        expect(result.stats.totalAdditions).toBe(1);
        expect(result.stats.estimatedTokens).toBeGreaterThan(0);
    });

    it('should return empty result for patch with only deletions', () => {
        const patch = `@@ -10,6 +10,5 @@
   const items = [];
-  const oldState = null;`;

        const result = processPatch(patch, 'src/index.js', 'modified', {
            removeDeletionsOnly: true
        });
        
        expect(result.patch).toBe('');
        expect(result.modifiedRanges).toEqual([]);
    });
});

// ============================================================================
// 辅助功能: filterSuggestionsByDiff 测试
// ============================================================================

describe('PatchProcessor - filterSuggestionsByDiff', () => {
    const patchWithLinesStr = `## file: 'src/index.js'

@@ -10,6 +10,7 @@
__new hunk__
10  const items = [];
11 +const error = null;
12  const [data, setData] = useState(null);`;

    it('should keep suggestions within modified range', () => {
        const suggestions: Suggestion[] = [
            {
                id: '1',
                relevantLinesStart: 11,
                relevantLinesEnd: 11,
                label: 'bug'
            },
            {
                id: '2',
                relevantLinesStart: 10,
                relevantLinesEnd: 10,
                label: 'refactoring'
            },
            {
                id: '3',
                relevantLinesStart: 100,
                relevantLinesEnd: 100,
                label: 'security'
            }
        ];

        const result = filterSuggestionsByDiff(patchWithLinesStr, suggestions);
        
        expect(result).toHaveLength(2);
        expect(result.map(s => s.id)).toEqual(['1', '2']);
    });

    it('should use tolerance when specified', () => {
        const suggestions: Suggestion[] = [
            {
                id: '1',
                relevantLinesStart: 13,
                relevantLinesEnd: 13,
                label: 'bug'
            },
            {
                id: '2',
                relevantLinesStart: 15,
                relevantLinesEnd: 15,
                label: 'refactoring'
            }
        ];

        // 修改范围是 11
        const result = filterSuggestionsByDiff(patchWithLinesStr, suggestions, {
            tolerance: 2
        });
        
        // tolerance=2, 修改范围=11, 应该接受 13 (11+2), 但拒绝 15 (11+2<15)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('should require fully in range when specified', () => {
        const suggestions: Suggestion[] = [
            {
                id: '1',
                relevantLinesStart: 11,
                relevantLinesEnd: 11,
                label: 'bug'
            },
            {
                id: '2',
                relevantLinesStart: 11,
                relevantLinesEnd: 15,
                label: 'refactoring'
            }
        ];

        const result = filterSuggestionsByDiff(patchWithLinesStr, suggestions, {
            requireFullyInRange: true
        });
        
        // 只有 suggestion 1 完全在范围内
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });
});

// ============================================================================
// 辅助功能: validatePatchFormat 测试
// ============================================================================

describe('PatchProcessor - validatePatchFormat', () => {
    it('should validate correct patch', () => {
        const patch = `@@ -10,6 +10,7 @@
__new hunk__
10 +const value = 1;`;

        const result = validatePatchFormat(patch);
        
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should detect missing hunk header', () => {
        const patch = `10 +const value = 1;`;

        const result = validatePatchFormat(patch);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('缺少 hunk header (@@ -X +Y @@)');
    });

    it('should detect invalid line numbers', () => {
        const patch = `@@ -10,6 +10,7 @@
__new hunk__
0 +const value = 1;
-5 +const invalid = 0;`;

        const result = validatePatchFormat(patch);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('无效的行号: 0');
        expect(result.errors).toContain('无效的行号: -5');
    });

    it('should warn about non-increasing line numbers', () => {
        const patch = `@@ -10,6 +10,7 @@
__new hunk__
10 +const value = 1;
9 +const invalid = 0;`;

        const result = validatePatchFormat(patch);
        
        expect(result.isValid).toBe(true);  // 不是错误，只是警告
        expect(result.warnings).toContain('行号未递增: 10 -> 9');
    });
});

// ============================================================================
// 辅助功能: calculateDiffStats 测试
// ============================================================================

describe('PatchProcessor - calculateDiffStats', () => {
    it('should calculate diff stats', () => {
        const patch = `diff --git a/src/index.js b/src/index.js
@@ -10,6 +10,7 @@
   const items = [];
+  const error = null;
-  const oldState = null;`;

        const result = calculateDiffStats(patch);
        
        expect(result.additions).toBe(1);
        expect(result.deletions).toBe(1);
        expect(result.files).toBe(1);
        expect(result.hunks).toBe(1);
    });

    it('should count multiple hunks', () => {
        const patch = `@@ -10,6 +10,7 @@
+  const error = null;

@@ -25,4 +25,6 @@
+  const multiplier = 2;
+  const result = 0;`;

        const result = calculateDiffStats(patch);
        
        expect(result.additions).toBe(3);
        expect(result.hunks).toBe(2);
    });
});

// ============================================================================
// 辅助功能: visualizePatch 和 formatAnnotatedPatch 测试
// ============================================================================

describe('PatchProcessor - visualizePatch & formatAnnotatedPatch', () => {
    it('should visualize patch with modified ranges', () => {
        const fileContent = `const items = [];
const error = null;
const [data, setData] = useState(null);`;

        const modifiedRanges = [{ start: 2, end: 2 }];

        const result = visualizePatch(fileContent, modifiedRanges);
        
        expect(result).toHaveLength(3);
        expect(result[0].isModified).toBe(false);
        expect(result[1].isModified).toBe(true);
        expect(result[1].reason).toBe('在修改范围内');
    });

    it('should format annotated patch', () => {
        const fileContent = `const items = [];
const error = null;`;

        const modifiedRanges = [{ start: 2, end: 2 }];
        const annotated = visualizePatch(fileContent, modifiedRanges);

        const result = formatAnnotatedPatch(annotated, false);
        
        expect(result).toContain('   1: const items = [];');
        expect(result).toContain('>>> 2: const error = null;');
    });

    it('should use colors when formatting', () => {
        const fileContent = `const error = null;`;

        const modifiedRanges = [{ start: 1, end: 1 }];
        const annotated = visualizePatch(fileContent, modifiedRanges);

        const result = formatAnnotatedPatch(annotated, true);
        
        expect(result).toContain('\x1b[32m');  // ANSI green color code
    });
});

// ============================================================================
// 边界情况测试
// ============================================================================

describe('PatchProcessor - Edge Cases', () => {
    it('should handle empty patch', () => {
        const result = handlePatchDeletions('', 'src/index.js', 'modified');
        expect(result).toBe('');
    });

    it('should handle patch with no hunks', () => {
        const patch = `diff --git a/src/index.js b/src/index.js`;

        const result = handlePatchDeletions(patch, 'src/index.js', 'modified');
        expect(result).toBe('');
    });

    it('should handle patch with only context lines', () => {
        const patch = `@@ -10,6 +10,6 @@
   const items = [];
   const [data, setData] = useState(null);`;

        const result = handlePatchDeletions(patch, 'src/index.js', 'modified');
        // 没有 '+' 或 '-' 行，应该返回空
        expect(result).toBe('');
    });

    it('should handle patch with only additions (new file)', () => {
        const patch = `@@ -0,0 +1,5 @@
+export interface Config {
+  name: string;
+  version: string;
+  description: string;
+}`;

        const result = handlePatchDeletions(patch, 'src/config.ts', 'added');
        expect(result).toContain('+export interface Config {');
    });

    it('should handle patch with only deletions (deleted file)', () => {
        const patch = `@@ -1,5 +0,0 @@
-export interface Config {
-export  name: string;
-}`;

        const result = handlePatchDeletions(patch, 'src/config.ts', 'removed');
        // 只有删除，应该返回空
        expect(result).toBe('');
    });

    it('should handle patch with special characters', () => {
        const patch = `@@ -10,6 +10,7 @@
+const regex = /\\d+/;
+const template = \`Hello \${name}\`;`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        expect(result).toContain('+const regex = /\\d+/;');
        expect(result).toContain('+const template = \`Hello \${name}\`;');
    });

    it('should handle patch with tabs', () => {
        const patch = `@@ -10,6 +10,7 @@
+\tconst value = 0;`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        expect(result).toContain('\tconst value = 0;');
    });

    it('should handle very large patch', () => {
        const lines = [];
        for (let i = 1; i <= 10000; i++) {
            if (i % 100 === 0) {
                lines.push(`+const line${i} = ${i};`);
            } else {
                lines.push(`  const line${i} = ${i};`);
            }
        }

        const patch = `@@ -1,10000 +1,10000 @@
${lines.join('\n')}`;

        const start = Date.now();
        const result = processPatch(patch, 'src/large.ts', 'modified');
        const duration = Date.now() - start;

        expect(result.stats.totalAdditions).toBe(100);
        expect(duration).toBeLessThan(1000);  // 应该在 1 秒内完成
    });

    it('should handle patch with unicode characters', () => {
        const patch = `@@ -10,6 +10,7 @@
+const message = '你好世界';
+const emoji = '🚀';`;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        expect(result).toContain('+const message = \'你好世界\';');
        expect(result).toContain('+const emoji = \'🚀\';');
    });

    it('should handle patch with trailing whitespace', () => {
        const patch = `@@ -10,6 +10,7 @@
+const value = 1;   `;

        const result = convertToHunksWithLinesNumbers(patch, { filename: 'src/index.js' });
        expect(result).toContain('+const value = 1;   ');
    });
});

// ============================================================================
// 性能测试
// ============================================================================

describe('PatchProcessor - Performance', () => {
    it('should process 1000 hunks efficiently', () => {
        const hunkStrings = [];
        for (let i = 0; i < 1000; i++) {
            const lineNum = i * 10 + 10;
            hunkStrings.push(`@@ -${lineNum},6 +${lineNum},7 @@`);
            hunkStrings.push(`+const line${i} = ${i};`);
        }

        const patch = hunkStrings.join('\n');

        const start = Date.now();
        const result = processPatch(patch, 'src/performance.ts', 'modified');
        const duration = Date.now() - start;

        expect(result.stats.totalHunks).toBe(1000);
        expect(duration).toBeLessThan(5000);  // 应该在 5 秒内完成
    });

    it('should extract ranges from 1000 hunks efficiently', () => {
        const hunkStrings = [];
        for (let i = 0; i < 1000; i++) {
            const lineNum = i * 10 + 10;
            hunkStrings.push(`@@ -${lineNum},6 +${lineNum},7 @@`);
            hunkStrings.push('__new hunk__');
            hunkStrings.push(`${lineNum} +const line${i} = ${i};`);
        }

        const patchWithLinesStr = hunkStrings.join('\n');

        const start = Date.now();
        const result = extractLinesFromDiffHunk(patchWithLinesStr);
        const duration = Date.now() - start;

        expect(result).toHaveLength(1000);
        expect(duration).toBeLessThan(1000);  // 应该在 1 秒内完成
    });
});
