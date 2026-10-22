# 本机 Kubernetes：Nginx UI + Control API

目标 context：`docker-desktop`，namespace：`evaluation`。前后端分别构建部署：

- `evaluation-ui`：纯 Nginx 静态 SPA，只有 HTML/JS/CSS/图片，无 Node、node_modules、数据库配置或凭据。
- `evaluation-control-api`：精简 Node 服务，仅复制 Nitro 的 `.output/server` 和必要目录；提供登录、项目权限、数据库与评测代理。不携带整套 workspace 依赖或 Prisma migration CLI。
- Nginx 将 `/api/`、`/auth/`、`/_server/` 同源代理到 Control API，深链接回退到 SPA shell；不存在的静态资源返回 404。
- PostgreSQL 复用本机 `tasklattice-dev-postgres`，API Pod 连接 `host.docker.internal:55432`。
- 评测后端使用集群内 `http://evaluation-api.evaluation.svc.cluster.local:8001`。
- API 引用现有 Secret `evaluation-trigger/token`；Nginx 不挂载 Secret。

## 构建与部署

主工程根目录、WSL Ubuntu 中执行：

```bash
docker build --build-arg CONTROL_SPA=true --target nginx -f web/Dockerfile.control -t evaluation-ui:nginx-20261020-1 web
docker build --build-arg CONTROL_SPA=true --target control-api -f web/Dockerfile.control -t evaluation-control-api:20261020-1 web
bash web/deploy/kubernetes/import-local-image.sh evaluation-ui:nginx-20261020-1
bash web/deploy/kubernetes/import-local-image.sh evaluation-control-api:20261020-1
python3 web/deploy/kubernetes/render_ui_secret.py --config data/control.dev.toml \
  | kubectl --context docker-desktop apply -f -
kubectl --context docker-desktop apply -f web/deploy/kubernetes/ui.yaml
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-control-api --timeout=300s
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-ui --timeout=180s
kubectl --context docker-desktop -n evaluation port-forward service/evaluation-ui 18082:8080 --address 127.0.0.1
```

两次 build 复用同一个 SPA 构建缓存，`CONTROL_SPA=true` 使用 TanStack Start 的静态 shell。构建时仅使用仓库中的非私密配置模板；`TASKLATTICE_PRERENDER=true` 跳过后台数据库任务。运行 API 时不要设置这个构建变量。

`render_ui_secret.py` stdout 含秘密，只直接管道给 kubectl，不记录或提交。可用 `--database-host` / `--database-port` 改地址。配置中的 public_url 应与浏览器地址一致。镜像不运行数据库 migration；需要升级 schema 时，先使用原工程的 `npm run db:migrate:control` 对指定数据库执行迁移，再部署 API。当前继续使用已迁移的现有数据库。

`import-local-image.sh` 仅适配本机 Docker Desktop kind 节点，使用 docker-desktop WSL 发行版导入节点 containerd；不会推送远程仓库。其他集群使用自己的镜像加载或受控仓库方案。清单使用 imagePullPolicy=Never，镜像必须先导入。

18082 被 Vite 占用时，只停止确认属于此项目的开发进程，再运行 port-forward；`data/start-control.sh` 保留作开发入口。Docker Compose 明确选择旧 `runtime` target，维持原一体化开发启动方式。更新部署使用新 tag 并修改 YAML；不要把浏览器连接到旧 Vite 页面误判为镜像更新。

## 验证

```bash
kubectl --context docker-desktop -n evaluation get deployments,pods,services
curl --fail http://127.0.0.1:18082/healthz
curl --fail http://127.0.0.1:18082/api/health
```

验证登录、刷新深链接、项目配置和既有任务查询。API 路径不能被 SPA fallback 吞掉；`/assets/not-found.js` 必须返回 404。真实 Trigger 会调用模型，部署验收优先使用配置和既有任务的只读查询。

只有 Control API 访问 PostgreSQL、持有私有 Trigger token。两类 Pod 均不挂 Kubernetes token 或容器运行时 socket。删除 UI/API Deployment 不影响原数据库、评测 API 或 Langfuse；不要删除整个 evaluation namespace。
