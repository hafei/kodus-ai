# 部署前工作检查清单

> 本文档提供完整的部署前准备工作清单，确保每次部署都符合最佳实践和安全性要求。

## 目录

- [一、代码质量检查](#一代码质量检查)
- [二、测试验证](#二测试验证)
- [三、环境配置检查](#三环境配置检查)
- [四、数据库准备](#四数据库准备)
- [五、安全检查](#五安全检查)
- [六、构建验证](#六构建验证)
- [七、CI/CD 配置检查](#七cicd-配置检查)
- [八、监控和日志配置](#八监控和日志配置)
- [九、备份策略](#九备份策略)
- [十、回滚准备](#十回滚准备)
- [十一、部署验证](#十一部署验证)

---

## 一、代码质量检查

### 1.1 代码规范检查

```bash
# 运行 ESLint 并自动修复
yarn lint

# 检查是否有错误
yarn lint --max-warnings=0
```

**检查项目**:

- ✅ 无 ESLint 错误
- ✅ 无 TypeScript 类型错误
- ✅ 无未使用的导入
- ✅ 代码符合项目风格指南

### 1.2 类型检查

```bash
# 运行 TypeScript 类型检查
yarn typecheck
```

**检查项目**:

- ✅ 无类型错误
- ✅ 所有接口和类型定义正确
- ✅ 类型推断正确

### 1.3 代码格式化

```bash
# 格式化代码
yarn format
```

**检查项目**:

- ✅ 代码格式符合 Prettier 规范
- ✅ 统一的缩进和引号风格
- ✅ 一致的行尾和分号

### 1.4 依赖安全检查

```bash
# 检查依赖安全漏洞（如果配置了 Snyk）
yarn audit

# 更新依赖到最新安全版本
yarn upgrade-interactive --latest
```

**检查项目**:

- ✅ 无高/严重安全漏洞
- ✅ 依赖版本兼容
- ✅ License 合规性

---

## 二、测试验证

### 2.1 单元测试

```bash
# 运行所有单元测试
yarn test

# 运行测试并查看覆盖率
yarn test:cov

# 运行特定测试文件
yarn test --testPathPattern="文件名"
```

**检查项目**:

- ✅ 所有单元测试通过
- ✅ 测试覆盖率达标（建议 >80%）
- ✅ 无测试失败或跳过

### 2.2 集成测试

```bash
# 启动测试环境
yarn docker:up --profile local-db

# 运行集成测试
API_NODE_ENV=test yarn test

# 清理环境
yarn docker:down
```

**检查项目**:

- ✅ 所有集成测试通过
- ✅ 数据库迁移兼容
- ✅ 外部服务连接正常

### 2.3 E2E 测试

```bash
# 运行端到端测试
yarn test:e2e
```

**检查项目**:

- ✅ 关键用户流程测试通过
- ✅ API 端点响应正常
- ✅ Webhook 处理正确

### 2.4 手动测试清单

**API 功能测试**:

- [ ] 用户注册/登录流程
- [ ] 组织创建和管理
- [ ] 代码审查触发
- [ ] PR 评论生成
- [ ] GitHub/GitLab Webhook 接收

**Worker 功能测试**:

- [ ] 后台任务处理
- [ ] 消息队列消费
- [ ] 定时任务执行

**性能测试**:

- [ ] API 响应时间 < 2s（P95）
- [ ] 并发请求处理
- [ ] 内存使用稳定

---

## 三、环境配置检查

### 3.1 环境变量配置

**开发环境** (.env):

```bash
# 复制模板
cp .env.example .env

# 检查必需变量
cat .env | grep -E "^API_|GLOBAL_"
```

**生产环境** (.env.prod):

```bash
# 创建生产环境配置
cp .env.example .env.prod

# 必须修改的配置
- API_NODE_ENV=production
- API_DATABASE_ENV=production
- API_LOG_LEVEL=warn (而不是 debug)
```

### 3.2 必需环境变量清单

#### 基础配置

```env
API_NODE_ENV=production
API_DATABASE_ENV=production
API_LOG_LEVEL=warn
API_HOST=0.0.0.0
API_PORT=3001
WEBHOOKS_PORT=3332
```

#### PostgreSQL 配置

```env
API_PG_DB_HOST=your-prod-db-host
API_PG_DB_PORT=5432
API_PG_DB_USERNAME=prod_user
API_PG_DB_PASSWORD=secure_password
API_PG_DB_DATABASE=kodus_prod
```

#### MongoDB 配置

```env
API_MG_DB_HOST=your-prod-mongo-host
API_MG_DB_PORT=27017
API_MG_DB_USERNAME=prod_user
API_MG_DB_PASSWORD=secure_password
API_MG_DB_DATABASE=kodus_prod
```

#### RabbitMQ 配置

```env
API_RABBITMQ_URI=amqp://user:password@prod-rabbitmq:5672/?heartbeat=60
```

#### 安全密钥（必须使用强密钥）

```env
# 生成方法: openssl rand -base64 32
API_JWT_SECRET=your-very-secure-jwt-secret-64chars-min
API_JWT_REFRESH_SECRET=your-very-secure-refresh-secret-64chars-min

# 生成方法: openssl rand -hex 32
API_CRYPTO_KEY=your-encryption-key-64chars-hex
```

#### LLM 配置

```env
# OpenAI 兼容 API
API_OPEN_AI_API_KEY=your-production-api-key
API_OPENAI_FORCE_BASE_URL=https://your-prod-api.com/v1
API_LLM_PROVIDER_MODEL=auto

# 或其他提供商
API_ANTHROPIC_API_KEY=your-anthropic-key
API_GOOGLE_AI_API_KEY=your-google-key
```

#### GitHub/GitLab 集成

```env
API_GITHUB_APP_ID=your-github-app-id
API_GITHUB_CLIENT_SECRET=your-github-client-secret
API_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GLOBAL_GITHUB_CLIENT_ID=your-github-client-id

API_GITLAB_CLIENT_ID=your-gitlab-client-id
API_GITLAB_CLIENT_SECRET=your-gitlab-client-secret
```

#### Webhook URLs（公网可访问）

```env
API_GITHUB_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/github/webhook
API_GITLAB_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/gitlab/webhook
GLOBAL_BITBUCKET_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/bitbucket/webhook
GLOBAL_AZURE_REPOS_CODE_MANAGEMENT_WEBHOOK=https://your-domain.com/azure-repos/webhook
```

#### 监控和分析

```env
API_SENTRY_DNS=https://your-sentry-dns@sentry.io/project-id
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your-langchain-api-key
```

### 3.3 配置验证

```bash
# 验证环境变量格式
cat .env.prod | while read line; do
  if [[ $line =~ ^API_.*=$ ]]; then
    echo "Empty variable: $line"
  fi
done

# 验证 JWT 密钥长度（最少 32 字符）
echo $API_JWT_SECRET | wc -c

# 验证数据库连接字符串格式
# PostgreSQL: postgresql://user:password@host:port/database
# MongoDB: mongodb://user:password@host:port/database
```

---

## 四、数据库准备

### 4.1 数据库迁移

```bash
# 生成迁移文件（如果需要）
yarn migration:generate MigrationName

# 本地测试迁移
yarn migration:run

# 验证迁移成功
yarn migration:revert
yarn migration:run
```

**检查项目**:

- ✅ 所有迁移文件已生成
- ✅ 迁移脚本通过测试
- ✅ 回滚脚本可用

### 4.2 数据库 Schema 准备

```bash
# 初始化必需的 schema
docker exec db_postgres psql -U kodusdev -d kodus_db -c "CREATE SCHEMA IF NOT EXISTS kodus_workflow;"
```

**检查项目**:

- ✅ `kodus_workflow` schema 存在
- ✅ pgvector 扩展已启用
- ✅ 所有表和索引创建成功

### 4.3 数据库备份

**部署前备份（必须）**:

```bash
# PostgreSQL 备份
docker exec kodus_postgres_prod pg_dump \
  -U prod_user kodus_prod \
  --clean --if-exists \
  > backup_before_deploy_$(date +%Y%m%d_%H%M%S).sql

# MongoDB 备份
docker exec kodus_mongodb_prod mongodump \
  --db kodus_prod \
  --out /backup/$(date +%Y%m%d_%H%M%S)
```

### 4.4 数据库连接测试

```bash
# 测试 PostgreSQL 连接
docker exec kodus_postgres_prod psql \
  -U prod_user -d kodus_prod -c "SELECT version();"

# 测试 MongoDB 连接
docker exec kodus_mongodb_prod mongosh \
  --username prod_user --password \
  --authenticationDatabase admin \
  kodus_prod --eval "db.stats()"
```

### 4.5 数据库性能优化

```bash
# PostgreSQL 配置优化（在 postgresql.conf 中）
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

# 连接池配置
API_PG_DB_POOL_MAX=25
API_PG_DB_POOL_MIN=5
```

---

## 五、安全检查

### 5.1 密钥安全

**检查清单**:

- ✅ 所有密码使用强密钥（>16 字符）
- ✅ JWT 密钥 > 32 字符
- ✅ 加密密钥使用随机生成
- ✅ 敏感信息不提交到 Git
- ✅ 生产密钥与开发密钥分离

```bash
# 检查是否有密钥泄露到代码中
grep -r "password\|secret\|key" --include="*.ts" --include="*.js" | grep -v "node_modules"

# 检查 .gitignore 是否正确
cat .gitignore | grep -E "\.env|secret|key"
```

### 5.2 HTTPS/TLS 配置

**生产环境必须**:

- ✅ 使用 HTTPS 通信
- ✅ 配置 SSL/TLS 证书
- ✅ 强制 HTTPS 重定向
- ✅ 配置安全头（CSP, HSTS）

```nginx
# Nginx 安全头示例
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 5.3 Docker 安全

**检查清单**:

- ✅ 使用非 root 用户运行容器
- ✅ 限制容器资源（CPU, 内存）
- ✅ 使用最小化基础镜像
- ✅ 定期更新基础镜像
- ✅ 扫描镜像漏洞

```dockerfile
# Dockerfile 最佳实践
FROM node:20-alpine AS base

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs
WORKDIR /app
```

```bash
# 扫描 Docker 镜像漏洞
docker scan kodus-api:latest
```

### 5.4 网络安全

**检查清单**:

- ✅ 配置防火墙规则
- ✅ 限制数据库访问 IP
- ✅ 使用 VPN 或私有网络
- ✅ 禁用不必要的端口

```bash
# AWS Security Groups 示例规则
# API 服务器
- Inbound: 443 (HTTPS) from 0.0.0.0/0
- Inbound: 22 (SSH) from 管理 IP
- Outbound: All

# 数据库
- Inbound: 5432 (PostgreSQL) from API 服务器 IP only
- Inbound: 27017 (MongoDB) from API 服务器 IP only
- Outbound: All
```

### 5.5 依赖安全

```bash
# 使用 Snyk 检查依赖漏洞
npx snyk test

# 使用 npm audit
yarn audit --level moderate

# 修复漏洞
yarn audit fix
```

---

## 六、构建验证

### 6.1 本地构建测试

```bash
# 清理之前的构建
rm -rf dist/

# 构建 API
yarn build:api

# 构建 Webhooks
yarn build:webhooks

# 构建 Worker
yarn build:worker

# 检查构建产物
ls -lh dist/apps/
```

**检查项目**:

- ✅ 构建成功无错误
- ✅ 所有模块编译完成
- ✅ 构建产物大小合理
- ✅ 无 TypeScript 编译错误

### 6.2 Docker 镜像构建

```bash
# 构建 API 镜像
docker build -f docker/Dockerfile --target api -t kodus-api:test .

# 构建 Webhooks 镜像
docker build -f docker/Dockerfile --target webhooks -t kodus-webhooks:test .

# 构建 Worker 镜像
docker build -f docker/Dockerfile --target worker -t kodus-worker:test .
```

**检查项目**:

- ✅ 镜像构建成功
- ✅ 镜像大小合理（建议 < 500MB）
- ✅ 镜像可以正常启动
- ✅ 多架构构建（amd64 + arm64）

### 6.3 镜像启动测试

```bash
# 测试 API 容器
docker run --rm -p 3331:3001 \
  --env-file .env.test \
  kodus-api:test

# 测试健康检查
curl http://localhost:3331/health

# 测试 Webhooks 容器
docker run --rm -p 3333:3332 \
  --env-file .env.test \
  kodus-webhooks:test

# 测试 Worker 容器
docker run --rm \
  --env-file .env.test \
  kodus-worker:test
```

### 6.4 多架构构建（CI/CD）

```bash
# 设置 Docker Buildx
docker buildx create --use

# 构建多架构镜像
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg RELEASE_VERSION=v1.0.0 \
  -f docker/Dockerfile \
  --target api \
  -t registry.example.com/kodus-api:v1.0.0 \
  --push \
  .
```

---

## 七、CI/CD 配置检查

### 7.1 GitHub Actions 配置

**必需的 Variables**:

- `ECR_REPOSITORY_API`
- `ECR_REPOSITORY_WEBHOOKS`
- `ECR_REPOSITORY_WORKER`
- `INFRA_REPO`
- `INFRA_BASE_BRANCH`
- `INFRA_TFVARS_PATH`
- `INFRA_GITHUB_APP_ID`

**必需的 Secrets**:

- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME`（OIDC，避免长期密钥）
- `INFRA_GITHUB_APP_PRIVATE_KEY`

**检查清单**:

```bash
# 验证 workflow 文件语法
yamllint .github/workflows/*.yml

# 检查必需的变量和 secrets
grep -r "vars\." .github/workflows/*.yml
grep -r "secrets\." .github/workflows/*.yml
```

### 7.2 CI/CD Workflow 测试

**手动触发测试**:

```bash
# 在 GitHub 仓库中触发 workflow_dispatch
# Settings → Actions → 选择 workflow → Run workflow
```

**检查项目**:

- ✅ Workflow 触发成功
- ✅ AWS ECR 登录成功
- ✅ Docker 镜像构建成功
- ✅ 镜像推送到 ECR 成功
- ✅ Infra repo PR 创建成功

### 7.3 GitOps 验证

**Terraform tfvars 路径**:

- QA: `envs/aws/qa/releases/orchestrator.auto.tfvars.json`
- PROD: `envs/aws/prod/releases/orchestrator.auto.tfvars.json`

**验证脚本**:

```bash
# 测试 tfvars 更新脚本
./scripts/update-tfvars-green.sh \
  test-tfvars.json \
  registry.example.com/api:sha123 \
  registry.example.com/webhooks:sha123 \
  registry.example.com/worker:sha123

# 检查更新的字段
cat test-tfvars.json | grep -E "green_image|green_desired_count"
```

### 7.4 环境配置（GitHub Environments）

**QA Environment**:

- Required reviewers: 配置审批人
- Environment secrets: AWS credentials, Infra token
- Protection rules: 限制部署权限

**Production Environment**:

- Required reviewers: 至少 2 人审批
- Environment secrets: 生产环境密钥
- Wait timer: 建议设置等待时间（如 30 分钟）

---

## 八、监控和日志配置

### 8.1 Sentry 错误追踪

**配置**:

```env
API_SENTRY_DNS=https://your-sentry-dns@sentry.io/project-id
```

**验证**:

```bash
# 上传 sourcemaps
yarn sentry:sourcemaps

# 测试错误报告
curl -X POST http://localhost:3001/test-error
```

**检查项目**:

- ✅ Sentry DNS 配置正确
- ✅ Sourcemaps 上传成功
- ✅ 错误能正确上报
- ✅ 性能监控启用

### 8.2 OpenTelemetry 追踪

**配置**:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your-langchain-api-key
LANGCHAIN_PROJECT=kodus-orchestrator
LANGCHAIN_CALLBACKS_BACKGROUND=true
```

**检查项目**:

- ✅ 追踪数据正常上报
- ✅ 性能指标收集
- ✅ 分布式追踪工作

### 8.3 日志配置

**生产环境日志**:

```env
API_LOG_LEVEL=warn
API_LOG_PRETTY=false
```

**日志聚合**:

```javascript
// Pino 日志配置示例
const logger = pino({
    level: process.env.API_LOG_LEVEL,
    transport: process.env.API_LOG_PRETTY
        ? { target: 'pino-pretty' }
        : undefined,
    serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
});
```

**检查项目**:

- ✅ 日志级别正确（warn/error）
- ✅ 结构化日志格式
- ✅ 日志不包含敏感信息
- ✅ 日志轮转配置

### 8.4 健康检查端点

**验证**:

```bash
# API 健康检查
curl http://localhost:3001/health

# Webhooks 健康检查
curl http://localhost:3332/health

# 检查响应
{
  "status": "ok",
  "timestamp": "2026-01-08T03:00:00.000Z",
  "details": {
    "application": { "status": "up", "uptime": "1d" },
    "database": {
      "postgres": { "status": "up" },
      "mongodb": { "status": "up" }
    }
  }
}
```

---

## 九、备份策略

### 9.1 数据库备份

**自动化备份脚本**:

```bash
#!/bin/bash
# backup-databases.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/$DATE"

# PostgreSQL 备份
mkdir -p $BACKUP_DIR/postgres
docker exec kodus_postgres_prod pg_dump \
  -U prod_user kodus_prod \
  --clean --if-exists \
  > $BACKUP_DIR/postgres/kodus_prod_$DATE.sql

# MongoDB 备份
mkdir -p $BACKUP_DIR/mongodb
docker exec kodus_mongodb_prod mongodump \
  --db kodus_prod \
  --out /backup/mongodb/$DATE

# 压缩备份
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR

# 上传到 S3（如果配置了 AWS）
aws s3 cp $BACKUP_DIR.tar.gz \
  s3://kodus-backups/production/$BACKUP_DIR.tar.gz

# 清理本地备份（保留最近 7 天）
find /backups -type f -mtime +7 -delete
```

**Cron 定时任务**:

```cron
# 每天凌晨 2 点备份
0 2 * * * /scripts/backup-databases.sh
```

### 9.2 配置备份

**备份清单**:

```bash
# 环境变量备份
cp .env.prod backups/.env.prod.$(date +%Y%m%d)

# Docker 配置备份
cp docker-compose.prod.yml backups/docker-compose.prod.yml.$(date +%Y%m%d)

# Terraform state 备份（如果使用 Terraform）
aws s3 cp s3://kodus-terraform-state/ ./backups/terraform-state/
```

### 9.3 备份恢复测试

**恢复 PostgreSQL**:

```bash
# 停止服务
docker compose -f docker-compose.prod.yml down

# 恢复数据库
docker run --rm \
  -v $(pwd)/backups:/backups \
  -e PGPASSWORD=your-password \
  postgres:16 \
  psql -h prod-db-host -U prod_user -d kodus_prod < backups/kodus_prod.sql

# 重启服务
docker compose -f docker-compose.prod.yml up -d
```

**恢复 MongoDB**:

```bash
# 恢复 MongoDB
docker run --rm \
  -v $(pwd)/backups:/backups \
  mongo:8 \
  mongorestore \
  --host prod-mongo-host \
  --port 27017 \
  --username prod_user \
  --password your-password \
  --authenticationDatabase admin \
  --db kodus_prod \
  backups/mongodb
```

---

## 十、回滚准备

### 10.1 版本标记

**Semantic Versioning**:

```bash
# 创建版本标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 10.2 回滚步骤

**快速回滚**:

```bash
# 1. 停止当前版本
docker compose -f docker-compose.prod.yml down

# 2. 切换到上一个版本
git checkout v1.0.0

# 3. 重新构建和部署
./scripts/deploy.sh v1.0.0

# 4. 验证服务
yarn dev:health-check
```

**通过 Terraform 回滚**:

```bash
# 1. 更新 tfvars 为上一个版本
./scripts/update-tfvars-green.sh \
  envs/aws/prod/releases/orchestrator.auto.tfvars.json \
  registry.example.com/kodus-api:v1.0.0 \
  registry.example.com/kodus-webhooks:v1.0.0 \
  registry.example.com/kodus-worker:v1.0.0

# 2. 创建 PR
git add envs/aws/prod/releases/orchestrator.auto.tfvars.json
git commit -m "rollback: to v1.0.0"
git push origin main

# 3. 合并 PR 并 apply
```

### 10.3 蓝绿部署

**蓝绿部署流程**:

1. 部署 green 环境（新版本）
2. 验证 green 环境健康
3. 逐步切换流量到 green（10% → 50% → 100%）
4. 如果出现问题，立即回切到 blue

```bash
# 更新权重脚本
./scripts/update-tfvars-promote-weights.sh \
  envs/aws/prod/releases/orchestrator.auto.tfvars.json \
  blue_weight=0 \
  green_weight=100
```

---

## 十一、部署验证

### 11.1 部署后检查清单

**服务健康检查**:

```bash
# API 健康检查
curl http://your-domain.com:3331/health

# Webhooks 健康检查
curl http://your-domain.com:3333/health

# 检查所有容器运行状态
docker ps | grep kodus
```

**数据库连接检查**:

```bash
# PostgreSQL 连接测试
docker exec kodus_postgres_prod psql \
  -U prod_user -d kodus_prod -c "SELECT COUNT(*) FROM users;"

# MongoDB 连接测试
docker exec kodus_mongodb_prod mongosh \
  --username prod_user --password \
  --authenticationDatabase admin \
  kodus_prod --eval "db.users.countDocuments()"
```

**功能验证**:

- [ ] 用户登录/注册
- [ ] 创建代码审查
- [ ] 接收 GitHub Webhook
- [ ] 生成 PR 评论
- [ ] Worker 处理后台任务

### 11.2 性能验证

**响应时间**:

```bash
# API 响应时间测试
time curl http://your-domain.com:3331/health

# 并发测试
ab -n 1000 -c 10 http://your-domain.com:3331/health
```

**资源使用**:

```bash
# 检查容器资源使用
docker stats kodus_api_prod kodus_worker_prod kodus_webhooks_prod

# 检查内存使用
docker exec kodus_api_prod cat /proc/meminfo
```

### 11.3 日志验证

**检查错误日志**:

```bash
# 查看错误日志
docker logs kodus_api_prod 2>&1 | grep -i error

# 查看最近 100 行日志
docker logs --tail 100 kodus_api_prod

# 实时日志
docker logs -f kodus_api_prod
```

**检查 Sentry**:

- 登录 Sentry 控制台
- 检查新错误
- 验证错误报告完整

### 11.4 监控验证

**检查指标**:

- CPU 使用率 < 70%
- 内存使用 < 80%
- 请求响应时间 < 2s (P95)
- 错误率 < 1%

**检查告警**:

- 确保告警规则配置正确
- 测试告警通知
- 验证告警渠道（邮件、Slack 等）

---

## 十二、常见问题和解决方案

### 12.1 部署失败

**问题**: 容器启动失败

```bash
# 查看容器日志
docker logs kodus_api_prod

# 检查容器状态
docker inspect kodus_api_prod

# 常见原因:
# 1. 环境变量缺失
# 2. 数据库连接失败
# 3. 端口占用
# 4. 权限问题
```

**解决方案**:

```bash
# 1. 验证环境变量
docker exec kodus_api_prod env | grep API_

# 2. 测试数据库连接
docker exec kodus_api_prod nc -zv db_host 5432

# 3. 检查端口占用
netstat -tulpn | grep 3001

# 4. 重建容器
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### 12.2 数据库迁移失败

**问题**: 迁移脚本执行失败

```bash
# 查看迁移日志
docker logs kodus_api_prod | grep migration

# 检查迁移文件
ls -l libs/core/infrastructure/database/typeorm/migrations/
```

**解决方案**:

```bash
# 1. 手动执行迁移
docker exec kodus_api_prod yarn migration:run

# 2. 回滚迁移
docker exec kodus_api_prod yarn migration:revert

# 3. 修复迁移文件后重新执行
```

### 12.3 Webhook 失败

**问题**: GitHub Webhook 无法接收

```bash
# 检查 Webhook 日志
docker logs kodus_webhooks_prod | grep webhook

# 测试 Webhook 端点
curl -X POST http://your-domain.com:3333/github/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**解决方案**:

- 验证 Webhook URL 正确（公网可访问）
- 检查防火墙规则
- 验证 GitHub App 配置
- 检查签名密钥

### 12.4 Worker 任务堆积

**问题**: 后台任务处理缓慢或堆积

```bash
# 检查 RabbitMQ 队列
docker exec rabbitmq rabbitmqctl list_queues

# 检查 Worker 日志
docker logs kodus_worker_prod | grep -E "error|warning"
```

**解决方案**:

```bash
# 1. 增加 Worker 实例数
# 在 Terraform tfvars 中增加 worker_green_desired_count

# 2. 检查任务处理性能
# 查看慢查询日志

# 3. 清理堆积的任务（谨慎操作）
docker exec kodus_worker_prod yarn worker:clear-queue
```

---

## 附录

### A. 部署前检查清单总结

**代码质量**:

- [ ] ESLint 检查通过
- [ ] TypeScript 类型检查通过
- [ ] 代码格式化完成
- [ ] 依赖安全检查通过

**测试**:

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 手动功能测试完成

**环境配置**:

- [ ] 环境变量配置完整
- [ ] 数据库连接配置正确
- [ ] 安全密钥已生成
- [ ] Webhook URLs 配置正确

**数据库**:

- [ ] 数据库迁移准备完成
- [ ] Schema 创建成功
- [ ] 数据库备份完成
- [ ] 数据库连接测试通过

**安全**:

- [ ] 密钥安全检查通过
- [ ] HTTPS/TLS 配置完成
- [ ] Docker 安全配置完成
- [ ] 网络安全规则配置完成

**构建**:

- [ ] 本地构建成功
- [ ] Docker 镜像构建成功
- [ ] 多架构镜像构建成功
- [ ] 镜像启动测试通过

**CI/CD**:

- [ ] GitHub Actions 配置正确
- [ ] Workflow 测试通过
- [ ] GitOps 验证通过
- [ ] 环境配置完成

**监控**:

- [ ] Sentry 配置完成
- [ ] OpenTelemetry 配置完成
- [ ] 日志配置完成
- [ ] 健康检查端点正常

**备份和回滚**:

- [ ] 数据库备份完成
- [ ] 配置备份完成
- [ ] 备份恢复测试通过
- [ ] 回滚步骤准备完成

### B. 联系方式

- **技术支持**: support@kodus.io
- **GitHub Issues**: https://github.com/kodustech/kodus-ai/issues
- **Discord 社区**: https://discord.gg/6WbWrRbsH7
- **文档**: https://docs.kodus.io

---

**文档版本**: 1.0
**最后更新**: 2026-01-08
**维护者**: Kodus AI Team
