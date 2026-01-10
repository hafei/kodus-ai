# Kodus AI API 调用完整指南

本文档详细说明如何通过API调用Kodus AI进行代码审查，特别是如何获取认证token和构造测试用的Diff。

## 目录

- [一、获取认证Token](#一获取认证token)
    - [1.1 注册新用户](#11-注册新用户)
    - [1.2 登录获取Token](#12-登录获取token)
- [二、准备测试数据](#二准备测试数据)
    - [2.1 获取仓库信息](#21-获取仓库信息)
    - [2.2 构造测试用的Diff](#22-构造测试用的diff)
- [三、代码审查流程](#三代码审查流程)
    - [3.1 创建Dry Run](#31-创建dry-run)
    - [3.2 查看Dry Run结果](#32-查看dry-run结果)
    - [3.3 查看审查事件](#33-查看审查事件)
    - [3.4 通过实际PR触发审查](#34-通过实际pr触发审查)
- [四、配置审查规则](#四配置审查规则)
- [五、调试技巧](#五调试技巧)

---

## 一、获取认证Token

### 1.1 注册新用户

**端点**：`POST /auth/signup`

**请求示例**：

```bash
curl -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@kodus.dev",
    "password": "TestPass123456"
  }'
```

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 用户名称 |
| email | string | ✅ | 邮箱地址（必须是唯一值） |
| password | string | ✅ | 密码（至少8位，需包含大小写字母、小写字母、数字） |
| organizationId | string | ❌ | 组织ID（可选） |

**响应示例**：

```json
{
    "uuid": "550e8400-e29b-41d4-a7c6-5e8ec9",
    "email": "test@kodus.dev",
    "name": "Test User",
    "role": "contributor",
    "status": "pending",
    "organization": {
        "uuid": "abc123-def456-7890-xyz123"
    }
}
```

### 1.2 登录获取Token

**端点**：`POST /auth/login`

**请求示例**：

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@kodus.dev",
    "password": "TestPass123456"
  }'
```

**响应示例**：

```json
{
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "uuid": "550e8400-e29b-41d4-a7c6-5e8ec9",
        "email": "test@kodus.dev",
        "name": "Test User",
        "role": "contributor"
    }
}
```

**重要**：

- `accessToken` 用于所有后续API调用的认证
- 使用方式：`Authorization: Bearer YOUR_ACCESS_TOKEN`
- 保存这两个token到环境变量方便后续使用

**设置环境变量**：

```bash
# 保存token到环境变量（Mac/Linux）
export ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 或者保存到文件
echo "export ACCESS_TOKEN=\"$ACCESS_TOKEN\"" > ~/.kodus-api-token
echo "export REFRESH_TOKEN=\"$REFRESH_TOKEN\"" >> ~/.kodus-api-token
source ~/.kodus-api-token
```

---

## 二、准备测试数据

### 2.1 获取仓库信息

在调用审查API之前，你需要获取仓库的UUID。通过你的GitHub App集成获取，或者通过Kodus Cloud UI查看。

**方法一：通过Kodus Cloud UI**（推荐）

1. 访问 https://app.kodus.io
2. 登录你的账户
3. 进入你的组织设置
4. 查看"代码库"（Code Base）或"仓库"（Repositories）部分
5. 找到你要测试的仓库
6. 复制仓库UUID

**方法二：通过API获取（如果已有权限）**

你需要先通过认证获取仓库列表。但通常仓库列表是组织级别的，需要正确的权限设置。

**注意**：仓库UUID是必须的参数，格式类似：`abc123-def456-7890-xyz123`

### 2.2 构造测试用的Diff

#### 方法一：创建实际Diff（推荐用于真实测试）

```bash
# 1. 创建测试分支和文件
git checkout -b main
git checkout -b test/code-review

# 2. 创建一个包含"问题"的文件
cat > src/with-security-issue.ts << 'EOF'
// 硬编码的API密钥 - 安全问题
const API_KEY = 'sk-1234567890abcdef';

export function getApiKey() {
    return API_KEY;
}
EOF

# 3. 提交"有问题"的代码
git add .
git commit -m "feat: add hardcoded API key"

# 4. 推送到GitHub
git push origin test/code-review

# 5. 在GitHub上创建PR
# Base: main → Compare: test/code-review
# 这会触发Kodus的GitHub Webhook，自动开始审查
```

#### 方法二：手动构造Diff Patch（适合理解机制）

创建一个标准的Git diff格式文件，Kodus会解析它：

**Diff格式结构**：

```diff
diff --git a/main/src/user.ts b/feature/src/user.ts
index abc123..def456 100644
--- a/main/src/user.ts
+++ b/feature/src/user.ts
@@ -27,7 +27,7 @@
 import { User } from './user.interface';
+import { Logger } from '@kodus/flow';

 export class UserService {
     constructor(private logger: Logger) {
+        this.logger.log('Service initialized');
     }
}
```

**关键格式说明**：

- `@@ -old_start,old_len +new_start,new_len @@` - Hunk头部，说明行号和变化量
- `---` - 旧版本文件的路径
- `+++` - 新版本文件的路径
- `-` - 删除的行
- `+` - 添加的行
- ` ` - 空格，不变的行
- 行号：从hunk头部开始计算

**保存Diff文件**：

```bash
cat > test-diff.patch << 'EOF'
diff --git a/main/src/service.ts b/feature/src/service.ts
index 1234567..8910abc 100644
--- a/main/src/service.ts
+++ b/feature/src/service.ts
@@ -1,3 +1,4 @@
 export function process() {
-    console.log("Processing...");
+    console.log("Starting process...");
+    console.log("Done!");
 }
EOF
```

**行号计算说明**：

- Hunk头部：`@@ -1,3 +1,4 @@` 表示：
    - 旧版本：第1行开始，共3行
    - 新版本：第4行开始，共4行
- 因此：
    - 删除的行：`1, 2, 3`（对应diff中的 `-` 行）
    - 添加的行：`4, 5, 6`（对应diff中的 `+` 行）
    - 新代码相对于文件的起始行号 = 4

**简化Diff用于测试**：

```diff
diff --git a/src/code.ts b/src/code.ts
index 000000..000001 100644
--- a/src/code.ts
+++ b/src/code.ts
@@ -1 +1 @@
-export function badFunction() {
-    return null;
-}
+export function badFunction() {
+    return null;
+}
+
+console.log("Added this line for testing");
```

---

## 三、代码审查流程

### 3.1 创建Dry Run

Dry Run是测试代码审查的推荐方式，不需要创建真实的PR。

**端点**：`POST /dry-run/execute`

**完整请求示例**：

```bash
curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "organizationId": "YOUR_ORG_UUID",
    "teamId": "YOUR_TEAM_UUID",
    "repositoryId": "YOUR_REPO_UUID",
    "prNumber": 123,
    "baseBranch": "main",
    "headBranch": "feature/test-review",
    "commitId": "abc1234567890def"
  }'
```

**请求参数说明**：

| 参数           | 类型   | 必填 | 说明                                         |
| -------------- | ------ | ---- | -------------------------------------------- |
| organizationId | string | ✅   | 组织UUID（从Kodus Cloud获取）                |
| teamId         | string | ❌   | 团队UUID（可选，使用组织级别的审查可以不填） |
| repositoryId   | string | ✅   | 仓库UUID（从Kodus Cloud获取）                |
| prNumber       | number | ✅   | PR编号（如123）                              |
| baseBranch     | string | ✅   | 基础分支（如"main"）                         |
| headBranch     | string | ✅   | 特性分支（如"feature/test-review"）          |
| commitId       | string | ❌   | 提交SHA（可选，用于精确控制）                |

**响应示例**：

```json
{
    "uuid": "dry-run-uuid-12345",
    "status": "queued",
    "dryRunType": "pullRequest",
    "result": null,
    "createdAt": "2026-01-04T05:00:00.000Z"
}
```

**可能的状态**：

- `queued` - 已排队，等待处理
- `processing` - 正在处理
- `completed` - 已完成，有结果
- `failed` - 失败，有错误信息

### 3.2 查看Dry Run结果

**端点**：`GET /dry-run/:correlationId`

```bash
# 使用上一步返回的correlationId
CORRELATION_ID="dry-run-uuid-12345"

curl -X GET http://localhost:3001/dry-run/$CORRELATION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**响应示例（已完成状态）**：

```json
{
    "uuid": "dry-run-uuid-12345",
    "status": "completed",
    "dryRunType": "pullRequest",
    "result": {
        "validSuggestions": [
            {
                "relevantFile": "src/service/user.ts",
                "language": "typescript",
                "suggestionContent": "在 authenticate() 方法中硬编码了令牌，存在安全风险。",
                "existingCode": "return 'token-12345';",
                "improvedCode": "return this.getToken();",
                "oneSentenceSummary": "移除硬编码的认证令牌",
                "relevantLinesStart": "45",
                "relevantLinesEnd": "45",
                "label": "security",
                "llmPrompt": "用于LLM的提示词"
            }
        ],
        "discardedSuggestions": []
    }
}
```

**返回结果说明**：

| 字段                                         | 说明                                              |
| -------------------------------------------- | ------------------------------------------------- |
| validSuggestions                             | 有效的建议列表，用于创建PR评论                    |
| discardedSuggestions                         | 被丢弃的建议（如重复、不相关）                    |
| result.validSuggestions[]                    | 建议对象数组                                      |
| result.validSuggestions[].relevantFile       | 文件路径                                          |
| result.validSuggestions[].language           | 编程语言                                          |
| result.validSuggestions[].suggestionContent  | 详细建议内容                                      |
| result.validSuggestions[].existingCode       | 原代码                                            |
| result.validSuggestions[].improvedCode       | 改进后的代码                                      |
| result.validSuggestions[].oneSentenceSummary | 一句话总结                                        |
| result.validSuggestions[].relevantLinesStart | 建议起始行号                                      |
| result.validSuggestions[].relevantLinesEnd   | 建议结束行号                                      |
| result.validSuggestions[].label              | 分类标签（security/error_handling/refactoring等） |

### 3.3 查看审查事件

**端点**：`GET /dry-run/:correlationId/events`

```bash
curl -X GET http://localhost:3001/dry-run/$CORRELATION_ID/events \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**响应示例**：

```json
{
    "events": [
        {
            "id": "event-123",
            "dryRunId": "dry-run-uuid-12345",
            "eventType": "DRY_RUN_CREATED",
            "message": "Dry run created",
            "createdAt": "2026-01-04T05:00:00.000Z"
        },
        {
            "id": "event-124",
            "dryRunId": "dry-run-uuid-12345",
            "eventType": "FILE_ANALYSIS_STARTED",
            "message": "Started analyzing files",
            "createdAt": "2026-01-04T05:01:23.456Z"
        },
        {
            "id": "event-125",
            "dryRunId": "dry-run-uuid-12345",
            "eventType": "LLM_ANALYSIS_STARTED",
            "message": "Started LLM analysis",
            "createdAt": "2026-01-04T05:05:00.000Z"
        }
    ]
}
```

**事件类型**：

- `DRY_RUN_CREATED` - Dry Run创建
- `FILE_ANALYSIS_STARTED` - 文件分析开始
- `LLM_ANALYSIS_STARTED` - LLM分析开始
- `LLM_ANALYSIS_COMPLETED` - LLM分析完成
- `SUGGESTIONS_GENERATED` - 建议生成完成
- `DRY_RUN_COMPLETED` - Dry Run完成

### 3.4 通过实际PR触发审查

如果你创建了真实的GitHub PR，Kodus会自动通过Webhook处理。你也可以手动触发：

**端点**：`POST /code-management/integration`（平台集成端点）

```bash
curl -X POST http://localhost:3001/code-management/integration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "platform": "github",
    "repositoryId": "YOUR_REPO_UUID",
    "accessToken": "YOUR_GITHUB_PAT",
    "settings": {
      "webhookUrl": "https://your-ngrok-url.github/webhook",
      "events": ["pull_request", "push"]
    }
  }'
```

这会配置GitHub Webhook，之后创建的PR会自动触发Kodus审查。

---

## 四、配置审查规则

### 4.1 创建自定义Kody Rules

**端点**：`POST /kodyRules`

```bash
curl -X POST http://localhost:3001/kodyRules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "title": "安全最佳实践",
    "description": "确保代码遵循安全最佳实践",
    "language": "typescript",
    "rule": {
      "title": "安全检查",
      "content": "扫描代码中是否包含硬编码的API密钥、令牌、密码或其他敏感信息。不要在代码中硬编码任何凭据。",
      "severity": "critical",
      "category": "security"
    }
  }'
```

**请求参数说明**：

| 参数          | 类型   | 必填 | 说明                                          |
| ------------- | ------ | ---- | --------------------------------------------- |
| title         | string | ✅   | 规则标题                                      |
| description   | string | ✅   | 规则描述                                      |
| language      | string | ❌   | 编程语言（可选）                              |
| rule.title    | string | ✅   | 规则标题                                      |
| rule.content  | string | ✅   | 规则内容                                      |
| rule.severity | string | ✅   | 严重程度（critical/high/medium/low）          |
| rule.category | string | ✅   | 分类（security/error_handling/refactoring等） |

### 4.2 配置BYOK模型（自定义LLM）

**端点**：`PATCH /organization/parameters/code-review`

```bash
curl -X PATCH http://localhost:3001/organization/parameters/code-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "configValue": {
      "byokConfig": {
        "main": {
          "provider": "openai_compatible",
          "apiKey": "your-api-key",
          "model": "deepseek-chat",
          "baseURL": "https://api.deepseek.com"
        }
      }
    }
  }'
```

**支持的Provider类型**：

- `openai` - OpenAI官方
- `openai_compatible` - 任何OpenAI兼容API
- `anthropic` - Anthropic (Claude)
- `google_gemini` - Google Gemini
- `google_vertex` - Google Vertex AI
- `open_router` - OpenRouter聚合
- `novita` - Novita AI

---

## 五、调试技巧

### 5.1 查看实时日志

```bash
# 查看API日志
docker logs -f kodus_api

# 查看Worker日志
docker logs -f kodus_worker

# 查看Webhook日志
docker logs -f kodus_webhooks
```

### 5.2 启用详细日志

在 `.env` 文件中设置：

```env
API_LOG_LEVEL=debug
API_LOG_PRETTY=true
```

### 5.3 验证配置

```bash
# 检查BYOK配置
curl -X GET http://localhost:3001/organization/parameters/code-review \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.configValue.byokConfig'

# 检查Kody Rules
curl -X GET http://localhost:3001/kodyRules \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.[] | .title, .rule.severity'
```

### 5.4 常见错误和解决方案

**错误1：401 Unauthorized**

```json
{
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "api.users.unauthorized"
}
```

**原因**：

- Token已过期
- Token无效
- 用户没有权限

**解决方案**：

```bash
# 重新登录获取新token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}'

# 更新环境变量
export ACCESS_TOKEN="新的token"
```

**错误2：400 Bad Request**

```json
{
    "statusCode": 400,
    "error": "Bad Request",
    "message": "password is not strong enough"
}
```

**原因**：

- 密码不符合强度要求
- 缺少必填字段
- 参数格式错误

**解决方案**：

- 使用强密码（至少8位，包含大小写字母、小写字母、数字）
- 检查请求参数是否完整

**错误3：404 Not Found**

```json
{
    "statusCode": 404,
    "path": "/organization/parameters/code-review",
    "error": "Not Found"
}
```

**原因**：

- 组织或仓库不存在
- URL路径错误

**解决方案**：

- 检查organizationId和repositoryId是否正确
- 确认你是否有该组织的访问权限

### 5.5 完整的测试脚本示例

**创建测试用户和获取Token**：

```bash
#!/bin/bash

# 设置API基础URL
API_BASE="http://localhost:3001"

echo "=== 步骤1: 注册新用户 ==="
REGISTER_RESPONSE=$(curl -s -X POST $API_BASE/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Reviewer",
    "email": "test-reviewer-'$(date +%s)'@kodus.dev",
    "password": "TestPass12345!"
  }' | python3 -m json.tool)

echo "注册响应："
echo "$REGISTER_RESPONSE" | python3 -m json.tool

# 提取user UUID和email
USER_EMAIL="test-reviewer-'$(date +%s)'@kodus.dev"

echo ""
echo "=== 步骤2: 登录获取Token ==="
LOGIN_RESPONSE=$(curl -s -X POST $API_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"password\": \"TestPass12345!\"
  }" | python3 -m json.tool)

echo "登录响应："
echo "$LOGIN_RESPONSE" | python3 -m json.tool

# 提取AccessToken和RefreshToken
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['accessToken'])")
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['refreshToken'])")

echo ""
echo "✅ Access Token: $ACCESS_TOKEN"
echo "✅ Refresh Token: $REFRESH_TOKEN"
echo ""

# 保存到环境变量
export ACCESS_TOKEN="$ACCESS_TOKEN"
export REFRESH_TOKEN="$REFRESH_TOKEN"

# 现在可以使用这些token进行后续API调用
```

**创建Dry Run测试**：

```bash
#!/bin/bash

# 确保已设置ACCESS_TOKEN
if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ 错误: ACCESS_TOKEN未设置"
  echo "请先运行注册和登录脚本"
  exit 1
fi

API_BASE="http://localhost:3001"

# 设置测试参数（需要从Kodus Cloud获取）
ORG_ID="your-org-uuid-here"
TEAM_ID=""  # 可选
REPO_ID="your-repo-uuid-here"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/test-review"
COMMIT_ID="abc1234567890def"  # 可选

echo "=== 创建Dry Run ==="

DRY_RUN_RESPONSE=$(curl -s -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\",
    \"commitId\": \"$COMMIT_ID\"
  }" | python3 -m json.tool)

echo "Dry Run创建响应："
echo "$DRY_RUN_RESPONSE" | python3 -m json.tool

# 提取correlationId
CORRELATION_ID=$(echo "$DRY_RUN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['uuid'])")

echo ""
echo "✅ Dry Run ID: $CORRELATION_ID"
echo "等待处理..."
echo ""

# 等待几秒让系统处理
sleep 5

echo "=== 查看Dry Run状态 ==="

STATUS_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$CORRELATION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool)

echo "状态响应："
echo "$STATUS_RESPONSE" | python3 -m json.tool

# 提取状态
STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'unknown'))")

echo ""
if [ "$STATUS" = "completed" ]; then
  echo "✅ Dry Run已完成！"
  echo ""
  echo "=== 查看审查结果 ==="

  RESULT_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$CORRELATION_ID \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool)

  echo "$RESULT_RESPONSE" | python3 -m json.tool

  # 提取建议数量
  SUGGESTION_COUNT=$(echo "$RESULT_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('result', {}).get('validSuggestions', [])))")

  echo "✅ 生成了 $SUGGESTION_COUNT 条建议"
else
  echo "⏳ Dry Run状态: $STATUS"
  echo "可以使用以下命令继续查看："
  echo "curl -X GET $API_BASE/dry-run/$CORRELATION_ID -H \"Authorization: Bearer $ACCESS_TOKEN\""
fi
```

**手动创建Diff并测试**：

```bash
#!/bin/bash

API_BASE="http://localhost:3001"

# 确保已设置ACCESS_TOKEN
if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ 错误: ACCESS_TOKEN未设置"
  exit 1
fi

echo "=== 创建测试Diff文件 ==="

# 创建一个包含安全问题的diff
cat > test-security-diff.patch << 'EOF'
diff --git a/main/src/auth.ts b/feature/src/auth.ts
index abc123..def456 100644
--- a/main/src/auth.ts
+++ b/feature/src/auth.ts
@@ -10,7 +10,7 @@
 // 正常的认证逻辑
-function authenticate() {
+// 硬编码的密钥 - 安全问题
+const HARDCODED_API_KEY = "sk-1234567890abcdef";
+
 function authenticate() {
     const token = validateCredentials();
     return token;
-}
+}
 EOF

echo "✅ Diff文件已创建: test-security-diff.patch"
echo ""
echo "=== 使用Diff创建Dry Run ==="

# 注意：在实际API中，你需要通过其他方式上传diff
# 这里演示如何构造diff字符串

ORG_ID="your-org-uuid"
REPO_ID="your-repo-uuid"

curl -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": 999,
    \"commitId\": \"test-commit-$(date +%s)\"
  }" | python3 -m json.tool

echo "查看Dry Run结果以获取correlationId，然后可以查看详细建议"
```

**配置安全规则**：

```bash
#!/bin/bash

API_BASE="http://localhost:3001"

echo "=== 创建安全规则 ==="

curl -X POST $API_BASE/kodyRules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "title": "禁止硬编码凭据",
    "description": "代码中不应包含硬编码的API密钥、令牌、密码",
    "language": "typescript",
    "rule": {
      "title": "安全检查",
      "content": "检测代码中是否包含硬编码的敏感信息。所有凭据应该通过环境变量或配置文件管理。",
      "severity": "critical",
      "category": "security"
    }
  }' | python3 -m json.tool

echo ""
echo "✅ 安全规则已创建"
echo "之后创建的Dry Run会应用这个规则"
```

---

## 六、API端点速查表

### 认证相关

| 端点            | 方法 | 功能          | 认证 |
| --------------- | ---- | ------------- | ---- |
| `/auth/signup`  | POST | 注册新用户    |
| `/auth/login`   | POST | 登录获取token |
| `/auth/logout`  | POST | 登出          |
| `/auth/refresh` | POST | 刷新token     |

### 代码审查相关

| 端点                             | 方法 | 功能            | 认证 |
| -------------------------------- | ---- | --------------- | ---- |
| `/dry-run/execute`               | POST | 创建Dry Run     |
| `/dry-run/:correlationId`        | GET  | 查看Dry Run状态 |
| `/dry-run/:correlationId/events` | GET  | 查看审查事件    |
| `/code-management/integration`   | POST | 配置Webhook     |

### 配置相关

| 端点                                   | 方法      | 功能               | 认证 |
| -------------------------------------- | --------- | ------------------ | ---- |
| `/organization/parameters/code-review` | GET/PATCH | 配置BYOK模型       |
| `/kodyRules`                           | POST      | 创建自定义审查规则 |

### 仓库管理

| 端点                             | 方法 | 功能           | 认证 |
| -------------------------------- | ---- | -------------- | ---- |
| `/codeBase/analyze-dependencies` | POST | 分析依赖       |
| `/codeBase/content-from-diff`    | POST | 从diff获取内容 |

---

## 七、完整工作流程示例

### 示例1：测试Kodus能否检测安全问题

```bash
# 1. 创建测试用户和获取Token
./setup-user-and-login.sh

# 2. 创建安全规则
./create-security-rule.sh

# 3. 创建包含安全问题的测试Diff
# (实际项目中，这步通过真实PR完成)

# 4. 创建Dry Run来测试
./test-security-dry-run.sh

# 5. 查看结果
# 如果Kodus成功检测到硬编码问题，说明规则有效
```

### 示例2：自定义LLM模型

```bash
# 1. 登录获取Token
./setup-user-and-login.sh

# 2. 更新BYOK配置使用DeepSeek
./update-byok-config.sh

# 3. 创建Dry Run测试
./test-with-deepseek.sh
```

---

## 八、调试和排错

### 8.1 检查服务状态

```bash
# 健康检查
curl http://localhost:3001/health

# 查看Webhook状态
curl http://localhost:3001/webhook-health

# 查看Worker日志
docker logs kodus_worker --tail 50
```

### 8.2 查看审查历史

```bash
# 查看Dry Run历史
curl -X GET "http://localhost:3001/dry-run?teamId=$TEAM_ID&repositoryId=$REPO_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

# 查看特定的Dry Run
curl -X GET "http://localhost:3001/dry-run/$CORRELATION_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 8.3 测试Diff处理逻辑

创建一个简单的diff并手动验证Kodus的解析：

```bash
# 1. 创建测试diff
cat > simple-test.diff << 'EOF'
diff --git a/src/code.ts b/src/code.ts
@@ -1,3 +1,4 @@
 export function test() {
-    return "old value";
+    return "new value";
+    console.log("Added debug log");
 }
EOF

# 2. 使用Kodus的patch工具测试（如果可用）
# 或者直接在API中测试
```

---

## 总结

### 核心要点

1. **认证流程**：
    - 注册 → 登录 → 获取 accessToken
    - 使用 `Authorization: Bearer $TOKEN` 头进行API调用

2. **Dry Run机制**：
    - 最简单的方式测试代码审查
    - 不需要创建真实的GitHub PR
    - 提供完整的JSON格式建议结果

3. **参数要求**：
    - organizationId（组织UUID） - 必填
    - repositoryId（仓库UUID） - 必填
    - prNumber（PR编号） - 必填
    - baseBranch（基础分支） - 必填
    - headBranch（特性分支） - 必填

4. **调试方式**：
    - 查看Dry Run状态和事件
    - 查看容器日志
    - 启用debug日志模式

5. **高级功能**：
    - 创建自定义Kody Rules
    - 配置BYOK自定义LLM
    - 通过Webhook配置真实GitHub集成

### 快速开始

```bash
# 1. 注册用户
curl -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"MyUser","email":"myuser@test.dev","password":"MyPass123!"}'

# 2. 登录获取Token，保存到环境变量
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"myuser@test.dev","password":"MyPass123!"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['accessToken'])")

export ACCESS_TOKEN="$ACCESS_TOKEN"

# 3. 创建Dry Run
curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"organizationId":"YOUR_ORG_ID","repositoryId":"YOUR_REPO_ID","prNumber":123,"baseBranch":"main","headBranch":"test"}'

# 4. 查看结果
sleep 10
curl -X GET http://localhost:3001/dry-run/DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
