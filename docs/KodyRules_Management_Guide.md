# Kody Rules 管理与维护指南

本文档旨在为用户和开发者提供关于 Kodus-ai 中 Kody Rules 的管理、维护及 Workspace 隔离机制的详尽指南。

## 1. Workspace (Organization) 隔离机制

Kodus-ai 使用 **Organization** (通常称为 Workspace) 作为最高级别的资源隔离边界。

### 1.1 隔离原理
每个 Organization 在创建时都会分配一名唯一的 `UUID` 和 `Tenant ID`。系统内所有资源（包括 Repository, Kody Rules, Team Members, Metrics 等）均硬性与 `Organization ID` 绑定。
这意味着：
*   **规则隔离**：Organization A 定义的 Rules 绝对不会影响到 Organization B。
*   **配置独立**：每个 Workspace 拥有独立的 AI 审查敏感度、Bot配置等参数。

### 1.2 创建隔离的 Workspace
当前，如果您需要一个新的隔离环境（例如为不同部门或客户建立完全独立的数据空间），请按照以下步骤操作：

1.  **联系管理员**：对于本地部署版，通常通过 Admin 界面或数据库直接初始化新的 Organization。
2.  **SaaS 版本**：通常通过用户界面上的 "Create New Workspace" 流程进行。
3.  **API 接入 (仅限内部开发)**：可通过 `POST /organizations` 接口创建，系统将自动配置 Tenant 隔离环境。

---

## 2. Kody Rules 层级体系

Kody Rules 采用两级继承体系，确保了组织规范的统一性，同时保留了项目级的灵活性。当进行代码审查时，Kody 会合并这两级规则。

### 2.1 规则生效逻辑
系统在获取规则时，会同时加载以下两类规则：
1.  **Global Rules (全局规则)**：`repositoryId = 'global'`
2.  **Repository Rules (仓库级规则)**：`repositoryId = {current_repo_id}`

> **注意**：如果两者存在冲突，通常建议通过规则描述的具体程度来区分，或在 Local Rule 中明确覆盖 Global Rule 的场景。

### 2.2 Global Rules (全局规则)
*   **作用范围**：该 Workspace 下的所有 Repositories。
*   **适用场景**：
    *   全公司通用的编码规范 (如 "禁止在代码中硬编码 Secret").
    *   由于安全合规要求的通用检查。
*   **管理方式**：
    *   **UI (推荐)**：通过 Kodus Dashboard 的 "Global Rules" 面板进行增删改查。
    *   **API**：在创建规则时，通过 API 将 `repositoryId` 设置为 `'global'`。

### 2.3 Per Repository Rules (仓库级规则)
*   **作用范围**：仅针对特定的 Repository。
*   **适用场景**：
    *   项目特有的架构约束 (如 "此项目使用 Hexagonal Architecture").
    *   特定框架的最佳实践 (如 "Next.js 项目使用 `next/image` 而非 `<img>`").
*   **管理方式**：
    *   **UI**：在 Repository 详情页的 Rules 列表中管理。
    *   **文件同步 (File Sync)**：直接在代码仓库中维护规则文件（这是推荐的 "Config as Code" 方式）。

---

## 3. 仓库级规则的维护指南 (File Sync)

Kodus-ai 支持从代码仓库中自动提取和同步规则。通过在仓库中提交特定的配置文件，您可以像管理代码一样管理 Kody Rules。

### 3.1 支持的文件类型
Kody 会自动扫描并解析以下路径的文件：

*   **Cursor Rules**: `.cursorrules`, `.cursor/rules/**/*.mdc`
*   **Kodus Native**: `.kody/rules/**` (推荐), `.rules/**/*`
*   **IDE/Agent Docs**: `CLAUDE.md`, `.agent.md`, `.agents.md`
*   **Windsurf**: `.windsurfrules`
*   **其他工具**: `Sourcegraph Cody` 规则, `Aider` 配置等。
*   **文档**: `docs/coding-standards/**/*`

### 3.2 自动同步机制 (Sync)
当您在该仓库提交 (Push) 代码或创建 Pull Request 时，Kodus 会检测上述文件的变更：
*   **新增/修改文件**：自动将其解析为 Kody Rule 并存储到数据库，`repositoryId` 绑定当前仓库。
*   **删除文件**：自动归档或标记删除对应的 Kody Rule。

### 3.3 高级指令
在规则文件中，您可以使用特殊的指令来控制同步行为：

#### `@kody-sync` (强制同步)
默认情况下，如果此时 Sync 功能被禁用（例如在测试阶段），Kodus 可能不会同步文件。
在文件任意位置添加 `@kody-sync` 注释，即使全局 Sync 被禁用，该文件仍会被强制同步。

```markdown
<!-- @kody-sync -->
# Always use camelCase for variables
...
```

#### `@kody-ignore` (忽略文件)
如果您希望某个符合命名规范的文件 **不被** 解析为 Kody Rule，可以在文件内容中添加 `@kody-ignore`。

```markdown
<!-- @kody-ignore -->
This file contains internal documentation, not rules.
```

## 4. 常见问题解答 (FAQ)

**Q: 我可以直接在 UI 上修改由文件同步生成的规则吗？**
A: 可以，但 **不推荐**。下次仓库文件更新时，UI 上的手动修改可能会被覆盖。建议遵循 "Single Source of Truth"，对于文件同步的规则，请直接修改文件。

**Q: 目录下支持级联规则吗？**
A: 支持。如果在 Monorepo 结构中定义了 `directories` (如 `apps/frontend`, `apps/backend`)，规则可以关联到特定的 Directory ID，从而仅对该子目录下的代码生效。

**Q: 如何批量导入规则？**
A: 目前可以使用 `Generate Kody Rules` 功能，或者直接将现有的 Markdown 规则文件批量提交到仓库的 `.kody/rules/` 目录下，等待自动同步完成。
