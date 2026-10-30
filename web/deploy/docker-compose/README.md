# Docker Compose：独立静态 UI

此目录用于纯 Docker 部署；K8s 清单单独放在 `../kubernetes/evaluation-ui.yaml`。
无需 Node 服务、PostgreSQL、Prisma、登录或权限层。

先按后端 `evaluation-backend/deploy/docker-compose/README.md` 启动 API 和 ES。
前后端是两个独立 Compose 项目，通过同名 external network 连接。

在本目录执行：

```bash
cp .env.example .env
docker compose pull
docker compose up -d --no-build --wait
```

如果目标机器已有导入的 `ianwoolf/evaluation-ui:2.2` 镜像，可跳过 pull。需要从源码构建时，使用 `docker compose build` 替代 pull。
已有 `.env` 需同步更新 EVAL_UI_IMAGE；它会覆盖 compose.yaml 的默认值。
只有 Docker 的离线机器可在构建机通过 `docker save`、目标机器通过 `docker load` 导入。

访问 http://127.0.0.1:8080。`.env` 中可改 `EVAL_UI_PORT`、镜像标签、网络名；
`EVAL_NETWORK` 必须与后端一致，默认 evaluation-compose。
需要从另一台电脑访问 UI 时，把 `EVAL_UI_BIND_ADDRESS` 改为 `0.0.0.0`，
再使用部署机器的 IP 和端口访问；默认只绑定本机。该入口是免登录单用户模式。

| 普通配置 | 用途 |
| --- | --- |
| config/ui.json | 固定项目 ID 和 API base，作为 Compose configs 挂载 |
| config/nginx.conf | 静态页面和同源 API 转发，作为 Compose configs 挂载 |

UI 不需要任何 Secret。Nginx 使用 Docker DNS 动态解析 evaluation-api，后端容器重建后
无需重新编译 UI。项目名须与后端 EVAL_DEFAULT_PROJECT_ID 一致。
修改 configs 后执行 `docker compose up -d --force-recreate`。

```bash
docker compose logs -f
docker compose down
```

本项目不会创建数据库或后端。停止 UI 不会停止后端或删除 ES 数据。
