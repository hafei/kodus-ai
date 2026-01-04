# Kodus AI API 参考文档

## 目录

- [Dry Run](#1-dry-run)
- [Code Management](#2-code-management)
- [Parameters/Settings](#3-parameterssettings)
- [Pull Requests](#4-pull-requests)
- [Integrations](#5-integrations)
- [Kody Rules](#6-kody-rules)
- [Issues](#7-issues)
- [Team/Organization](#8-teamorganization)
- [Authentication & User Management](#9-authentication--user-management)
- [Additional Controllers](#10-additional-controllers)
- [Webhook Controllers](#11-webhook-controllers)

---

## 1. Dry Run

**Base Path:** `/dry-run`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/execute` | - | - | `ExecuteDryRunDto` | Manage CodeReviewSettings |
| GET | `/status/:correlationId` | `correlationId` | `teamId` | - | Manage CodeReviewSettings |
| SSE | `/events/:correlationId` | `correlationId` | `teamId` | - | Manage CodeReviewSettings |
| GET | `/` | - | `teamId`, `repositoryId`, `directoryId`, `startDate`, `endDate`, `prNumber`, `status` | - | Manage CodeReviewSettings |
| GET | `/:correlationId` | `correlationId` | `teamId` | - | Manage CodeReviewSettings |

### DTO 定义

```typescript
// ExecuteDryRunDto
class ExecuteDryRunDto {
    teamId: string;              // string
    repositoryId: string;        // string
    prNumber: number;            // number
}
```

### 使用示例

```bash
# 执行 Dry Run
curl -X POST http://localhost:3001/dry-run/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "repositoryId": "1127646762",
    "prNumber": 1
  }'

# 查询 Dry Run 状态
curl -X GET "http://localhost:3001/dry-run/status/{correlationId}?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 监听 Dry Run 事件 (SSE)
curl -N http://localhost:3001/dry-run/events/{correlationId}?teamId=xxx \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 查询 Dry Run 列表
curl -X GET "http://localhost:3001/dry-run?teamId=xxx&repositoryId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 2. Code Management

**Base Path:** `/code-management`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/repositories/org` | - | `teamId`, `organizationSelected`, `isSelected`, `page`, `perPage` | - | Read CodeReviewSettings |
| POST | `/auth-integration` | - | - | GitHub 认证请求 | Create GitSettings |
| POST | `/repositories` | - | - | Repository 配置 | Create CodeReviewSettings |
| GET | `/organization-members` | - | - | - | Read UserSettings |
| GET | `/get-prs` | - | `teamId`, `number`, `title`, `url` | - | Read PullRequests |
| GET | `/get-prs-repo` | - | `teamId`, `repositoryId`, `number`, `startDate`, `endDate`, `author`, `branch`, `title`, `state` | - | Read PullRequests |
| POST | `/finish-onboarding` | - | - | `FinishOnboardingDTO` | Create CodeReviewSettings |
| DELETE | `/delete-integration` | - | `teamId` | - | Delete GitSettings |
| DELETE | `/delete-integration-and-repositories` | - | `teamId` | - | Delete GitSettings |
| GET | `/get-repository-tree-by-directory` | - | `repositoryId`, `path` | - | Read CodeReviewSettings |
| GET | `/search-users` | - | `organizationId`, `teamId`, `q`, `userId`, `limit` | - | Read UserSettings |
| GET | `/current-user` | - | `organizationId`, `teamId` | - | Read UserSettings |
| GET | `/webhook-status` | - | `organizationId`, `teamId`, `repositoryId` | - | - |

### 使用示例

```bash
# 获取组织的仓库列表
curl -X GET "http://localhost:3001/code-management/repositories/org?teamId=xxx&organizationSelected=hafei" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 创建 GitHub 认证集成
curl -X POST http://localhost:3001/code-management/auth-integration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "platform": "GITHUB",
    "token": "ghp_xxx",
    "authMode": "token",
    "integrationType": "GITHUB",
    "organizationAndTeamData": {
      "organizationId": "xxx",
      "teamId": "xxx"
    }
  }'

# 添加/更新仓库配置
curl -X POST http://localhost:3001/code-management/repositories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "repositories": [
      {
        "id": "1127646762",
        "name": "springboot-elk",
        "full_name": "hafei/springboot-elk",
        "http_url": "https://github.com/hafei/springboot-elk",
        "selected": true
      }
    ],
    "type": "append"
  }'

# 获取 PR 列表
curl -X GET "http://localhost:3001/code-management/get-prs-repo?teamId=xxx&repositoryId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 检查 Webhook 状态
curl -X GET "http://localhost:3001/code-management/webhook-status?organizationId=xxx&teamId=xxx&repositoryId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 3. Parameters/Settings

### parameters.controller.ts

**Base Path:** `/parameters`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/create-or-update` | - | - | `{ key, configValue, organizationAndTeamData }` | Create CodeReviewSettings |
| GET | `/find-by-key` | - | `key`, `teamId` | - | Read CodeReviewSettings |
| GET | `/list-code-review-automation-labels` | - | `codeReviewVersion`, `teamId`, `repositoryId` | - | Read CodeReviewSettings |
| POST | `/create-or-update-code-review` | - | - | `CreateOrUpdateCodeReviewParameterDto` | Create CodeReviewSettings |
| POST | `/apply-code-review-preset` | - | - | `ApplyCodeReviewPresetDto` | Create CodeReviewSettings |
| POST | `/update-code-review-parameter-repositories` | - | - | `{ organizationAndTeamData }` | Create CodeReviewSettings |
| GET | `/code-review-parameter` | - | `teamId` | - | Read CodeReviewSettings |
| GET | `/default-code-review-parameter` | - | - | - | Read CodeReviewSettings |
| GET | `/generate-kodus-config-file` | - | `teamId`, `repositoryId`, `directoryId` | - | Read CodeReviewSettings |
| POST | `/delete-repository-code-review-parameter` | - | - | `DeleteRepositoryCodeReviewParameterDto` | Delete CodeReviewSettings |
| POST | `/preview-pr-summary` | - | - | `PreviewPrSummaryDto` | Read CodeReviewSettings |

### organizationParameters.controller.ts

**Base Path:** `/organization-parameters`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/create-or-update` | - | - | `{ key, configValue }` | Create OrganizationSettings |
| GET | `/find-by-key` | - | `key` | - | Read OrganizationSettings |
| GET | `/list-providers` | - | - | - | - |
| GET | `/list-models` | - | `provider` | - | - |
| DELETE | `/delete-byok-config` | - | `configType` | - | - |
| GET | `/cockpit-metrics-visibility` | - | - | - | Read OrganizationSettings |
| POST | `/cockpit-metrics-visibility` | - | - | `{ teamId, config }` | Update OrganizationSettings |
| POST | `/ignore-bots` | - | - | `{ teamId }` | Update OrganizationSettings |
| POST | `/auto-license/allowed-users` | - | - | `{ teamId, includeCurrentUser, organizationId }` | Update OrganizationSettings |

### 可用的参数键 (ParametersKey)

```typescript
// 语言设置
LANGUAGE_CONFIG = 'language_config'

// Issue 创建配置
ISSUE_CREATION_CONFIG = 'issue_creation_config'

// 代码审查配置
CODE_REVIEW_CONFIG = 'code_review_config'

// 平台配置
PLATFORM_CONFIGS = 'platform_configs'
```

### 可用的组织参数键 (OrganizationParametersKey)

```typescript
// Dry Run 限制
DRY_RUN_LIMIT = 'dry_run_limit'

// BYOK 配置
BYOK_CONFIG = 'byok_config'

// 其他配置
// ...
```

### 使用示例

```bash
# 设置语言为中文
curl -X POST http://localhost:3001/parameters/create-or-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "key": "LANGUAGE_CONFIG",
    "configValue": "zh-CN",
    "organizationAndTeamData": {
      "teamId": "xxx"
    }
  }'

# 设置 Dry Run 限制
psql -U kodusdev -d kodus_db -c "
UPDATE organization_parameters
SET \"configValue\" = '100'::jsonb
WHERE \"organization_id\" = 'xxx'
AND \"configKey\" = 'dry_run_limit';
"

# 设置 LLM Provider (OpenAI)
psql -U kodusdev -d kodus_db -c "
INSERT INTO organization_parameters (uuid, \"createdAt\", \"updatedAt\", \"configKey\", \"configValue\", \"organization_id\")
VALUES (
  gen_random_uuid(),
  NOW(),
  NOW(),
  'byok_config',
  '{\"provider\": \"OPENAI\", \"models\": {\"codeReview\": \"gpt-4o\", \"summary\": \"gpt-4o\"}}'::jsonb,
  'xxx'
);
"

# 获取代码审查参数
curl -X GET "http://localhost:3001/parameters/code-review-parameter?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 列出可用的 Providers
curl -X GET "http://localhost:3001/organization-parameters/list-providers" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 4. Pull Requests

**Base Path:** `/pull-requests`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/executions` | - | `EnrichedPullRequestsQueryDto` | - | Read PullRequests |
| GET | `/onboarding-signals` | - | `OnboardingReviewModeSignalsQueryDto` | - | Read PullRequests |
| POST | `/backfill` | - | - | `BackfillPRsDto` | Create PullRequests |

### 使用示例

```bash
# 获取 PR 执行列表
curl -X GET "http://localhost:3001/pull-requests/executions?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 回填 PR 数据
curl -X POST http://localhost:3001/pull-requests/backfill \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "repositoryIds": ["xxx"]
  }'
```

---

## 5. Integrations

### integration.controller.ts

**Base Path:** `/integration`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/clone-integration` | - | - | Clone 集成请求 | Create GitSettings |
| GET | `/check-connection-platform` | - | - | 连接检查请求 | Read GitSettings |
| GET | `/organization-id` | - | - | - | Read GitSettings |
| GET | `/connections` | - | `teamId` | - | Read CodeReviewSettings |

### integrationConfig.controller.ts

**Base Path:** `/integration-config`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/get-integration-configs-by-integration-category` | - | `integrationCategory`, `teamId` | - | Read GitSettings |

### 使用示例

```bash
# 克隆集成配置
curl -X POST http://localhost:3001/integration/clone-integration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "teamIdClone": "yyy",
    "integrationData": {
      "platform": "GITHUB",
      "category": "CODE_MANAGEMENT"
    }
  }'

# 检查平台连接
curl -X GET "http://localhost:3001/integration/check-connection-platform?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取集成配置
curl -X GET "http://localhost:3001/integration-config/get-integration-configs-by-integration-category?integrationCategory=CODE_MANAGEMENT&teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 6. Kody Rules

**Base Path:** `/kody-rules`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/create-or-update` | - | - | `CreateKodyRuleDto` | Create KodyRules |
| GET | `/find-by-organization-id` | - | - | - | Read KodyRules |
| GET | `/limits` | - | - | - | Read KodyRules |
| GET | `/suggestions` | - | `ruleId` | - | Read KodyRules |
| GET | `/find-rules-in-organization-by-filter` | - | `key`, `value`, `repositoryId`, `directoryId` | - | Read KodyRules |
| DELETE | `/delete-rule-in-organization-by-id` | - | `ruleId` | - | Delete KodyRules |
| GET | `/find-library-kody-rules` | - | - | `FindLibraryKodyRulesDto` | - |
| GET | `/find-library-kody-rules-with-feedback` | - | - | `FindLibraryKodyRulesDto` | - |
| GET | `/find-library-kody-rules-buckets` | - | - | - | - |
| GET | `/find-recommended-kody-rules` | - | - | `FindRecommendedKodyRulesDto` | Read KodyRules |
| POST | `/add-library-kody-rules` | - | - | `AddLibraryKodyRulesDto` | Create KodyRules |
| POST | `/generate-kody-rules` | - | - | `GenerateKodyRulesDTO` | Create KodyRules |
| POST | `/change-status-kody-rules` | - | - | `ChangeStatusKodyRulesDTO` | Update KodyRules |
| GET | `/check-sync-status` | - | `teamId`, `repositoryId` | - | Read KodyRules |
| POST | `/sync-ide-rules` | - | - | `{ teamId, repositoryId }` | Create KodyRules |
| POST | `/fast-sync-ide-rules` | - | - | Fast Sync 请求 | Create KodyRules |
| GET | `/pending-ide-rules` | - | `teamId`, `repositoryId` | - | Read KodyRules |
| POST | `/import-fast-ide-rules` | - | - | `ImportFastKodyRulesDto` | Create KodyRules |
| POST | `/review-fast-ide-rules` | - | - | `ReviewFastKodyRulesDto` | Update KodyRules |
| GET | `/inherited-rules` | - | `teamId`, `repositoryId`, `directoryId` | - | Read KodyRules |
| POST | `/resync-ide-rules` | - | - | `{ teamId, repositoryId }` | Create KodyRules |

### 使用示例

```bash
# 获取组织的 Kody Rules
curl -X GET "http://localhost:3001/kody-rules/find-by-organization-id" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取推荐的 Kody Rules
curl -X GET "http://localhost:3001/kody-rules/find-recommended-kody-rules" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 同步 IDE Rules
curl -X POST http://localhost:3001/kody-rules/sync-ide-rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "repositoryId": "xxx"
  }'

# 快速同步 IDE Rules
curl -X POST http://localhost:3001/kody-rules/fast-sync-ide-rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "teamId": "xxx",
    "repositoryId": "xxx",
    "maxFiles": 100,
    "maxFileSizeBytes": 1048576
  }'

# 检查同步状态
curl -X GET "http://localhost:3001/kody-rules/check-sync-status?teamId=xxx&repositoryId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 7. Issues

**Base Path:** `/issues`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/` | - | `GetIssuesByFiltersDto` | - | Read Issues |
| GET | `/count` | - | `GetIssuesByFiltersDto` | - | Read Issues |
| GET | `/:id` | `id` | - | - | Read Issues |
| PATCH | `/:id` | `id` | - | `{ field, value }` | Update Issues |

### 使用示例

```bash
# 获取 Issues 列表
curl -X GET "http://localhost:3001/issues?teamId=xxx&status=open" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取 Issue 数量
curl -X GET "http://localhost:3001/issues/count?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取单个 Issue
curl -X GET "http://localhost:3001/issues/{id}" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 更新 Issue
curl -X PATCH "http://localhost:3001/issues/{id}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "field": "status",
    "value": "closed"
  }'
```

---

## 8. Team/Organization

### team.controller.ts

**Base Path:** `/team`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/` | - | - | - | - |
| GET | `/list-with-integrations` | - | - | - | - |

### organization.controller.ts

**Base Path:** `/organization`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/name` | - | - | - | - |
| PATCH | `/update-infos` | - | - | `UpdateInfoOrganizationAndPhoneDto` | Update OrganizationSettings |
| GET | `/domain` | - | `domain` | - | - |
| GET | `/language` | - | `teamId`, `repositoryId`, `sampleSize` | - | - |

### teamMembers.controller.ts

**Base Path:** `/team-members`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/` | - | `teamId` | - | Read UserSettings |
| POST | `/` | - | - | `{ members, teamId }` | Create UserSettings |
| DELETE | `/:uuid` | `uuid` | `removeAll` | - | Delete UserSettings |

### 使用示例

```bash
# 获取团队列表
curl -X GET "http://localhost:3001/team" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取带集成的团队列表
curl -X GET "http://localhost:3001/team/list-with-integrations" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取组织名称
curl -X GET "http://localhost:3001/organization/name" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 获取团队成员
curl -X GET "http://localhost:3001/team-members?teamId=xxx" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 添加团队成员
curl -X POST http://localhost:3001/team-members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "members": [{ "email": "user@example.com" }],
    "teamId": "xxx"
  }'

# 删除团队成员
curl -X DELETE "http://localhost:3001/team-members/{uuid}?removeAll=true" \
  -H "Authorization: Bearer $KODUS_TOKEN"
```

---

## 9. Authentication & User Management

### auth.controller.ts

**Base Path:** `/auth`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| POST | `/login` | - | - | `{ email, password }` | - |
| POST | `/logout` | - | - | `{ refreshToken }` | - |
| POST | `/refresh` | - | - | `{ refreshToken }` | - |
| POST | `/signUp` | - | - | `SignUpDTO` | - |
| POST | `/forgot-password` | - | - | `{ email }` | - |
| POST | `/reset-password` | - | - | `{ token, newPassword }` | - |
| POST | `/confirm-email` | - | - | `{ token }` | - |
| POST | `/resend-email` | - | - | `{ email }` | - |
| POST | `/oauth` | - | - | `CreateUserOrganizationOAuthDto` | - |
| GET | `/sso/check` | - | `domain` | - | - |
| GET | `/sso/login/:organizationId` | `organizationId` | - | - | AuthGuard('saml') |
| POST | `/sso/saml/callback/:organizationId` | `organizationId` | - | - | AuthGuard('saml') |

### user.controller.ts

**Base Path:** `/user`

| 方法 | 路径 | 路径参数 | 查询参数 | 请求体 | 权限要求 |
|------|------|----------|----------|--------|----------|
| GET | `/email` | - | `email` | - | - |
| GET | `/invite` | - | `userId` | - | - |
| POST | `/invite/complete-invitation` | - | - | `AcceptUserInvitationDto` | - |
| POST | `/join-organization` | - | - | `JoinOrganizationDto` | Create UserSettings |
| PATCH | `/:targetUserId` | `targetUserId` | - | `UpdateAnotherUserDto` | Update UserSettings |

### 使用示例

```bash
# 登录
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }'

# 注册
curl -X POST http://localhost:3001/auth/signUp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password",
    "name": "User Name"
  }'

# 刷新 Token
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "xxx"
  }'

# 检查 SSO
curl -X GET "http://localhost:3001/auth/sso/check?domain=example.com" \
  -H "Authorization: Bearer $KODUS_TOKEN"

# 加入组织
curl -X POST http://localhost:3001/user/join-organization \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODUS_TOKEN" \
  -d '{
    "organizationDomain": "example.com"
  }'
```

---

## 10. Additional Controllers

### tokenUsage.controller.ts

**Base Path:** `/usage`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tokens/summary` | Token 使用汇总 |
| GET | `/tokens/daily` | 每日 Token 使用 |
| GET | `/tokens/by-pr` | 按 PR 分组的 Token 使用 |
| GET | `/tokens/daily-by-pr` | 每日按 PR 分组的 Token 使用 |
| GET | `/tokens/by-developer` | 按开发者分组的 Token 使用 |
| GET | `/tokens/daily-by-developer` | 每日按开发者分组的 Token 使用 |
| GET | `/tokens/pricing` | Token 定价信息 |
| GET | `/cost-estimate` | 成本估算 |

### codeBase.controller.ts

**Base Path:** `/code-base`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/analyze-dependencies` | 分析代码依赖 |
| POST | `/content-from-diff` | 从 diff 获取内容 |

### agent.controller.ts

**Base Path:** `/agent`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/conversation` | AI 对话 |

### pullRequestMessages.controller.ts

**Base Path:** `/pull-request-messages`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 创建/更新 PR 消息 |
| GET | `/find-by-repository-or-directory` | 查找 PR 消息 |

### codeReviewSettingLog.controller.ts

**Base Path:** `/user-log`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/status-change` | 记录状态变更 |
| GET | `/code-review-settings` | 获取代码审查设置日志 |

### ruleLike.controller.ts

**Base Path:** `/rule-like`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/:ruleId/feedback` | 设置规则反馈 |
| DELETE | `/:ruleId/feedback` | 删除规则反馈 |

### permissions.controller.ts

**Base Path:** `/permissions`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取权限列表 |
| GET | `/can-access` | 检查访问权限 |
| GET | `/assigned-repos` | 获取分配的仓库 |
| POST | `/assign-repos` | 分配仓库 |

### segment.controller.ts

**Base Path:** `/segment`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/track` | 追踪事件 |

### webhook-health.controller.ts

**Base Path:** `/health`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 健康检查 |
| GET | `/simple` | 简单健康检查 |

### workflow-queue.controller.ts

**Base Path:** `/workflow-queue`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/jobs/:jobId` | 获取作业信息 |
| GET | `/jobs/:jobId/detail` | 获取作业详情 |
| GET | `/metrics` | 获取队列指标 |

---

## 11. Webhook Controllers

### github.controller.ts

**Base Path:** `/github`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/webhook` | GitHub Webhook |

### gitlab.controller.ts

**Base Path:** `/gitlab`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/webhook` | GitLab Webhook |

### bitbucket.controller.ts

**Base Path:** `/bitbucket`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/webhook` | Bitbucket Webhook |

### azureRepos.controller.ts

**Base Path:** `/azure-repos`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/webhook` | Azure Repos Webhook |

### Webhook 配置

需要在 GitHub/GitLab/Bitbucket/Azure Repos 中配置 Webhook URL：

```
https://your-domain.com/github/webhook
https://your-domain.com/gitlab/webhook
https://your-domain.com/bitbucket/webhook
https://your-domain.com/azure-repos/webhook?token=xxx
```

---

## 权限说明

所有需要权限验证的端点都使用 `@UseGuards(PolicyGuard)` 和 `@CheckPolicies` 装饰器。

### 权限类型

- `Read` - 读取权限
- `Create` - 创建权限
- `Update` - 更新权限
- `Delete` - 删除权限
- `Manage` - 管理权限

### 资源类型

- `CodeReviewSettings` - 代码审查设置
- `GitSettings` - Git 集成设置
- `UserSettings` - 用户设置
- `PullRequests` - 拉取请求
- `Issues` - 问题
- `KodyRules` - Kody 规则
- `OrganizationSettings` - 组织设置
- `Logs` - 日志

### 部分端点使用 `checkRepoPermissions` 进行仓库级别的权限验证

---

## 认证方式

大多数 API 需要在请求头中携带 JWT Token：

```http
Authorization: Bearer <token>
```

---

## 错误响应

标准错误响应格式：

```json
{
  "statusCode": 400,
  "timestamp": "2026-01-04T12:00:00.000Z",
  "path": "/api/endpoint",
  "error": "Bad Request",
  "message": "Error message here"
}
```

---

## 数据库相关操作

### PostgreSQL 相关

```bash
# 进入 PostgreSQL 容器
docker exec -it db_postgres psql -U kodusdev -d kodus_db

# 常用查询
# 查看 auth_integrations
SELECT "authDetails" FROM auth_integrations WHERE "teamId" = 'xxx';

# 查看 integration_configs
SELECT "configKey", "configValue" FROM "integration_configs" WHERE "teamId" = 'xxx';

# 查看 organization_parameters
SELECT "configKey", "configValue" FROM organization_parameters WHERE "organization_id" = 'xxx';

# 查看 parameters
SELECT "configKey", "configValue" FROM parameters WHERE "team_id" = 'xxx';
```

### MongoDB 相关 (Dry Run 数据)

```bash
# 进入 MongoDB 容器
docker exec -it db_mongodb mongosh -u kodusdev -p 123456 kodus_db

# 常用查询
db.dryruns.find({ "runs.teamId": "xxx" }).pretty()
db.dryruns.find({ "runs.status": "COMPLETED" }).pretty()
```

---

## 环境变量

关键环境变量：

```bash
# PostgreSQL
API_PG_DB_HOST=db_postgres
API_PG_DB_PORT=5432
API_PG_DB_USERNAME=kodusdev
API_PG_DB_PASSWORD=123456
API_PG_DB_DATABASE=kodus_db

# MongoDB
API_MG_DB_HOST=db_mongodb
API_MG_DB_PORT=27017
API_MG_DB_USERNAME=kodusdev
API_MG_DB_PASSWORD=123456
API_MG_DB_DATABASE=kodus_db

# LLM API Keys
API_OPEN_AI_API_KEY=sk-xxx
API_GOOGLE_AI_API_KEY=xxx
API_ANTHROPIC_API_KEY=xxx

# 加密
API_CRYPTO_KEY=<32字节hex>
```
