# 本地 K8s：UI / Control API 与部署总览

完整链路：浏览器 → Nginx → Control API → evaluation-api → worker Job → 模型服务。
Control API 访问 PostgreSQL；evaluation-api/collector 使用 ES。旧 Langfuse 不参与此链路。

| 部署对象 | 所在仓库 / 清单 | 必需依赖 |
|---|---|---|
| evaluation-ui (Nginx) | 本目录 ui.yaml | Control API Service |
| evaluation-control-api (Node) | 本目录 ui.yaml | PostgreSQL、evaluation-ui-config Secret、evaluation-trigger Secret |
| evaluation-api | 后端 deploy/kubernetes/services.yaml | 模型 Secret、ES、上传 PVC、Job RBAC |
| evaluation-es | 后端 deploy/kubernetes/elasticsearch.yaml | 默认 StorageClass，5Gi PVC |
| 临时上传 PVC | 后端 deploy/kubernetes/uploads.yaml | 1Gi RWO；API 单副本 |
| worker Job | evaluation-api 按请求动态创建 | 节点内 worker 镜像、runtime ConfigMap、runner Secret |

后端部署细节见独立 `evaluation-backend` 仓库 `deploy/kubernetes/README.md`。
先部署后端 namespace、Secrets、ES、上传卷和 API，再部署本目录。
无需独立的 collector、LLM proxy、Langfuse 或 OpenShell Deployment；worker 内启动前两者。

## PostgreSQL 与密钥

当前复用宿主机 `tasklattice-dev-postgres`（postgres:17），本机 55432 → 容器 5432；
Pod 连接 `host.docker.internal:55432`。它不是本目录管理的 K8s 数据库，必须独立保留数据卷。
新机器可使用自有 PostgreSQL；通过 `render_ui_secret.py --database-host/--database-port`
指定可从 Pod 访问的地址。Control schema 由 `npm run db:migrate:control` 迁移，镜像不自动迁移。

`evaluation-ui-config` 保存 control.toml（数据库、认证、session 设置）；必须保留已有
认证/session 密钥。`evaluation-trigger/token` 由后端部署准备，两边共用。Nginx 不挂载秘密。
Secret 渲染输出只管道给 kubectl，勿提交或打印。public_url 应为 `http://127.0.0.1:18082`。

## 构建与部署（主工程根目录执行）

```bash
docker build --build-arg CONTROL_SPA=true --target nginx -f web/Dockerfile.control -t evaluation-ui:local-config-v1 web
docker build --build-arg CONTROL_SPA=true --target control-api -f web/Dockerfile.control -t evaluation-control-api:local-config-v1 web
bash web/deploy/kubernetes/import-local-image.sh evaluation-ui:local-config-v1 evaluation-control-api:local-config-v1
python3 web/deploy/kubernetes/render_ui_secret.py --config data/control.dev.toml | kubectl --context docker-desktop apply -f -
kubectl --context docker-desktop apply -f web/deploy/kubernetes/ui.yaml
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-control-api --timeout=180s
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-ui --timeout=180s
kubectl --context docker-desktop -n evaluation port-forward service/evaluation-ui 18082:8080 --address 127.0.0.1
```

脚本使用本地 Docker Desktop kind 单节点的临时 privileged helper 导入 containerd；
支持 macOS/Linux/WSL，不再依赖 wsl.exe。默认 helper 镜像 `kindest/node:v1.36.1` 必须已存在；
可设置 `KIND_NODE_IMAGE`。标准 kind 集群设置 `KIND_CLUSTER_NAME` 使用 kind CLI。
重建集群后 Docker 镜像仍在但节点缓存为空，需重新导入三个应用镜像和 ES 镜像。
本地 YAML 使用 `imagePullPolicy: Never`。不要只检查 docker images。

## 访问与检查

- UI：`http://127.0.0.1:18082`（转发至集群 8080）。
- ES：另开 `kubectl -n evaluation port-forward service/evaluation-es 9200:9200 --address 127.0.0.1`。
- 评测 API：集群内 `http://evaluation-api:8001`，通常不需要暴露。
- PostgreSQL：宿主机 55432，浏览器不直接访问。

```bash
kubectl --context docker-desktop -n evaluation get pods,svc,pvc
curl --fail http://127.0.0.1:18082/healthz
curl --fail http://127.0.0.1:18082/api/health
```

登录后检查 Dataset、Environment、target Provider/Config。Config 保存可复用的运行选择；
Trigger 默认只填可选名称。upload 模式每次仍需上传 CSV/XLSX，不会把临时文件保存在 Config。
新增 Config 只保存选择，不启动 Job。评测会调用实际模型；当前 mock-score 固定 1 分只验证流程。

更新使用新 tag 并同步 YAML；Pod 更换后重新建立 port-forward。不要删除 namespace 或 PVC
来解决镜像问题。镜像导入不恢复 ES 数据、PostgreSQL、Secrets，重建前需单独备份。
