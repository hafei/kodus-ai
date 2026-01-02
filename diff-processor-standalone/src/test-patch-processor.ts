/**
 * 完整处理流程测试 - 模拟真实 PR
 * 运行: npm test
 */

import { DiffProcessor, FileInfo } from './patch-processor';

// ============================================================================
// 模拟真实 PR 数据
// ============================================================================

const mockFile: FileInfo = {
    filename: 'src/services/userService.ts',
    status: 'modified',
    patch: `@@ -10,12 +10,15 @@ import { Database } from '../database';
 import { Logger } from '../utils/logger';
 
 export class UserService {
-  private db: Database;
+  private readonly db: Database;
+  private readonly cache: Cache;
   
   constructor(db: Database) {
     this.db = db;
+    this.cache = new Cache();
   }
   
-  async getUser(id: string) {
+  async getUser(id: string): Promise<User | null> {
     const user = await this.db.findById(id);
+    this.cache.set(id, user);
     return user;
   }
@@ -30,8 +33,6 @@ export class UserService {
   async deleteUser(id: string) {
     await this.db.delete(id);
-    console.log('User deleted');
-    console.log('Cleanup done');
   }
 }`,
};

// 模拟完整文件内容
const mockFileContent = `import { Database } from '../database';
import { Logger } from '../utils/logger';
import { Cache } from '../utils/cache';

interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private readonly db: Database;
  private readonly cache: Cache;
  
  constructor(db: Database) {
    this.db = db;
    this.cache = new Cache();
  }
  
  async getUser(id: string): Promise<User | null> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    
    const user = await this.db.findById(id);
    this.cache.set(id, user);
    return user;
  }
  
  async createUser(data: Partial<User>): Promise<User> {
    const user = await this.db.create(data);
    this.cache.set(user.id, user);
    return user;
  }
  
  async deleteUser(id: string) {
    await this.db.delete(id);
    this.cache.delete(id);
  }
  
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.db.update(id, data);
    this.cache.set(id, user);
    return user;
  }
  
  // 这个函数调用了 getUser
  async getUserWithValidation(id: string): Promise<User | null> {
    if (!id) throw new Error('ID is required');
    return this.getUser(id);
  }
}

// 外部使用者
export async function fetchUserData(service: UserService, userId: string) {
  const user = await service.getUser(userId);
  return user;
}
`;

// ============================================================================
// 运行测试
// ============================================================================

async function main() {
    console.log('🚀 Kodus AI Diff 处理完整流程演示\n');
    console.log('模拟场景: 收到一个 PR，修改了 UserService 类\n');

    const processor = new DiffProcessor();

    // 处理 diff
    const context = await processor.process(
        mockFile,
        mockFileContent,
        true,  // 启用模拟 AST 分析
        true,  // 启用模拟 MCP 工具
    );

    // 打印所有处理步骤
    DiffProcessor.printSteps(context);

    // 额外的调试信息
    console.log('\n' + '='.repeat(80));
    console.log('📈 Token 优化分析');
    console.log('='.repeat(80));

    const originalPatchTokens = mockFile.patch?.length || 0;
    const processedTokens = context.patchWithLinesStr.length;
    const fileContentTokens = mockFileContent.length;
    const relevantContentTokens = context.relevantContent?.length || 0;

    console.log(`\n原始 Patch tokens:      ${originalPatchTokens}`);
    console.log(`处理后 Patch tokens:    ${processedTokens}`);
    console.log(`完整文件 tokens:        ${fileContentTokens}`);
    console.log(`相关代码 tokens:        ${relevantContentTokens}`);
    console.log(`\n文件内容节省:           ${Math.round((1 - relevantContentTokens / fileContentTokens) * 100)}%`);

    console.log('\n' + '='.repeat(80));
    console.log('🎯 LLM 最终接收的 Payload 结构');
    console.log('='.repeat(80));

    const llmPayload = {
        file: {
            filename: context.file.filename,
            language: 'typescript',
        },
        patchWithLinesStr: context.patchWithLinesStr,
        modifiedRanges: context.modifiedRanges,
        relevantContent: context.relevantContent?.substring(0, 200) + '...',
        impactAnalysis: context.impactAnalysis,
        contextEvidences: context.contextEvidences?.map(e => ({
            provider: e.provider,
            toolName: e.toolName,
            payloadPreview: JSON.stringify(e.payload).substring(0, 100) + '...',
        })),
    };

    console.log(JSON.stringify(llmPayload, null, 2));

    console.log('\n✅ 演示完成！');
    console.log('\n提示: 你可以修改 mockFile 和 mockFileContent 来测试不同的场景');
}

main().catch(console.error);
