# 精简评测工作台（当前默认部署）

本页为 **Kubernetes** 步骤；只有 Docker 的机器请看 [Docker Compose](docker-compose/README.md)。
当前前后端应用标签分别为 `evaluation-ui:deploy-v2`、`evaluation-worker:deploy-v2`。
K8s 普通配置用 ConfigMap，凭据集中在 evaluation-credentials Secret。

运行链路：浏览器 → Nginx 静态 UI / 同源 API 转发 → Evaluation API → ES / runner Job。
无需 Node Control API、PostgreSQL、Prisma migrations、登录、用户、角色或远程项目服务。

## 构建和部署

在主工程根目录使用 Bash/WSL：

```bash
docker build -f web/Dockerfile.evaluation -t evaluation-ui:deploy-v2 web
docker build -f evaluation-backend/Dockerfile.worker -t evaluation-worker:deploy-v2 evaluation-backend
bash web/deploy/kubernetes/import-local-image.sh evaluation-ui:deploy-v2 evaluation-worker:deploy-v2
kubectl --context docker-desktop apply -f evaluation-backend/deploy/kubernetes/services.yaml
kubectl --context docker-desktop apply -f web/deploy/kubernetes/evaluation-ui.yaml
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-api
kubectl --context docker-desktop -n evaluation rollout status deployment/evaluation-ui
```

services.yaml 默认 `EVAL_AUTH_MODE=none`、`EVAL_DEFAULT_PROJECT_ID=individual`。
镜像是本地构建标签，尚未推送远端。首次部署仍需 ES、上传 PVC、模型配置及内部运行
Secret，参照后端部署文档；以上命令不会创建 PostgreSQL。

若 Docker Hub 暂不可用，可先在已有本地 Node 依赖中编译，再用缓存的纯 Nginx 镜像封装：

```bash
cd web
npm run build:evaluation --workspace @tasklattice/control
docker build -f deploy/Dockerfile.evaluation-static \
  --build-arg NGINX_BASE=evaluation-ui:local-20261026 -t evaluation-ui:deploy-v2 .
```

离线示例中的基础镜像标签必须已经存在本机；它仍是 Nginx，不是 Node 服务。
标准构建使用官方 nginx-unprivileged 基础镜像。独立构建命令不会执行 Prisma generate
或加载 Nitro server，最终镜像只包含 Nginx 和静态文件。

已有全功能部署迁移后，验证新页面及 API 正常，再移除旧 Control 服务：

```bash
kubectl --context docker-desktop -n evaluation delete deployment/evaluation-control-api service/evaluation-control-api --ignore-not-found
```

旧 `ui.yaml`、Dockerfile.control 和 PostgreSQL 示例为全功能平台保留；精简部署不使用它们。
已有 PostgreSQL 容器/卷及 evaluation-ui-config Secret 不再被评测栈引用，没有自动删除其数据。

## 访问与运行时配置

```bash
bash scripts/start-ui-forward.sh
```

上面的脚本在主工程根目录运行。访问 http://127.0.0.1:8080，自动进入评测页。
Evaluation、Datasets、Environments、Scorers、Reports 页面复用原有组件；报告读取真实结果。
Scorer 编辑仍是原有 session-only 行为，不在本次拆除登录的范围内。

`evaluation-ui-runtime` ConfigMap 挂载 `/evaluation-config.json`：

```json
{"projectId":"individual","apiBase":"/api/v1/evaluations"}
```

UI 启动时加载配置，不读取浏览器旧登录 token，不请求 `/auth/*` 或 `/projects/*`。
默认同源 Nginx 转发，不需要 CORS。修改项目名时同步修改 API 的
`EVAL_DEFAULT_PROJECT_ID`；保留 individual 可继续读取现有 ES 数据。
ConfigMap 使用 subPath 挂载，修改后重启 UI Pod 生效，无需重新编译静态资源。

如配置跨源 apiBase，API 的 `EVAL_UI_ORIGINS` 使用逗号分隔的明确 UI origin，
例如 `http://localhost:8080`；CORS 允许上传、项目和幂等请求头。

## API 和内部调用

- 前端直接请求 `/api/v1/evaluations/*`，无需 Authorization。
- API 未收到项目头时自动使用部署配置；不同项目头返回 400。
- `EVAL_AUTH_MODE=token` 可切回原有 token 模式，配置需重启 API。
- runner 继续使用受 run 限定的内部 capability。EVAL_TRIGGER_TOKEN 是服务端签名配置，
  不发送给浏览器；模型解析也保持内部 token 验证。
- Nginx 不公开 `/internal/*`，旧 Control API 路径返回 404。
- API 处理请求体上限：数据集/上传 8 MB、样本 2 MB、trace 1 MB、其他写入 40 KB。

免登录模式下，所有能访问该入口的调用者都能操作部署项目的评测资源。
这对应当前单用户部署行为；ES 用户名/密码、TLS 和 OTel 配置不受影响。
