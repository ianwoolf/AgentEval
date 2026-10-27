# UI / Control API：在另一台电脑部署

当前两种部署方式独立：

- **仅 Docker：**[docker-compose/README.md](docker-compose/README.md)，先启动后端的 Compose，再启动静态 UI。
- **Kubernetes：**[STANDALONE.md](STANDALONE.md)，使用 kubernetes/evaluation-ui.yaml。

两者都不使用 Control API 或 PostgreSQL；UI JSON 与 Nginx 配置属于普通配置，不放 Secret。

**当前默认采用精简评测部署，请先看 [STANDALONE.md](STANDALONE.md)。**
它只部署静态 UI 和 Evaluation API，不使用 Control API、PostgreSQL、登录和权限层。
下文保留完整 TaskLattice 平台的历史部署方法，不适用于当前精简模式。

已发布镜像地址及架构见 [IMAGES.md](IMAGES.md)。当前上传镜像仅支持 linux/arm64。


本文是全套部署入口。命令使用 Bash（macOS/Linux/Windows WSL），在 **web 目录**执行；
后端步骤切换到独立的 evaluation-backend 仓库。不要将旧 Streamlit backend 或 web/apps/runner
当作当前评测 runner：当前 runner 是 evaluation_backend.worker，随评测 API 动态创建 Job。

## 1. 需要带走什么

- 主工程的当前代码（含 web/deploy）及独立 evaluation-backend 仓库的当前代码。
  evaluation-backend 在主仓库中被忽略，不是 submodule；只复制/clone 主仓库不会包含它。
  后端远程：git@github.com:ianwoolf/evaluation_backend.git。未提交改动需另外带走。
- 或导出已验证的应用镜像，见下方离线步骤。镜像不包含 PostgreSQL/ES 数据或 Secret。
  完全离线的新装还需提前准备 npm 依赖（首次 DB migration）和 Python 依赖/wheels（Secret 渲染）；
  仅带镜像 tar 不足以在空白开发环境完成这些工具步骤。
- 私下传递或重新创建数据库密码、session key、模型 token、后端 trigger/resolver token。
- 如需保留业务数据，迁移 PostgreSQL 和 ES；否则按后端 README 初始化全新数据。

| 部署内容 | 权威目录 | 形式 |
|---|---|---|
| UI Nginx、Control API、可选 PostgreSQL | 本目录 | Deployment / StatefulSet / Service |
| evaluation-api、ES、临时上传 PVC、RBAC | evaluation-backend/deploy | Deployment / StatefulSet / PVC |
| runner + collector + 可选 LLM proxy | evaluation-backend/runner/deploy | 每次评测动态创建 Job，共用后端镜像 |

推荐顺序：**集群 → 镜像 → namespace → Secret → PostgreSQL / ES / PVC → DB migrations → evaluation-api → Control API / UI → 业务初始化 → 验收**。

## 2. 新电脑前置条件

安装 Docker、kubectl、Python 3.10+；源码构建/数据库迁移另需 Node.js 22+、npm。
启用 Kubernetes，确认 kubectl current-context 指向目标集群。
本套默认 namespace 为 evaluation，Service 地址也使用此命名空间；首次部署建议保持不变。
建议给本地 Docker 至少 4 CPU / 8Gi 内存及足够磁盘；增加并发需相应扩容。

执行 kubectl get nodes 和 kubectl get storageclass。ES、PostgreSQL、上传卷需要可动态分配的
默认 StorageClass；无默认类时，在三个 PVC 配置中明确填写集群实际的 storageClassName。
本套单节点 ES 关闭认证，仅适合受控本地开发环境，使用 ClusterIP 和 loopback 端口转发。

## 3. 镜像：源码构建或离线迁移

源码构建（可访问 npm、Docker Hub）：

```bash
docker build --build-arg CONTROL_SPA=true --target nginx -f Dockerfile.control -t ianwoolf/evaluation-ui:20261025-none-v1 .
docker build --build-arg CONTROL_SPA=true --target control-api -f Dockerfile.control -t ianwoolf/evaluation-control-api:20261025-config-v1 .
docker pull ianwoolf/evaluation-postgres:17
```

后端镜像和 ES 按后端 deploy/README.md 构建/拉取。tag 可自定义，但需同步修改 ui.yaml、
后端 services.yaml 的 API image 及 EVAL_WORKER_IMAGE。

离线迁移：在旧电脑执行以下命令（缺少 postgres 镜像时先拉取；也可不带它并在新电脑拉取）：

```bash
docker save -o evaluation-images.tar ianwoolf/evaluation-ui:20261025-none-v1 ianwoolf/evaluation-control-api:20261025-config-v1 ianwoolf/evaluation-worker:20261025-env-v1 ianwoolf/evaluation-elasticsearch:8.18.1 ianwoolf/evaluation-postgres:17
# 将 tar 带到新电脑
docker load -i evaluation-images.tar
```

不同 CPU 架构（如 Apple ARM → x86 Windows/Linux）需要为目标架构重新构建镜像；
docker save/load 不转换架构。可用 docker buildx build --platform linux/amd64 配合 --load 或 --push。

清单已使用 ianwoolf Docker Hub 地址和 IfNotPresent，联网集群可直接拉取。
离线时才需要导入节点缓存；Docker 的缓存不等于 K8s 节点缓存：

- 标准 kind：设置 KIND_CLUSTER_NAME，然后运行 import-local-image.sh。
- Docker Desktop kind：按 kubernetes/README.md 使用 helper；默认要求已有 kindest/node:v1.36.1，
  其它版本设置 KIND_NODE_IMAGE；不适用于所有 Docker Desktop Kubernetes provisioner。
- minikube：使用 minikube image load。
- 其它/多节点集群：推送到所有节点可访问的仓库，修改 image 和 imagePullPolicy 为 IfNotPresent，
  必要时配置 imagePullSecrets（动态 worker Pod 也需可拉取，参见 runner 文档）。

```bash
bash deploy/kubernetes/import-local-image.sh ianwoolf/evaluation-ui:20261025-none-v1 ianwoolf/evaluation-control-api:20261025-config-v1 ianwoolf/evaluation-postgres:17
```

## 4. PostgreSQL 和 Control 配置

创建命名空间：
```bash
kubectl create namespace evaluation --dry-run=client -o yaml | kubectl apply -f -
```

新电脑没有 PostgreSQL 时，使用 deploy/kubernetes/postgresql.yaml（ianwoolf/evaluation-postgres:17、5Gi PVC）。
先将 examples/postgres.env.example 复制到仓库外私有目录，填写强密码；不要使用示例占位值。

```bash
kubectl -n evaluation create secret generic evaluation-postgres --from-env-file=/absolute/private/postgres.env --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/kubernetes/postgresql.yaml
kubectl -n evaluation rollout status statefulset/evaluation-postgres --timeout=180s
```

已有外部数据库时跳过该清单，确保 Pod 可以访问数据库。新的 PostgreSQL Secret 只负责首次初始化，
不能通过修改 Secret 自动更改已有 PVC 内的数据库密码。

复制 examples/control.toml.example 到仓库外，替换数据库密码、session key、初始管理员 bcrypt hash。
public_url 必须与浏览器访问的地址一致，默认 http://127.0.0.1:18082。
密码中 URL 特殊字符必须百分号编码。可用 Python secrets.token_urlsafe(32) 生成随机 secret。
bcrypt hash 可在已 npm ci 的 web 目录生成（输入隐藏，hash 写入配置；不要使用明文密码字段）：

```bash
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
printf '%s' "$ADMIN_PASSWORD" | node --input-type=module -e 'import bcrypt from "bcryptjs"; let s=""; for await (const b of process.stdin) s+=b; console.log(await bcrypt.hash(s,12));'
unset ADMIN_PASSWORD
```

### 首次数据库迁移（必须）

精简的 control-api 镜像不会自动执行 migrations。先在单独终端转发 PostgreSQL：
```bash
kubectl -n evaluation port-forward service/evaluation-postgres 55432:5432 --address 127.0.0.1
```
迁移用的本机 TOML 数据库地址设为 127.0.0.1:55432（其它配置与集群一致），再执行：
```bash
npm ci
export TASKLATTICE_CONFIG=/absolute/private/control-migration.toml
npm run db:migrate:control
unset TASKLATTICE_CONFIG
```
已有数据库升级前先备份。迁移命令使用 Prisma 的 tasklattice schema。

将配置写入 K8s Secret，renderer 会保留认证设置、替换数据库 host/port：
```bash
set -o pipefail
python3 deploy/kubernetes/render_ui_secret.py --config /absolute/private/control-migration.toml --database-host evaluation-postgres --database-port 5432 | kubectl apply -f -
```
外部数据库则使用实际可达 host/port，不能沿用旧电脑的 host.docker.internal:55432。
确保后端已创建 evaluation-trigger Secret；Control API 从该 Secret 读取代理 token。

## 5. 部署 UI、访问

完成后端 deploy/README.md 后：
```bash
kubectl apply -f deploy/kubernetes/ui.yaml
kubectl -n evaluation rollout status deployment/evaluation-control-api --timeout=180s
kubectl -n evaluation rollout status deployment/evaluation-ui --timeout=180s
bash deploy/port-forward.sh 18082 9200
```
保持终端打开。浏览器 http://127.0.0.1:18082，ES http://127.0.0.1:9200。
Nginx 已代理 /api，不用单独暴露 API。Pod 重建后需重启端口转发。
首次登录使用配置中的 initial_super_admin_username 和对应密码。

验收：/healthz 返回 ok、/api/health 可用；登录后检查 dataset/environment/target Config；
先用 modelId=none + mock-score 验证流程，再验证 glm-dev 的模型调用。
mock-score 恒为 1，不代表真实质量；none 模式不能直接用要求 output.has_issue 的分类打分器，
除非输入本身符合它的要求。

## 6. 迁移数据和排错

- PostgreSQL：用 pg_dump / pg_restore 保留 tasklattice schema、用户和项目；恢复后再迁移。
- ES：使用兼容版本的 snapshot/restore 或经 API 导出/导入数据；只复制镜像不会带走数据。
  保留原有 project ID，否则数据会因项目隔离看不到。
- 运行中临时上传不能当作持久 dataset 迁移；停止新触发并等待运行结束后迁移。
- K8s Job 历史是集群资源；只恢复 ES 不会恢复 UI 通过 Job 查询的运行列表。历史迁移需另外设计，
  不要直接在新集群重放已完成 Job 的 YAML（会再次执行评测）。
- Pending：检查 PVC、StorageClass、资源；ErrImageNeverPull：镜像没进节点或 tag/架构不匹配。
- UI 502：检查 Control/API Service 和 Pod；登录错误：检查 PostgreSQL migrations、TOML、public_url。
- Pod Ready 但浏览器不通：检查端口转发，避免把集群内 8080 当成本机端口。
- 更新使用新镜像 tag；不要为更新应用删除 namespace/PVC。Secret 文件和数据库备份不提交 Git。

本目录配置未自动应用到当前集群，PostgreSQL 清单仅供新部署选择使用。
