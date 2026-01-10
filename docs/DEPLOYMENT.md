# Kodus AI - 安装部署测试文档

> 本文档提供完整的Kodus AI本地安装部署流程，重点说明如何配置自定义OpenAI兼容API。

## 目录

- [一、系统要求](#一系统要求)
- [二、快速开始](#二快速开始)
- [三、详细安装步骤](#三详细安装步骤)
- [四、配置自定义OpenAI兼容API](#四配置自定义openai兼容api)
- [五、测试验证](#五测试验证)
- [六、常用命令](#六常用命令)
- [七、故障排查](#七故障排查)
- [八、生产环境部署](#八生产环境部署)

---

## 一、重要说明

**Kodus AI 自托管版本（Open Source）是纯后端项目**，包含：

- ✅ REST API 服务
- ✅ 后台任务处理器
- ✅ Webhook 接收器（GitHub/GitLab/Bitbucket等）
- ❌ **不包含前端管理界面**

### 管理界面选项

| 选项             | 说明                         | 访问方式                |
| ---------------- | ---------------------------- | ----------------------- |
| **Kodus Cloud**  | 官方托管版本，包含完整Web UI | https://app.kodus.io    |
| **自行开发前端** | 使用自托管API + 自己开发前端 | 需要调用API端点         |
| **API直接调用**  | 通过REST API或CLI管理        | curl/Postman/自定义脚本 |

**推荐**：如果你需要图形化界面，使用 Kodus Cloud 版本（https://app.kodus.io）。自托管版本适合需要完全控制基础设施或深度集成的场景。

---

## 二、系统要求

### 必需软件

| 软件           | 版本要求        | 说明                   |
| -------------- | --------------- | ---------------------- |
| Node.js        | >= 18.0.0 (LTS) | 运行时环境             |
| Yarn           | 最新版本        | 包管理器               |
| Docker         | >= 20.10.0      | 容器化部署             |
| Docker Compose | >= 2.0.0        | 容器编排               |
| OpenSSL        | 任意版本        | 密钥生成（通常已预装） |

### 硬件要求

- **CPU**: 4核及以上
- **内存**: 8GB及以上（推荐16GB）
- **磁盘**: 20GB可用空间
- **网络**: 稳定的互联网连接

---

## 二、快速开始

### 一键安装部署（推荐）

```bash
# 1. 克隆仓库（如果尚未完成）
git clone https://github.com/kodustech/kodus-ai.git
cd kodus-ai

# 2. 运行一键安装脚本
yarn setup
```

`yarn setup` 会自动完成：

- ✅ 检查系统依赖
- 📦 安装项目依赖
- 🔧 创建和配置 `.env` 文件
- 🔐 自动生成安全密钥
- 🐳 设置 Docker 网络

**注意**：`yarn setup` 不会启动服务、运行迁移或初始化数据。这些步骤需要手动执行（见下方详细步骤）。

### 手动配置

如果需要自定义配置，可以手动执行：

```bash
# 1. 安装依赖
yarn install

# 2. 复制环境变量模板
cp .env.example .env

# 3. 配置自定义API（见第四章）
# 编辑 .env 文件

# 4. 启动服务
yarn dev:quick-start
```

---

## 三、详细安装步骤

### 3.1 克隆项目

```bash
git clone https://github.com/kodustech/kodus-ai.git
cd kodus-ai
```

### 3.2 安装依赖

```bash
yarn install
```

这将安装所有Node.js依赖包。

### 3.3 配置环境变量

```bash
cp .env.example .env
```

### 3.4 配置数据库（可选）

#### 使用本地数据库

启动时使用 `--profile local-db`：

```bash
yarn docker:up --profile local-db
```

#### 连接远程数据库

```bash
# 获取QA环境配置
./scripts/fetch-env-qa.sh qa

# 获取生产环境配置
./scripts/fetch-env-prod.sh prod
```

### 3.5 生成安全密钥

```bash
# 生成JWT密钥
openssl rand -base64 32

# 生成加密密钥
openssl rand -hex 32
```

将生成的密钥添加到 `.env` 文件中。

### 3.6 启动服务

```bash
# 启动所有服务（包含本地数据库）
yarn docker:start

# 或者仅启动服务+本地数据库（不先停止）
yarn docker:up --profile local-db

# 或者启动单个服务
yarn docker:start:api
yarn docker:start:webhooks
yarn docker:start:worker
```

### 3.7 初始化数据库 Schema（首次运行必须）

```bash
# 创建必需的数据库 schema
./scripts/init-db.sh
```

这会创建 `kodus_workflow` schema，这是迁移脚本所必需的。

**如果此步骤失败**，可以手动执行：

```bash
docker exec db_postgres psql -U kodusdev -d kodus_db -c "CREATE SCHEMA IF NOT EXISTS kodus_workflow;"
```

### 3.8 运行数据库迁移

```bash
# 运行数据库迁移
yarn migration:run
```

**注意**：

- 如果你看到 `yarn migrate:dev`，这是错误的命令。正确的命令是 `yarn migration:run`。
- 如果迁移失败并提示 "schema kodus_workflow does not exist"，先执行上面的 CREATE SCHEMA 命令。

### 3.8 初始化数据

```bash
yarn seed
```

### 3.9 验证安装

```bash
# 健康检查
yarn dev:health-check

# 或直接测试 API
curl http://localhost:3001/health

# 查看日志
yarn dev:logs
```

---

### 完整快速启动流程（从零开始）

```bash
# 1. 一键设置（首次运行）
yarn setup

# 2. 配置 API Key（编辑 .env 文件）
vim .env
# 添加：API_OPEN_AI_API_KEY=your_key_here
# 或自定义API：API_OPENAI_FORCE_BASE_URL=https://api.deepseek.com

# 3. 启动服务
yarn docker:start

# 4. 等待数据库启动（约30秒）

# 5. 初始化数据库 schema（首次运行必须）
./scripts/init-db.sh

# 6. 运行数据库迁移
yarn migration:run

# 7. 初始化数据
yarn seed

# 8. 验证安装
yarn dev:health-check

# 9. 或直接测试 API
curl http://localhost:3001/health
```

**预期结果**：

```
✅ 所有容器运行
✅ 数据库连接成功
✅ API 健康检查通过
✅ 访问 http://localhost:3001/health
```

---

## 四、配置自定义OpenAI兼容API

Kodus AI支持使用任何兼容OpenAI API规范的LLM提供商。

### 4.1 方式一：环境变量配置（简单）

编辑 `.env` 文件，添加以下配置：

```env
# ===== 自定义OpenAI兼容API配置 =====
# 你的自定义API密钥
API_OPEN_AI_API_KEY=your-custom-api-key-here

# 自定义API的基础URL（关键配置）
# 示例：
# - Azure OpenAI: https://your-resource.openai.azure.com
# - Groq: https://api.groq.com/openai/v1
# - 本地Ollama: http://localhost:11434/v1
# - 其他OpenAI兼容服务: https://your-api-endpoint.com
API_OPENAI_FORCE_BASE_URL=https://your-custom-api-endpoint.com/v1

# LLM提供商选择（预设模型）
# 选项: auto（自动选择）或具体模型名（见下文模型列表）
API_LLM_PROVIDER_MODEL=auto
```

**重要说明：**

1. **API_OPENAI_FORCE_BASE_URL** 是配置自定义API的关键
2. 确保你的自定义API遵循OpenAI API规范
3. API密钥需要与你的自定义API服务匹配

#### 预设模型列表（通过 llmProvider 配置）

当使用环境变量方式时，系统使用预设的模型配置。以下是可用的模型：

| 模型标识 (llmProvider)                  | 实际模型名 (modelName)               | 提供商        |
| --------------------------------------- | ------------------------------------ | ------------- |
| `openai:gpt-4o`                         | `gpt-4o`                             | OpenAI        |
| `openai:gpt-4o-mini`                    | `gpt-4o-mini`                        | OpenAI        |
| `openai:gpt-4.1`                        | `gpt-4.1`                            | OpenAI        |
| `openai:o4-mini`                        | `o4-mini`                            | OpenAI        |
| `anthropic:claude-3-5-sonnet-20241022`  | `claude-3-5-sonnet-20241022`         | Anthropic     |
| `google:gemini-2.0-flash`               | `gemini-2.0-flash`                   | Google AI     |
| `google:gemini-2.5-pro`                 | `gemini-2.5-pro`                     | Google AI     |
| `google:gemini-2.5-flash`               | `gemini-2.5-flash`                   | Google AI     |
| `vertex:gemini-2.0-flash`               | `gemini-2.0-flash`                   | Google Vertex |
| `vertex:gemini-2.5-pro`                 | `gemini-2.5-pro`                     | Google Vertex |
| `vertex:gemini-2.5-flash`               | `gemini-2.5-flash`                   | Google Vertex |
| `vertex:claude-3-5-sonnet-v2@20241022`  | `claude-3-5-sonnet-v2@20241022`      | Google Vertex |
| `novita:deepseek-v3`                    | `deepseek/deepseek_v3`               | Novita        |
| `novita:deepseek-v3-0324`               | `deepseek/deepseek-v3-0324`          | Novita        |
| `novita:qwen3-235b-a22b-thinking-2507`  | `qwen/qwen3-235b-a22b-thinking-2507` | Novita        |
| `novita:moonshotai/kimi-k2-instruct`    | `moonshotai/kimi-k2-instruct`        | Novita        |
| `groq:moonshotai/kimi-k2-instruct-0905` | `moonshotai/kimi-k2-instruct-0905`   | Groq          |
| `groq:openai/gpt-oss-120b`              | `openai/gpt-oss-120b`                | Groq          |

**配置示例：**

```env
# 使用预设模型
API_LLM_PROVIDER_MODEL=openai:gpt-4o

# 或者使用 Google Gemini
API_LLM_PROVIDER_MODEL=google:gemini-2.5-pro

# 配置对应的 API 密钥和 Base URL
API_OPEN_AI_API_KEY=your-api-key
API_OPENAI_FORCE_BASE_URL=https://your-api.com/v1
```

### 4.2 方式二：BYOK配置（灵活，支持自定义模型）

Kodus支持通过Bring Your Own Key (BYOK) 方式配置多个LLM提供商，**可以指定任意模型名称**。

#### 配置格式

在数据库或通过API设置BYOK配置（在代码审查配置中）：

```typescript
{
  "main": {
    "provider": "openai_compatible",  // 提供商类型（见下文）
    "apiKey": "your-custom-api-key",
    "model": "your-custom-model-name",  // ← 这里指定模型名称
    "baseURL": "https://your-custom-api.com/v1"
  },
  "fallback": {
    "provider": "openai_compatible",
    "apiKey": "fallback-api-key",
    "model": "fallback-model-name",  // ← 备用模型的名称
    "baseURL": "https://fallback-api.com/v1"
  }
}
```

#### 支持的提供商类型

| 提供商        | Provider值          | 说明                         |
| ------------- | ------------------- | ---------------------------- |
| OpenAI        | `openai`            | 官方OpenAI API               |
| OpenAI兼容    | `openai_compatible` | 任何兼容OpenAI API规范的服务 |
| Anthropic     | `anthropic`         | Claude系列模型               |
| Google Gemini | `google_gemini`     | Google Gemini API            |
| Google Vertex | `google_vertex`     | Google Vertex AI             |
| OpenRouter    | `open_router`       | OpenRouter聚合服务           |
| Novita        | `novita`            | Novita AI                    |

#### BYOK模型配置示例

**使用自定义模型名称：**

```json
{
    "main": {
        "provider": "openai_compatible",
        "apiKey": "sk-your-deepseek-key",
        "model": "deepseek-chat", // ← 自定义模型名称
        "baseURL": "https://api.deepseek.com"
    }
}
```

**使用OpenRouter模型：**

```json
{
    "main": {
        "provider": "open_router",
        "apiKey": "sk-your-openrouter-key",
        "model": "anthropic/claude-3.5-sonnet", // ← OpenRouter模型路径
        "baseURL": "https://openrouter.ai/api/v1"
    }
}
```

**使用Ollama本地模型：**

```json
{
    "main": {
        "provider": "openai_compatible",
        "apiKey": "ollama",
        "model": "llama3.2:3b", // ← Ollama本地模型
        "baseURL": "http://localhost:11434/v1"
    }
}
```

**多提供商配置（主+备用）：**

```json
{
    "main": {
        "provider": "openai_compatible",
        "apiKey": "sk-your-custom-key",
        "model": "custom-model-v2",
        "baseURL": "https://api.custom-provider.com/v1"
    },
    "fallback": {
        "provider": "openai",
        "apiKey": "sk-your-openai-key",
        "model": "gpt-4o-mini" // ← 当主模型失败时使用
    }
}
```

**配置对比总结：**

| 配置方式            | 优点           | 缺点                   | 适用场景              |
| ------------------- | -------------- | ---------------------- | --------------------- |
| 环境变量 + 预设模型 | 简单快速       | 只能用预设模型         | 快速测试，使用官方API |
| BYOK配置            | 完全自定义模型 | 需要通过API/数据库配置 | 生产环境，自定义API   |

### 4.3 常见自定义API配置示例

#### 示例1：Azure OpenAI

```env
API_OPEN_AI_API_KEY=your-azure-openai-key
API_OPENAI_FORCE_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment-name
```

#### 示例2：Groq

```env
# 使用Groq的预设模型
API_GROQ_BASE_URL=https://api.groq.com/openai/v1
API_GROQ_API_KEY=gsk_your-groq-api-key
API_LLM_PROVIDER_MODEL=groq:moonshotai/kimi-k2-instruct-0905

# 或者使用自定义模型
API_OPEN_AI_API_KEY=gsk_your-groq-api-key
API_OPENAI_FORCE_BASE_URL=https://api.groq.com/openai/v1
```

#### 示例3：Ollama（本地）

```env
API_OPEN_AI_API_KEY=ollama
API_OPENAI_FORCE_BASE_URL=http://localhost:11434/v1
```

**BYOK方式配置Ollama（支持指定模型名）：**

```json
{
    "main": {
        "provider": "openai_compatible",
        "apiKey": "ollama",
        "model": "llama3.2:3b",
        "baseURL": "http://localhost:11434/v1"
    }
}
```

#### 示例4：DeepSeek

```env
# 环境变量方式
API_OPEN_AI_API_KEY=sk-your-deepseek-api-key
API_OPENAI_FORCE_BASE_URL=https://api.deepseek.com
```

**BYOK方式配置DeepSeek（推荐）：**

```json
{
    "main": {
        "provider": "openai_compatible",
        "apiKey": "sk-your-deepseek-api-key",
        "model": "deepseek-chat",
        "baseURL": "https://api.deepseek.com"
    }
}
```

#### 示例5：OpenRouter（聚合服务）

```env
# 环境变量方式
API_OPENROUTER_KEY=sk-your-openrouter-key
API_GROQ_BASE_URL=https://openrouter.ai/api/v1
API_GROQ_API_KEY=sk-your-openrouter-key
```

**BYOK方式配置OpenRouter（推荐，可选择任何模型）：**

```json
{
    "main": {
        "provider": "open_router",
        "apiKey": "sk-your-openrouter-key",
        "model": "anthropic/claude-3.5-sonnet",
        "baseURL": "https://openrouter.ai/api/v1"
    }
}
```

### 4.4 验证自定义API配置

配置完成后，可以通过以下方式验证：

```bash
# 1. 重启服务
yarn dev:restart

# 2. 查看日志
yarn dev:logs

# 3. 检查API健康状态
curl http://localhost:3331/health
```

### 4.5 多提供商配置（高级）

配置主提供商和备用提供商：

```env
# 主提供商
API_OPEN_AI_API_KEY=your-primary-key
API_OPENAI_FORCE_BASE_URL=https://primary-api.com/v1

# 备用提供商（Anthropic）
API_ANTHROPIC_API_KEY=your-anthropic-key

# Google Gemini（备选）
API_GOOGLE_AI_API_KEY=your-google-key
```

在代码审查配置中可以指定使用哪个提供商作为fallback。

### 4.6 在Kodus UI中配置BYOK模型

Kodus支持通过Web界面或API配置BYOK模型：

#### 通过API配置

```bash
# 1. 创建或更新代码审查配置
curl -X POST http://localhost:3331/organization/parameters/code-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "configValue": {
      "byokConfig": {
        "main": {
          "provider": "openai_compatible",
          "apiKey": "sk-your-custom-api-key",
          "model": "deepseek-chat",
          "baseURL": "https://api.deepseek.com"
        },
        "fallback": {
          "provider": "openai",
          "apiKey": "sk-your-openai-key",
          "model": "gpt-4o-mini"
        }
      }
    }
  }'
```

#### 通过UI配置

1. 登录 Kodus Web 界面
2. 进入组织设置 → 代码审查配置
3. 找到 "BYOK Config" 或 "LLM Provider" 部分
4. 输入以下信息：
    - **Provider**: 选择提供商类型（如 `openai_compatible`）
    - **API Key**: 输入你的API密钥
    - **Model Name**: 输入模型名称（如 `deepseek-chat`）
    - **Base URL**: 输入API端点（如 `https://api.deepseek.com`）
5. 可选：配置备用提供商
6. 保存配置

### 4.7 配置优先级说明

当同时存在多种配置时，系统按以下优先级使用模型：

1. **BYOK配置**（优先级最高）
    - 如果代码审查配置中指定了 `byokConfig`，则优先使用
    - 支持完全自定义的模型名称

2. **预设模型**（llmProvider）
    - 如果未配置BYOK，使用预设的 `llmProvider`
    - 只能使用预设的模型列表中的模型

3. **环境变量**（最低优先级）
    - 当以上两者都未配置时，使用环境变量中的API
    - 通常结合 `API_LLM_PROVIDER_MODEL` 使用

**配置建议：**

- **开发环境**：使用环境变量 + 预设模型（快速方便）
- **生产环境**：使用BYOK配置（灵活可控，支持任意模型）
- **关键应用**：配置主+备用提供商，确保高可用性

---

## 五、API 端点和管理

**重要说明**：自托管版本**没有内置的图形化管理界面**。你需要通过以下方式之一管理 Kodus：

### 5.1 方式一：使用 Kodus Cloud（推荐）

访问：https://app.kodus.io

- ✅ 完整的Web管理界面
- ✅ 可视化配置代码审查规则
- ✅ 管理组织和团队
- ✅ 监控审查活动
- ✅ 需要订阅

### 5.2 方式二：通过 REST API 管理

自托管版本提供完整的 REST API，可以通过以下方式管理：

#### 5.2.1 基础端点

```bash
# 健康检查
curl http://localhost:3001/health

# 查看系统状态
curl http://localhost:3001/health | python3 -m json.tool
```

响应示例：

```json
{
    "status": "ok",
    "timestamp": "2026-01-04T05:16:44.370Z",
    "details": {
        "application": {
            "status": "up",
            "uptime": "11m 29s",
            "environment": "development"
        },
        "database": {
            "status": "up",
            "postgres": { "status": "up" },
            "mongodb": { "status": "up" }
        }
    }
}
```

#### 5.2.2 主要 API 端点

| 控制器         | 功能         | 端点路径                     |
| -------------- | ------------ | ---------------------------- |
| Auth           | 用户认证     | `/auth/*`                    |
| User           | 用户管理     | `/user/*`                    |
| Organization   | 组织管理     | `/organization/*`            |
| Parameters     | 代码审查参数 | `/organization/parameters/*` |
| Code Base      | 代码库管理   | `/codeBase/*`                |
| Code Review    | 代码审查     | `/codeReview/*`              |
| Dry Run        | 试运行       | `/dryRun/*`                  |
| Agent          | AI 代理      | `/agent/*`                   |
| Permissions    | 权限管理     | `/permissions/*`             |
| Segment        | 分析数据     | `/segment/*`                 |
| Webhook Health | Webhook 检查 | `/webhook-health/*`          |

#### 5.2.3 通过 API 配置 BYOK 模型

```bash
# 获取 JWT token（需要先注册/登录）
TOKEN="your-jwt-token-here"

# 配置 BYOK 模型
curl -X POST http://localhost:3001/organization/parameters/code-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "configValue": {
      "byokConfig": {
        "main": {
          "provider": "openai_compatible",
          "apiKey": "sk-your-api-key",
          "model": "deepseek-chat",
          "baseURL": "https://api.deepseek.com"
        }
      }
    }
  }'
```

#### 5.2.4 配置代码审查规则（Kody Rules）

```bash
# 创建代码审查规则
curl -X POST http://localhost:3001/kodyRules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "代码质量检查",
    "description": "检查代码风格和最佳实践",
    "language": "typescript",
    "rule": {
      "title": "代码质量",
      "content": "确保代码遵循 TypeScript 最佳实践，包括类型安全、函数命名和模块化设计。"
    }
  }'
```

### 5.3 方式三：通过 GitHub App 管理（最简单）

Kodus 会自动通过 GitHub App 在 PR 中添加评论。你只需要：

1. 在 GitHub 上安装 Kodus GitHub App
2. 创建 Pull Request
3. 查看自动生成的代码审查评论

**配置方式**：

- 通过 API（如上所示）
- 通过 Kodus Cloud UI（https://app.kodus.io）
- 通过 `.kodus-config.yml` 文件放在仓库根目录

### 5.4 使用 `.kodus-config.yml` 配置

在 Git 仓库根目录创建配置文件：

```yaml
# .kodus-config.yml
review:
    enabled: true
    language: typescript
    rules:
        - name: '代码风格'
          severity: 'medium'
          description: '检查代码风格一致性'
```

当创建 PR 时，Kodus 会自动读取此配置并应用审查规则。

### 5.5 API 认证

大多数 API 端点需要 JWT 认证：

```bash
# 1. 创建用户并获取 token（首次）
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password",
    "name": "Your Name"
  }'

# 2. 登录获取 token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'

# 响应中会包含 access_token
# 3. 使用 token 访问受保护的端点
curl http://localhost:3001/organization \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 六、测试验证

### 6.1 健康检查

```bash
# 检查所有服务运行状态
yarn dev:health-check
```

---

## 七、常用命令

### 7.1 Docker服务管理

```bash
# 启动所有服务
yarn docker:start

# 启动服务+本地数据库
yarn docker:up --profile local-db

# 停止所有服务
yarn docker:down

# 重启服务
yarn dev:restart

# 查看日志
yarn dev:logs

# 查看特定服务日志
docker logs -f kodus-orchestrator-api
docker logs -f kodus-orchestrator-worker
docker logs -f kodus-orchestrator-webhooks

# 清理重启（删除容器和卷）
yarn dev:clean
```

### 6.2 数据库管理

```bash
# 生成迁移
yarn migration:generate MigrationName

# 运行迁移
yarn migration:run

# 回滚迁移
yarn migration:revert

# 初始化数据
yarn seed
```

### 6.3 构建命令

```bash
# 构建所有应用
yarn build

# 构建单个应用
yarn build:api
yarn build:webhooks
yarn build:worker

# 快速构建（webpack）
yarn build:fast
```

### 6.4 本地包开发（Yalc）

如果需要修改 `packages/kodus-common` 或 `packages/kodus-flow`：

```bash
# 初始化本地包
yarn dev:yalc

# 启动并监控
yarn dev:yalc

# 更新所有包
yarn yalc:update:all
```

---

## 八、故障排查

### 7.1 常见问题

#### 问题1：服务启动失败

**症状**：Docker容器无法启动

**排查步骤**：

```bash
# 1. 检查Docker是否运行
docker ps

# 2. 查看容器日志
docker logs kodus-orchestrator-api

# 3. 检查端口占用
lsof -i :3001
lsof -i :3332

# 4. 清理并重启
yarn dev:clean
yarn docker:start
```

#### 问题2：自定义API连接失败

**症状**：API调用失败，日志显示连接错误

**排查步骤**：

```bash
# 1. 检查环境变量
cat .env | grep API_OPENAI

# 2. 手动测试API连接
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-custom-api.com/v1/models

# 3. 查看详细日志
docker logs -f kodus-orchestrator-api | grep -i "api\|error\|openai"

# 4. 验证API密钥和URL格式
```

**常见错误原因**：

- API密钥错误或过期
- Base URL格式不正确（缺少 `/v1` 后缀）
- 自定义API不遵循OpenAI规范
- 网络连接问题（防火墙/代理）

#### 问题3：数据库连接失败

**症状**：服务无法连接数据库

**排查步骤**：

```bash
# 1. 检查数据库容器
docker ps | grep -E "postgres|mongo"

# 2. 查看数据库日志
docker logs kodus-orchestrator-postgres
docker logs kodus-orchestrator-mongodb

# 3. 测试数据库连接
docker exec -it kodus-orchestrator-postgres psql \
  -U kodusdev -d kodus_db -c "SELECT 1;"

# 4. 检查环境变量中的数据库配置
cat .env | grep -E "API_PG_DB_|API_MG_DB_"
```

#### 问题4：测试失败

**症状**：`yarn test` 运行失败

**排查步骤**：

```bash
# 1. 确保数据库已启动
yarn docker:up --profile local-db

# 2. 运行迁移
yarn migration:run

# 3. 查看测试输出
yarn test --verbose

# 4. 检查特定测试
yarn test --testNamePattern="测试名称"
```

### 7.2 调试模式

启用调试日志：

```env
# 在 .env 中设置
API_LOG_LEVEL=debug
API_LOG_PRETTY=true
```

### 7.3 性能调优

#### 增加内存限制

```bash
# 设置Node.js内存限制
export NODE_OPTIONS=--max-old-space-size=4096

# 或在Docker Compose中修改
services:
  api:
    environment:
      - NODE_OPTIONS=--max-old-space-size=4096
```

#### 数据库连接池

```env
# PostgreSQL连接池大小（默认25）
API_PG_DB_POOL_MAX=25
```

### 7.4 日志分析

```bash
# 查看错误日志
docker logs kodus-orchestrator-api 2>&1 | grep -i error

# 查看最近的日志
docker logs --tail 100 kodus-orchestrator-api

# 实时日志
docker logs -f kodus-orchestrator-api
```

---

## 九、生产环境部署

### 8.1 Docker Compose生产配置

```bash
# 使用生产配置启动
docker compose -f docker-compose.prod.yml up -d
```

### 8.2 环境变量要求

生产环境需要配置以下关键变量：

```env
# 环境
API_NODE_ENV=production
API_DATABASE_ENV=production
API_LOG_LEVEL=warn

# 数据库（生产服务器）
API_PG_DB_HOST=your-prod-db-host
API_PG_DB_PORT=5432
API_PG_DB_USERNAME=prod_user
API_PG_DB_PASSWORD=secure_password
API_PG_DB_DATABASE=kodus_prod

# MongoDB（生产服务器）
API_MG_DB_HOST=your-prod-mongo-host
API_MG_DB_PORT=27017
API_MG_DB_USERNAME=prod_user
API_MG_DB_PASSWORD=secure_password
API_MG_DB_DATABASE=kodus_prod

# RabbitMQ（生产服务器）
API_RABBITMQ_URI=amqp://user:password@prod-rabbitmq:5672/?heartbeat=60

# JWT密钥（必须使用强密钥）
API_JWT_SECRET=your-very-secure-jwt-secret
API_JWT_REFRESH_SECRET=your-very-secure-refresh-secret
API_CRYPTO_KEY=your-encryption-key

# 自定义API
API_OPEN_AI_API_KEY=your-production-api-key
API_OPENAI_FORCE_BASE_URL=https://your-prod-api.com/v1

# Webhook URLs（公网可访问）
API_GITHUB_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/github/webhook
API_GITLAB_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/gitlab/webhook
GLOBAL_BITBUCKET_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/bitbucket/webhook
GLOBAL_AZURE_REPOS_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/azure-repos/webhook
```

### 8.3 安全建议

1. **密钥管理**
    - 使用环境变量或密钥管理服务（如AWS Secrets Manager）
    - 不要在代码中硬编码密钥
    - 定期轮换密钥

2. **网络安全**
    - 使用HTTPS/TLS加密通信
    - 配置防火墙规则
    - 限制数据库访问IP

3. **数据库**
    - 使用强密码
    - 启用SSL连接
    - 定期备份

4. **Docker安全**
    - 不要使用root用户运行容器
    - 限制容器资源
    - 定期更新基础镜像

### 8.4 监控和日志

#### 启用Sentry错误追踪

```env
API_SENTRY_DNS=https://your-sentry-dns@sentry.io/project-id
```

#### 启用OpenTelemetry追踪

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your-langchain-api-key
LANGCHAIN_PROJECT=kodus-orchestrator
```

#### 启用分析（可选）

```env
API_CLOUD_MODE=true
API_SEGMENT_KEY=your-segment-key
API_POSTHOG_KEY=your-posthog-key
```

### 8.5 备份策略

```bash
# PostgreSQL备份
docker exec kodus-orchestrator-postgres pg_dump \
  -U kodusdev kodus_db > backup_$(date +%Y%m%d).sql

# MongoDB备份
docker exec kodus-orchestrator-mongodb mongodump \
  --db kodus_db --out /backup/$(date +%Y%m%d)
```

### 8.6 更新和迁移

```bash
# 1. 备份数据
# 执行备份脚本

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
yarn install

# 4. 生成并运行迁移
yarn migration:generate MigrationName
yarn migration:run

# 5. 重新构建镜像
docker build -f docker/Dockerfile --target api -t kodus-api:latest .
docker build -f docker/Dockerfile --target webhooks -t kodus-webhooks:latest .
docker build -f docker/Dockerfile --target worker -t kodus-worker:latest .

# 6. 重启服务
docker compose down
docker compose up -d
```

---

## 十、附录

### A. 端口映射

| 服务           | 内部端口 | 外部端口 | 说明             |
| -------------- | -------- | -------- | ---------------- |
| API            | 3001     | 3001     | 主API服务        |
| Webhooks       | 3332     | 3332     | Webhook处理器    |
| API Debug      | 9229     | 9229     | API调试端口      |
| Webhooks Debug | 9230     | 9230     | Webhooks调试端口 |
| Worker Debug   | 9231     | 9231     | Worker调试端口   |
| PostgreSQL     | 5432     | 5432     | 数据库           |
| MongoDB        | 27017    | 27017    | 文档数据库       |
| RabbitMQ       | 5672     | 5672     | 消息队列         |
| RabbitMQ管理   | 15672    | 15672    | RabbitMQ管理界面 |

### B. 目录结构

```
kodus-ai/
├── apps/                    # 应用程序
│   ├── api/                # 主API服务
│   ├── worker/             # 后台任务处理器
│   └── webhooks/           # Webhook处理器
├── libs/                   # 领域库
│   ├── ai-engine/          # AI引擎
│   ├── automation/         # 自动化
│   ├── code-review/        # 代码审查
│   └── ...
├── packages/               # 共享包
│   ├── kodus-common/      # 通用工具
│   └── kodus-flow/        # AI编排框架
├── docker/                # Docker配置
├── scripts/               # 脚本工具
├── test/                 # 测试文件
└── .env                  # 环境变量配置
```

### C. 获取帮助

- **官方文档**: https://docs.kodus.io
- **GitHub Issues**: https://github.com/kodustech/kodus-ai/issues
- **Discord社区**: https://discord.gg/6WbWrRbsH7
- **视频教程**: https://www.youtube.com/watch?v=rQo9rmQ2-zM

### D. 许可证

本项目采用 AGPLv3 许可证。详见 [LICENSE](LICENSE) 文件。

---

**文档版本**: 1.0
**最后更新**: 2025-01-04
**维护者**: Kodus AI Team
