# Docker Compose 命名卷数据磁盘迁移指南

在 `docker-compose.server.yml` 中部署应用时，默认的命名卷（Named Volume）会占用系统主分区空间。如果家目录（`~`）或主磁盘空间不足，可以通过以下几种成熟的方案，将原有的卷数据安全、优雅地迁移到其他磁盘或指定物理路径中。

---

## 方案一：使用 Local 驱动的 bind 绑定（保持 Compose 引用干净）

**适用场景**：希望在 `docker-compose.server.yml` 中继续保留命名卷的引用名称（各 service 定义不改动），仅在底部通过 `local` 驱动将其实际物理存储指向新宿主机磁盘路径。

### 1. 停止容器运行
进入 `docker-compose.server.yml` 所在目录，停止容器（**切勿加 `-v` 选项，以防删除数据**）：
```bash
docker-compose -f docker-compose.server.yml down
```

### 2. 在新宿主机磁盘上创建目标目录
在新磁盘（例如 `/mnt/new_disk`）上为各个卷创建专属的数据存放文件夹：
```bash
mkdir -p /mnt/new_disk/kodus-data/pgdata
mkdir -p /mnt/new_disk/kodus-data/mongodbdata
mkdir -p /mnt/new_disk/kodus-data/rabbitmq_data
mkdir -p /mnt/new_disk/kodus-data/kodus_ast_logs
mkdir -p /mnt/new_disk/kodus-data/kodus_mcp_manager_logs
```

### 3. 使用临时容器同步数据（保留文件权限）
利用临时的轻量级容器将旧的命名卷数据复制到新宿主机路径中，这能完美保留文件所有者和读写权限（对数据库的一致性至关重要）：
```bash
docker run --rm -v pgdata:/source -v /mnt/new_disk/kodus-data/pgdata:/target alpine sh -c "cp -a /source/. /target/"
docker run --rm -v mongodbdata:/source -v /mnt/new_disk/kodus-data/mongodbdata:/target alpine sh -c "cp -a /source/. /target/"
docker run --rm -v rabbitmq_data:/source -v /mnt/new_disk/kodus-data/rabbitmq_data:/target alpine sh -c "cp -a /source/. /target/"
docker run --rm -v kodus_ast_logs:/source -v /mnt/new_disk/kodus-data/kodus_ast_logs:/target alpine sh -c "cp -a /source/. /target/"
docker run --rm -v kodus_mcp_manager_logs:/source -v /mnt/new_disk/kodus-data/kodus_mcp_manager_logs:/target alpine sh -c "cp -a /source/. /target/"
```

### 4. 彻底清理旧的命名卷
在完成上述数据同步备份后，删除原有的这几个命名卷：
```bash
docker volume rm pgdata mongodbdata rabbitmq_data kodus_ast_logs kodus_mcp_manager_logs
```

### 5. 修改 `docker-compose` 配置中的 `volumes` 部分
您可以利用 **YAML 别名与锚点（YAML Anchors）** 机制大幅度简化底部的配置编写，避免重复的 `type: none` 与 `o: bind` 行：

```yaml
volumes:
  pgdata:
    driver: local
    driver_opts: &local_opts
      type: none
      o: bind
      device: /mnt/new_disk/kodus-data/pgdata

  mongodbdata:
    driver: local
    driver_opts:
      <<: *local_opts
      device: /mnt/new_disk/kodus-data/mongodbdata

  rabbitmq_data:
    driver: local
    driver_opts:
      <<: *local_opts
      device: /mnt/new_disk/kodus-data/rabbitmq_data

  kodus_ast_logs:
    driver: local
    driver_opts:
      <<: *local_opts
      device: /mnt/new_disk/kodus-data/kodus_ast_logs

  kodus_mcp_manager_logs:
    driver: local
    driver_opts:
      <<: *local_opts
      device: /mnt/new_disk/kodus-data/kodus_mcp_manager_logs
```

### 6. 重新启动服务
```bash
docker-compose -f docker-compose.server.yml up -d
```

---

## 方案二：转换为 Bind Mount 极简路径映射（推荐 🌟 最简配置）

**适用场景**：追求最直观的 `宿主机路径:容器路径` 映射。此方案**完全不需要任何 `driver` 或 `device` 参数**，甚至可以**将最底部的 `volumes:` 块彻底删掉**，配置非常清爽。

> [!NOTE]
> Docker Compose 规范为了保障驱动通用性，在全局最底部的 `volumes:` 块中不支持声明 `path: path`；但我们可以直接在各服务挂载处以 `宿主机物理路径:容器路径` 的极简格式进行绑定。

### 1. 停止容器运行并同步数据
此步骤同方案一中的 **第 1、2、3 步**，先停止容器，再将旧卷数据复制到新宿主机路径下。

### 2. 修改 `docker-compose.server.yml` 服务配置
直接修改各服务（services）中的 volumes 选项，并将最底部的 `volumes:` 块完全移除。

修改示例：
```yaml
services:
  # 1. 更改 Postgres 服务的挂载
  db_postgres:
    # ...
    volumes:
      - /mnt/new_disk/kodus-data/pgdata:/var/lib/postgresql/data
      - ./docker/postgres/initdb.d:/docker-entrypoint-initdb.d

  # 2. 更改 MongoDB 服务的挂载
  db_mongodb:
    # ...
    volumes:
      - /mnt/new_disk/kodus-data/mongodbdata:/data/db

  # 3. 更改 RabbitMQ 服务的挂载
  rabbitmq:
    # ...
    volumes:
      - /mnt/new_disk/kodus-data/rabbitmq_data:/var/lib/rabbitmq

  # 4. 更改 AST 日志挂载
  kodus-ast:
    # ...
    volumes:
      - /mnt/new_disk/kodus-data/kodus_ast_logs:/app/logs

  # 5. 更改 MCP Manager 日志挂载
  kodus-mcp-manager:
    # ...
    volumes:
      - /mnt/new_disk/kodus-data/kodus_mcp_manager_logs:/app/logs

# ====================================================================
# [注意] 全局最底部的 `volumes:` 声明块在此方案中需要被【彻底删除】，行数减为 0。
# ====================================================================
```

### 3. 重启启动服务
使用修改后的极简配置文件启动：
```bash
docker-compose -f docker-compose.server.yml up -d
```
在确认容器完美运行且数据无误后，可以使用 `docker volume rm` 清理掉不再使用的旧命名卷。

---

## 方案三：Linux 整体迁移 Docker 数据根目录（100% 零修改配置）

**适用场景**：主分区空间严重不足是由于所有的镜像（Images）、容器（Containers）和卷共用导致，希望将整个 Docker 的数据目录一劳永逸平移到新宿主机盘。

### 1. 停止 Docker 守护进程
```bash
sudo systemctl stop docker
```

### 2. 整体同步原有数据
使用 `rsync` 确保高保真度（保持软链、权限等）平移整个 Docker 目录：
```bash
sudo mkdir -p /mnt/new_disk/docker
sudo rsync -aXS /var/lib/docker/ /mnt/new_disk/docker/
```

### 3. 修改 Docker 配置文件
编辑 `/etc/docker/daemon.json`（如果不存在该文件，则直接新建），加入以下内容：
```json
{
  "data-root": "/mnt/new_disk/docker"
}
```

### 4. 重启 Docker 进程
```bash
sudo systemctl daemon-reload
sudo systemctl start docker
```
通过命令 `docker info | grep "Docker Root Dir"` 确认输出路径已变为 `/mnt/new_disk/docker`。至此，您的 `docker-compose.server.yml` **不需要做任何改动**，启动容器即可自动读写新宿主机路径。

---

## 方案四：macOS Docker Desktop 虚拟磁盘位置迁移

**适用场景**：在 Mac 本地开发测试，发现 Docker 虚拟磁盘占满了 `~` 目录。

因为 macOS 下的 Docker 跑在专用的轻量级虚拟机内，其所有卷和镜像被打包保存在一个巨大的虚拟磁盘映像文件（`.raw` 或 `.qcow2`）中。您可以通过官方客户端图形界面进行全自动的无损迁移：

1. 打开 **Docker Desktop**。
2. 点击右上角的 **Settings** (齿轮图标)。
3. 在左侧栏中选择 **Resources** -> **Virtual disk**。
4. 找到 **Disk image location**，点击 **Browse** 选择外接到 Mac 上的外部磁盘路径。
5. 点击右下角的 **Apply & restart**。

Docker 引擎会安全关闭并自动将您现有的所有镜像、容器及 Named Volume 数据完整迁移到新宿主机磁盘路径中，彻底释放家目录空间。
