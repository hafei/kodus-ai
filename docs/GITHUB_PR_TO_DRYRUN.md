# 从GitHub获取PR信息并创建Dry Run

本文档详细说明如何从GitHub PR中提取必要信息并构造Kodus Dry Run命令。

## 目录

- [一、方法一：从GitHub PR页面手动获取（最简单）](#一方法一从github-pr页面手动获取最简单)
- [二、方法二：通过GitHub API获取（更灵活）](#二方法二通过github-api获取更灵活)
- [三、方法三：通过Kodus API查询（如果有权限）](#三方法三通过kodus-api查询如果有权限)
- [四、构造Dry Run命令](#四构造dry-run命令)
- [五、常见问题](#五常见问题)

---

## 一、方法一：从GitHub PR页面手动获取（最简单）

### 1.1 步骤

#### 步骤1：打开GitHub PR页面

在浏览器中打开你的GitHub PR，例如：

```
https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/pull/123
```

#### 步骤2：获取信息

从PR页面中你可以直接看到以下信息：

**基本信息**：

- **PR编号**：从URL获取（例如 `/pull/123` → `prNumber: 123`）
- **PR标题**：页面顶部显示的标题
- **状态**：Open, Merged, Closed等

**分支信息**：

- **Base分支**：页面右侧或顶部显示（例如 `main`）
- **Head分支**：显示为 `feature/your-feature`
- **最新提交SHA**：页面显示的7位或40位SHA（例如 `abc1234567890def...`）

**仓库信息**：

- **仓库名称**：URL中的 `YOUR_USERNAME/YOUR_REPOSITORY`
- **所有者**：`YOUR_USERNAME`

#### 步骤3：查看变更文件（可选）

在PR页面中，点击"Files changed"标签，查看哪些文件被修改。

**用于验证**：

- 确认有需要审查的代码变更
- 确认分支名称正确

### 1.4 构造命令示例

**示例**：

```bash
# 假设从GitHub PR页面获取的信息：
# - 组织ID: "org-abc123-def456-7890-xyz"
# - 仓库ID: "repo-abc123-def456-7890-xyz"
# - PR编号: 123
# - Base分支: "main"
# - Head分支: "feature/test-review"
# - 提交SHA: "abc1234567890def"（可选）

# 创建Dry Run
curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "organizationId": "org-abc123-def456-7890-xyz",
    "teamId": "",
    "repositoryId": "repo-abc123-def456-7890-xyz",
    "prNumber": 123,
    "baseBranch": "main",
    "headBranch": "feature/test-review",
    "commitId": "abc1234567890def"
  }'
```

### 1.5 完整脚本示例

```bash
#!/bin/bash

# 设置变量（从GitHub PR页面手动填写）
ORG_ID="your-org-uuid-here"
REPO_ID="your-repo-uuid-here"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/test-review"
COMMIT_SHA="abc1234567890def"  # 可选
ACCESS_TOKEN="your-access-token-here"

# API基础URL
API_BASE="http://localhost:3001"

echo "=== 创建Dry Run ==="

# 调用Dry Run API
RESPONSE=$(curl -s -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\",
    \"commitId\": \"$COMMIT_SHA\"
  }")

echo "Dry Run响应："
echo "$RESPONSE" | python3 -m json.tool

# 提取correlationId用于后续查询
CORRELATION_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('uuid', ''))")

echo ""
echo "✅ Dry Run已创建，ID: $CORRELATION_ID"
echo ""
echo "=== 查看Dry Run状态 ==="
sleep 5

# 查看状态
curl -s -X GET $API_BASE/dry-run/$CORRELATION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

# 查看事件
echo ""
echo "=== 查看审查事件 ==="
curl -s -X GET $API_BASE/dry-run/$CORRELATION_ID/events \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

echo ""
echo "=== 查看最终结果 ==="
sleep 10

# 再次查看结果
curl -s -X GET $API_BASE/dry-run/$CORRELATION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool
```

---

## 二、方法二：通过GitHub API获取（更灵活）

### 2.1 步骤

#### 步骤1：获取GitHub Personal Access Token

1. 登录 GitHub
2. 进入 Settings → Developer settings → Personal access tokens
3. 生成新token，权限选择：`repo`（或 `public_repo`）
4. 复制token（只显示一次）

**注意**：将token保存在安全位置，不要泄露。

### 2.2 通过API获取PR详细信息

使用以下脚本获取PR信息：

```bash
#!/bin/bash

# 配置变量
GITHUB_TOKEN="your_github_token_here"
REPO_OWNER="your-username"
REPO_NAME="your-repo-name"
PR_NUMBER=123
ACCESS_TOKEN="your_kodus_access_token_here"

echo "=== 从GitHub获取PR信息 ==="

# 获取PR详细信息
PR_INFO=$(curl -s -X GET \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER")

echo "PR信息："
echo "$PR_INFO" | python3 -m json.tool

# 提取必要信息
PR_NUMBER_ACTUAL=$(echo "$PR_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('number', 0))")
BASE_BRANCH=$(echo "$PR_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('base', {}).get('ref', '').split('/')[-1])")
HEAD_BRANCH=$(echo "$PR_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('head', {}).get('ref', '').split('/')[-1])")
COMMIT_SHA=$(echo "$PR_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('head', {}).get('sha', ''))")

echo ""
echo "从GitHub提取的信息："
echo "  PR编号: $PR_NUMBER_ACTUAL"
echo "  Base分支: $BASE_BRANCH"
echo "  Head分支: $HEAD_BRANCH"
echo "  提交SHA: $COMMIT_SHA"
echo ""

# 现在需要获取组织ID和仓库ID
echo "⚠️  注意：还需要从Kodus Cloud获取 organizationId 和 repositoryId"
echo "    或者通过Kodus API查询"
echo ""

# 如果有organizationId和repositoryId，可以这样创建Dry Run：
# （下面的变量需要替换为实际值）

if [ ! -z "$ORG_ID" ] && [ ! -z "$REPO_ID" ]; then
  echo "=== 创建Dry Run（使用GitHub信息） ==="

  curl -s -X POST http://localhost:3001/dry-run/execute \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{
      \"organizationId\": \"$ORG_ID\",
      \"repositoryId\": \"$REPO_ID\",
      \"prNumber\": $PR_NUMBER_ACTUAL,
      \"baseBranch\": \"$BASE_BRANCH\",
      \"headBranch\": \"$HEAD_BRANCH\",
      \"commitId\": \"$COMMIT_SHA\"
    }" | python3 -m json.tool

  echo ""
  echo "✅ Dry Run已创建"
else
  echo "❌ 缺少organizationId或repositoryId，无法创建Dry Run"
fi
```

### 2.3 获取PR变更文件

如果你想验证PR中有哪些文件被修改：

```bash
#!/bin/bash

GITHUB_TOKEN="your_github_token_here"
REPO_OWNER="your-username"
REPO_NAME="your-repo-name"
PR_NUMBER=123

echo "=== 获取PR变更文件 ==="

# 获取变更文件列表
FILES_RESPONSE=$(curl -s -X GET \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/files")

echo "变更文件："
echo "$FILES_RESPONSE" | python3 -m json.tool

# 显示前10个文件
echo "$FILES_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f'{f[\"filename\"]}: {f.get(\"status\", \"\")} ({f.get(\"additions\", 0)} +, {f.get(\"deletions\", 0)}') for f in data[:10]]"
```

---

## 三、方法三：注意事项

### 3.1 查询组织下的仓库列表

如果你的Kodus账号可以访问该组织，可以通过API查询仓库信息：

```bash
#!/bin/bash

ACCESS_TOKEN="your_kodus_access_token_here"

echo "=== 查询组织仓库 ==="

# 查询组织下的仓库
REPOS_RESPONSE=$(curl -s -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:3001/codeBase"

echo "仓库列表："
echo "$REPOS_RESPONSE" | python3 -m json.tool

# 查找你的目标仓库
# 注意：你需要根据仓库名称或URL找到对应的repositoryId
```

### 3.2 查询特定PR

```bash
#!/bin/bash

ACCESS_TOKEN="your_kodus_access_token_here"

echo "=== 查询特定PR ==="

# 通过仓库ID查询（需要先获取repositoryId）
PR_RESPONSE=$(curl -s -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:3001/pullRequests/123")

echo "PR信息："
echo "$PR_RESPONSE" | python3 -m json.tool
```

---

## 四、构造Dry Run命令

### 4.1 必需参数说明

| 参数           | 类型   | 是否必需 | 说明     | 如何获取                   |
| -------------- | ------ | -------- | -------- | -------------------------- |
| organizationId | string | ✅       | 组织UUID | 从Kodus Cloud查看或API查询 |
| repositoryId   | string | ✅       | 仓库UUID | 从Kodus Cloud查看或API查询 |
| teamId         | string | ❌       | 团队UUID | 可选，组织级别可以留空     |
| prNumber       | number | ✅       | PR编号   | GitHub PR URL中获取        |
| baseBranch     | string | ✅       | 某础分支 | GitHub PR页面显示          |
| headBranch     | string | ✅       | 特性分支 | GitHub PR页面显示          |
| commitId       | string | ❌       | 提交SHA  | 可选，精确控制             |

### 4.2 参数获取方法对比

| 方法              | 优点               | 缺点             |
| ----------------- | ------------------ | ---------------- |
| **GitHub PR页面** | 最简单，直接可看   | 需要手动复制信息 |
| **GitHub API**    | 灵活，可自动化获取 | 需要GitHub token |
| **Kodus API**     | 最推荐             | 需要有权限访问   |

### 4.3 完整的命令模板

#### 模板1：基本Dry Run（推荐用于测试）

```bash
# ===== 配置部分 =====

# Kodus API配置
API_BASE="http://localhost:3001"
ACCESS_TOKEN="your_access_token_here"  # 从 /auth/login 获取

# GitHub仓库信息（从GitHub PR页面获取）
ORG_ID="your-org-uuid-from-kodus-cloud"
REPO_ID="your-repo-uuid-from-kodus-cloud"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/your-branch-name"
COMMIT_SHA="abc1234567890def"  # 可选，更精确控制

# ===== 创建Dry Run =====

echo "=== 步骤1: 创建Dry Run ==="

DRY_RUN_RESPONSE=$(curl -s -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\",
    $( [ -n \"$COMMIT_SHA\" ] && echo "\"commitId\": \"$COMMIT_SHA\"," )
  }")

echo "响应："
echo "$DRY_RUN_RESPONSE" | python3 -m json.tool

# 提取Dry Run的UUID（用于后续查询）
DRY_RUN_UUID=$(echo "$DRY_RUN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('uuid', ''))")

if [ -z "$DRY_RUN_UUID" ]; then
  echo "❌ 错误：无法获取Dry Run UUID"
  exit 1
fi

echo ""
echo "✅ Dry Run已创建，UUID: $DRY_RUN_UUID"
echo ""

# ===== 步骤2: 等待处理（可选） =====

sleep 3

echo ""
echo "=== 步骤3: 查询Dry Run状态 ==="

STATUS_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "状态："
echo "$STATUS_RESPONSE" | python3 -m json.tool

echo ""

# ===== 步骤4: 查询审查结果 =====

sleep 10

echo ""
echo "=== 步骤5: 查询最终结果 ==="

RESULT_RESPONSE=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "审查结果："
echo "$RESULT_RESPONSE" | python3 -m json.tool

# 提取并展示建议
SUGGESTIONS=$(echo "$RESULT_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); suggestions = data.get('result', {}).get('validSuggestions', []); [print(s.get('suggestionContent', '') + ' [' + s.get('label', '') + ']') for s in suggestions]")

echo "$SUGGESTIONS"
```

#### 模板2：带事件监控的Dry Run

```bash
# 配置变量（同上）
API_BASE="http://localhost:3001"
ACCESS_TOKEN="your_access_token_here"
ORG_ID="your-org-uuid"
REPO_ID="your-repo-uuid"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/test-review"

echo "=== 创建并监控Dry Run ==="

# 创建Dry Run
DRY_RUN_RESPONSE=$(curl -s -X POST $API_BASE/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\"
  }")

DRY_RUN_UUID=$(echo "$DRY_RUN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('uuid', ''))")

echo "✅ Dry Run已创建: $DRY_RUN_UUID"

# 实时监控事件
echo ""
echo "=== 监控审查事件（按Ctrl+C停止） ==="

while true; do
  EVENTS=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID/events \
    -H "Authorization: Bearer $ACCESS_TOKEN")

  echo "$(date '+%H:%M:%S') - 事件:"
  echo "$EVENTS" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f'{event_type}: {e.get(\"eventType\", \"\")}') for e in data[:3]]"

  # 检查是否完成
  IS_COMPLETED=$(echo "$EVENTS" | python3 -c "import sys, json; data=json.load(sys.stdin); print('completed' in [e.get('eventType', '') for e in data])")

  if [ "$IS_COMPLETED" = "True" ]; then
    echo ""
    echo "=== 审查完成！获取最终结果 ==="

    RESULT=$(curl -s -X GET $API_BASE/dry-run/$DRY_RUN_UUID \
      -H "Authorization: Bearer $ACCESS_TOKEN")

    echo "最终结果："
    echo "$RESULT" | python3 -m json.tool

    break
  fi

  sleep 2
done
```

---

## 五、常见问题

### 5.1 找不到仓库信息

**问题**：在Kodus Cloud中没有找到对应的组织或仓库

**解决方案**：

1. 检查PR是否在正确的组织和仓库中
2. 联系Kodus管理员获取访问权限
3. 如果是公开仓库，确认Kodus App是否已安装

### 5.2 organizationId或repositoryId格式错误

**问题**：API返回400错误

**错误示例**：

```json
{
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Organization UUID is missing"
}
```

**解决方案**：

1. 确认UUID格式正确（UUID v4格式：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）
2. 从Kodus Cloud复制时不要有空格或换行
3. 重新获取token并重试

### 5.3 权限错误

**问题**：API返回401或403错误

**解决方案**：

1. 检查ACCESS_TOKEN是否有效
2. 确认用户有访问该组织的权限
3. 重新登录获取新token

### 5.4 PR状态错误

**问题**：PR已关闭或合并

**解决方案**：

- 确认PR处于Open状态
- 如果PR已关闭，Dry Run仍会运行，但会看到0个变更文件
- 可以查看Dry Run的events来确认状态

### 5.5 没有返回结果

**问题**：Dry Run已完成但没有返回审查建议

**原因**：

- PR中没有代码变更
- 所有文件都被忽略规则过滤掉
- LLM模型配置错误

**检查方法**：

1. 查看Dry Run的`result.validSuggestions`数组是否为空
2. 查看`status`字段是否为`completed`
3. 查看events中是否有错误

---

## 快速参考

### GitHub PR页面信息提取清单

从GitHub PR页面获取以下信息：

- [ ] PR编号（从URL：`/pull/123` → `123`）
- [ ] Base分支（页面显示）
- [ ] Head分支（页面显示）
- [ ] 提交SHA（页面显示）
- [ ] 变更文件列表（点击"Files changed"）

### Dry Run创建命令

```bash
# 替换为实际值
ORG_ID="your-actual-org-id"
REPO_ID="your-actual-repo-id"
PR_NUMBER=123
BASE_BRANCH="main"
HEAD_BRANCH="feature/your-branch"
ACCESS_TOKEN="your-actual-token"

# 执行
curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"organizationId\": \"$ORG_ID\",
    \"repositoryId\": \"$REPO_ID\",
    \"prNumber\": $PR_NUMBER,
    \"baseBranch\": \"$BASE_BRANCH\",
    \"headBranch\": \"$HEAD_BRANCH\"
  }"
```

---

## 总结

**推荐流程**（最简单）：

1. 在浏览器打开GitHub PR页面
2. 复制以下信息：
    - PR编号
    - Base分支
    - Head分支
    - 提交SHA（可选）
3. 从Kodus Cloud组织设置中找到：
    - 组织ID（organizationId）
    - 仓库ID（repositoryId）
4. 使用本模板创建并运行Dry Run命令
5. 等待完成并查看审查结果

**所有参数均可从GitHub PR页面或Kodus Cloud中找到**，不需要通过编程方式查询GitHub API。
