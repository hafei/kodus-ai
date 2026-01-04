# 从GitHub PR获取信息并创建Dry Run

最简化的指南：如何从GitHub PR页面获取必要信息并创建Kodus Dry Run。

## 前提条件

1. **Kodus AI已启动**：确保 `http://localhost:3001/health` 返回正常
2. **有访问权限**：你的GitHub账号在Kodus组织中有访问权限
3. **有Kodus Token**：从 `/auth/login` 或 `/auth/signup` 获取 `accessToken`

---

## 步骤一：获取Kodus Token（如果还没有）

```bash
# 登录获取Token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your-password"}'

# 提取accessToken
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your-password"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('accessToken', ''))")

echo "✅ Access Token: $ACCESS_TOKEN"
```

---

## 步骤二：从GitHub PR页面获取信息

### 打开你的GitHub PR页面

在浏览器中访问：

```
https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/pull/PR_NUMBER
```

### 从页面复制以下信息

| 信息         | 在页面中的位置                        | 说明                                     |
| ------------ | ------------------------------------- | ---------------------------------------- |
| **PR编号**   | URL中 `/pull/123`                     | 整数（例如：123）                        |
| **Base分支** | 页面顶部显示（或右侧）                | 通常是 `main`                            |
| **Head分支** | 页面顶部显示（或右侧）                | 你的特性分支（例如：`feature/add-auth`） |
| **提交SHA**  | 页面标题下方（7位或40位）             | 可选，用于精确控制                       |
| **仓库名称** | URL中 `YOUR_USERNAME/YOUR_REPOSITORY` | 例如：`your-username/your-repo`          |
| **所有者**   | 页面右上角或标题旁                    | 用户名                                   |

### 重要说明

- ❌ **organizationId（组织UUID）** - 这个**必须**从Kodus Cloud获取，无法从GitHub获取
- ❌ **repositoryId（仓库UUID）** - 这个**必须**从Kodus Cloud获取，无法从GitHub获取
- ✅ **prNumber** - 从PR URL获取（例如：`123`）
- ✅ **baseBranch** - 从页面复制
- ✅ **headBranch** - 从页面复制
- ⚠️ **commitId** - 可选，一般不需要

**⚠️ 关键问题**：
如果你没有 `organizationId` 和 `repositoryId`，你**不能创建Dry Run**。这两个参数是必需的！

---

## 步骤三：解决organizationId和repositoryId问题

### 方案A：从Kodus Cloud获取（推荐）

1. 访问 https://app.kodus.io
2. 登录你的账户
3. 进入你的组织设置
4. 查看"代码库"（Code Base）或"仓库"（Repositories）
5. 找到你要测试的仓库
6. 复制以下信息：
    - **组织UUID**（organizationId）
    - **仓库UUID**（repositoryId）

### 方案B：查询Kodus API获取（如果可用）

如果你的Kodus账户有权限访问该组织，可以尝试：

```bash
# 查询组织仓库
curl -X GET http://localhost:3001/codeBase \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

# 查找你的仓库，获取repositoryId
```

---

## 步骤四：创建Dry Run（有了必需参数后）

```bash
# 设置变量（从Kodus Cloud或查询获取）
ORG_ID="your-org-uuid-from-kodus-cloud"  # 必需
REPO_ID="your-repo-uuid-from-kodus-cloud"  # 必需
PR_NUMBER=123  # 从GitHub PR页面获取
BASE_BRANCH="main"  # 从页面复制
HEAD_BRANCH="feature/test-review"  # 从页面复制
ACCESS_TOKEN="your-kodus-access-token-here"  # 从步骤一获取

# 创建Dry Run
echo "=== 创建Dry Run ==="

curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\"
  }" | python3 -m json.tool

echo ""
echo "Dry Run已创建，请记下返回的uuid"
echo ""
```

**响应示例**：

```json
{
    "uuid": "dry-run-uuid-abc123...",
    "status": "queued",
    "dryRunType": "pullRequest",
    "createdAt": "2026-01-04T05:00:00.000Z"
}
```

---

## 步骤五：查看Dry Run结果

```bash
# 等待几秒让系统处理
sleep 10

# 查看Dry Run状态
DRY_RUN_UUID="dry-run-uuid-abc123..."  # 从上一步响应中复制

curl -s -X GET http://localhost:3001/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

echo ""
echo "Dry Run状态："
echo "$STATUS_RESPONSE" | python3 -m json.tool
```

**可能的状态**：

- `queued` - 已排队，等待处理
- `processing` - 正在处理
- `completed` - 已完成
- `failed` - 失败

---

## 步骤六：查看审查结果（Dry Run完成后）

```bash
# 查看最终结果
curl -s -X GET http://localhost:3001/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

echo ""
echo "审查结果："
echo "$RESULT_RESPONSE" | python3 -m json.tool
```

**返回结果示例**：

```json
{
    "uuid": "dry-run-uuid-abc123...",
    "status": "completed",
    "dryRunType": "pullRequest",
    "result": {
        "validSuggestions": [
            {
                "relevantFile": "src/auth.ts",
                "language": "typescript",
                "suggestionContent": "在 authenticate() 方法中硬编码了令牌，存在安全风险。",
                "existingCode": "return 'token-123';",
                "improvedCode": "return this.getToken();",
                "oneSentenceSummary": "移除硬编码的认证令牌",
                "relevantLinesStart": "45",
                "relevantLinesEnd": "45",
                "label": "security"
            }
        ],
        "discardedSuggestions": []
    }
}
```

---

## 常见问题排查

### 问题1：400 Bad Request - "Organization UUID is missing"

**原因**：缺少 `organizationId` 或 `repositoryId`

**解决方案**：

1. 从Kodus Cloud获取组织ID和仓库ID（步骤三方案A）
2. 确认参数正确

### 问题2：PR没有代码变更

**原因**：

- PR中所有文件都被ignore规则过滤
- PR只有删除的文件，没有添加的文件

**验证**：

1. Dry Run状态为 `completed`，但 `validSuggestions` 为空
2. 查看 `result.discardedSuggestions` 是否有内容
3. 查看 `result.message` 是否有说明

### 问题3：Dry Run一直在 queued 或 processing 状态

**原因**：

- Worker服务未启动或繁忙
- Webhook未正确配置

**解决方案**：

```bash
# 查看服务状态
docker logs kodus_worker --tail 50
docker logs kodus_api --tail 50

# 重启服务
yarn dev:restart
```

---

## 完整的自动化脚本

```bash
#!/bin/bash

# ===== 配置部分 =====
ACCESS_TOKEN="your-kodus-access-token-here"
ORG_ID="your-org-uuid-here"
REPO_ID="your-repo-uuid-here"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/test-review"
API_BASE="http://localhost:3001"

# ===== 步骤1: 创建Dry Run =====
echo "=== 步骤1: 创建Dry Run ==="

RESPONSE=$(curl -s -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\"
  }" | python3 -m json.tool)

echo "响应："
echo "$RESPONSE" | python3 -m json.tool

# 提取Dry Run UUID
DRY_RUN_UUID=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('uuid', ''))")

if [ -z "$DRY_RUN_UUID" ]; then
  echo "❌ 错误：无法获取Dry Run UUID"
  exit 1
fi

echo "✅ Dry Run已创建，UUID: $DRY_RUN_UUID"
echo ""

# ===== 步骤2: 等待处理 =====
echo "等待系统处理Dry Run..."
sleep 10

# ===== 步骤3: 查看状态 =====
echo "=== 步骤3: 查看Dry Run状态 ==="

STATUS_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool)

echo "状态："
echo "$STATUS_RESPONSE" | python3 -m json.tool

# ===== 步骤4: 查看最终结果 =====
echo "等待完成..."
sleep 10

echo "=== 步骤4: 查看最终结果 ==="

RESULT_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool)

echo ""
echo "最终审查结果："
echo "$RESULT_RESPONSE" | python3 -m json.tool

# 提取并显示建议
SUGGESTIONS=$(echo "$RESULT_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); suggestions = data.get('result', {}).get('validSuggestions', []); [print(s.get('suggestionContent', '')) for s in suggestions]")

echo ""
if [ -z "$SUGGESTIONS" ]; then
  echo "⚠️  没有生成建议（可能是PR中没有代码变更）"
else
  echo "✅ 生成了 $(echo "$SUGGESTIONS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data))") 条建议"
fi
```

---

## 快速参考

### 从Kodus Cloud获取UUID的步骤

1. 登录 https://app.kodus.io
2. 进入组织 → 代码库
3. 找到你的仓库
4. 点击仓库进入详情页
5. 复制仓库UUID（通常在页面右侧或URL中）

### GitHub PR页面信息提取

打开你的PR页面：

```
https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/pull/123
```

需要从页面复制的信息：

- **PR编号**：URL中的数字
- **Base分支**：通常显示为"main"或"master"
- **Head分支**：你的特性分支名称
- **提交SHA**：可选，7位或40位十六进制

### Dry Run所需参数

| 参数           | 是否必需 | 说明                          |
| -------------- | -------- | ----------------------------- |
| organizationId | ✅ 必需  | 组织UUID（从Kodus Cloud获取） |
| repositoryId   | ✅ 必需  | 仓库UUID（从Kodus Cloud获取） |
| prNumber       | ✅ 必需  | PR编号（从GitHub PR页面获取） |
| baseBranch     | ✅ 必需  | 基础分支（从页面复制）        |
| headBranch     | ✅ 必需  | 特性分支（从页面复制）        |
| teamId         | ❌ 可选  | 团队UUID（组织级别可省略）    |
| commitId       | ❌ 可选  | 提交SHA（可选）               |

---

## 总结

### 核心要点

1. **必须的参数**：
    - `organizationId`（组织UUID）
    - `repositoryId`（仓库UUID）
    - `prNumber`（PR编号）
    - `baseBranch`（基础分支）
    - `headBranch`（特性分支）

2. **获取方式**：
    - **推荐**：从Kodus Cloud组织设置中获取
    - 位置：代码库 → 选择仓库 → 查看仓库详情
    - 仓库名称和UUID会显示在仓库详情页

3. **验证方法**：
    - 查看 `status` 是否为 `completed`
    - 检查 `result.validSuggestions` 是否有内容
    - 查看日志确认处理正常

4. **常见问题**：
    - 缺少organizationId或repositoryId → 从Kodus Cloud获取
    - PR没有代码变更 → validSuggestions为空
    - Dry Run一直queued → 检查Worker服务状态

### 关键文件位置

| 功能        | 文件路径                                                        |
| ----------- | --------------------------------------------------------------- |
| Dry Run创建 | `apps/api/src/controllers/dryRun.controller.ts`                 |
| Dry Run查询 | `libs/dryRun/application/use-cases/execute-dry-run.use-case.ts` |
| 组织管理    | `apps/api/src/controllers/organization.controller.ts`           |

### API端点

| 端点                  | 方法 | 功能         |
| --------------------- | ---- | ------------ |
| `/auth/login`         | POST | 获取Token    |
| `/dry-run/execute`    | POST | 创建Dry Run  |
| `/dry-run/:id`        | GET  | 查看Dry Run  |
| `/dry-run/:id/events` | GET  | 查看事件     |
| `/organization`       | GET  | 查看组织信息 |
| `/codeBase`           | GET  | 查看仓库列表 |

现在你有完整的流程和脚本，可以直接运行！
