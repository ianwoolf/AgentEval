# 换机接续开发指南

> **2026-10-20 状态更新**：真实 Trigger → Kubernetes Job → Langfuse 与报告恢复已接通；资源编辑仍是 UI 演示，真实执行目前使用 mock-score。当前实现、部署、限制与接续工作见 [分支交接](2026-10-20-branch-handoff.md)。下文较早日期的“无真实执行/纯模拟/未实现后端”描述为历史记录，不能代表当前 Trigger 状态。独立后端在被主仓库忽略的 `evaluation-backend/` 中单独管理 Git。

本轮日期：2026-10-18。代码提交：`a63c899`。

## 1. 仓库与分支

- 目标仓库：`git@github.com:ianwoolf/AgentEval.git`
- 开发分支：`codex/tali-pre-guardrail-ui`
- `origin` 是 ianwoolf/AgentEval；原上游是 Idddd/AgentEval。
- 本轮推送到上述开发分支，未合并默认分支。

首次获取：

```bash
git clone --branch codex/tali-pre-guardrail-ui git@github.com:ianwoolf/AgentEval.git
cd AgentEval
```

已有仓库：先确认没有未保存的本地改动，再执行：

```bash
git remote -v
git fetch origin
git switch codex/tali-pre-guardrail-ui
git pull --ff-only origin codex/tali-pre-guardrail-ui
```

## 2. 当前交付状态

Evaluation 下的 Eval / Datasets / Environments / Scorers / Reports 都是交互 UI 演示。Observer 中 Dashboard 排在第一项。

默认 Dataset 是 **Guardrail conversation safety**：6 条 case，每条包含 messages（system/user 消息数组）、has_issue（是否有风险的布尔标准答案）和 category。报告显示模拟检测值、标准答案、误报、漏报、样本 Trace 和评分理由。

- 没有真实沙箱、LLM 请求、Guardrail 拦截或自定义代码执行。
- 新工作台状态在内存中，刷新、离开 Evaluation 布局或切换项目会重置。
- 旧 Dashboard/Traces/旧详情页仍使用独立的旧 fixture store，尚未和新工作台联动。
- UI 登录需要 PostgreSQL；本轮新页面不需要 Python API 即可演示。
- 本机 `frontend/` 仅是旧 node_modules 残留，未提交；真正的前端是 `web/`。

## 3. 新电脑准备与启动（macOS / Linux）

准备 Docker、npm 和兼容的 Node.js。锁文件中 jsdom 30 要求 Node `^22.22.2 || ^24.15.0 || >=26`；建议用 Node 24.15+。安装后先确认 `node --version`，不需要沿用旧电脑的 Homebrew 绝对路径。

### 数据库

启动 Docker Desktop / Docker daemon。首次创建项目专用开发库：

```bash
docker run -d --name tasklattice-dev-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=tasklattice \
  -e POSTGRES_PASSWORD=development \
  -e POSTGRES_DB=tasklattice \
  -p 127.0.0.1:55432:5432 \
  -v agenteval-dev-postgres:/var/lib/postgresql/data \
  postgres:17
```

如果已存在该容器，使用 `docker start tasklattice-dev-postgres`，不要重复创建或删除数据。检查就绪：

```bash
docker exec tasklattice-dev-postgres pg_isready -U tasklattice -d tasklattice
```

### 本地配置

在仓库根目录执行（仅生成本地演示配置，不包含生产凭证）：

```bash
mkdir -p data
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const template = readFileSync('web/control.compose.toml', 'utf8');
writeFileSync('data/control.dev.toml', template.replace('@postgres:5432/', '@127.0.0.1:55432/'));
JS
```

`data/` 被 Git 忽略，需要在每台新电脑上生成。模板账号为 `admin / admin`，仅用于本地演示。

### 安装、迁移和启动

```bash
cd web
npm ci
npm run build --workspace @tasklattice/contracts
export TASKLATTICE_CONFIG="$PWD/../data/control.dev.toml"
npm run db:generate:control
npm run db:migrate:control
HOST=127.0.0.1 PORT=18082 npm run dev:control
```

访问 `http://127.0.0.1:18082/individual/evaluation/catalog`，使用 `admin / admin` 登录。Ctrl+C 停止前端；数据库容器可以保留运行。不要将本地开发配置和凭证上传到仓库。

Windows 可参考根目录 `start-dev.ps1`（它还会启动 Python API，需要按 README 创建虚拟环境并安装 Python 依赖）。该脚本预期 `postgres:17-alpine`，不要直接复用上面创建的 `postgres:17` 同名容器来执行该脚本。

### Python API（按需）

只有调试旧 API 或开始后端集成时才需要。另开终端，在仓库根目录执行：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

启动前端时额外设置 `EVAL_API_URL=http://127.0.0.1:8000`。具体 Python 版本要求见根目录 README。

## 4. 验证命令

从 `web/` 目录运行：

```bash
# 全量测试使用默认配置，不注入本地开发 TOML
# SMTP 测试会启动回环监听；受限沙箱可能需要允许绑定端口。
env -u TASKLATTICE_CONFIG npm test
node node_modules/typescript/bin/tsc -p apps/control/tsconfig.json --noEmit
TASKLATTICE_CONFIG="$PWD/../data/control.dev.toml" npm run build:control
```

本轮最终提交前：448 项 Web workspace 测试通过（Control 421 + example MCP 2 + Runner 25），TypeScript 通过。开发配置的 public_url=18082 会影响一个默认期望 8080 的测试，因此测试时需要移除 TASKLATTICE_CONFIG。

## 5. 接续阅读顺序

2026-10-19 补充：[Evaluation 后端执行设计](backend-execution-design.md) 汇总当前模块、所需接口/数据、OpenShell 资源加载与执行流程，以及可切换 Langfuse/LangSmith 的 ResultSink + outbox 方案。该文档为拟议设计，尚未实现后端服务。

1. [接口与集成说明](ui-integration.md)：现有功能、拟议 v2 API、版本规则、错误码、事件流、旧后端迁移及 Guardrail 样本格式。
2. [本轮设计](../superpowers/specs/2026-10-18-evaluation-workbench.md)。
3. [实施记录](../superpowers/plans/2026-10-18-evaluation-workbench.md)。
4. `web/apps/control/src/features/evaluation-workbench/contracts.ts`：UI DTO 与拟议 wire contract。
5. 同目录 `domain.ts` / `provider.tsx`：当前 fixture、模拟逻辑、内存状态；后端接入时替换这些边界。
6. `src/api/routers/` 和 `src/api/dto.py`：旧 Python API 及适配入口。

建议下一步先明确 dataset / environment / scorer 的持久化模型和版本引用，再替换前端 store；拟议 v2 endpoint 当前尚未实现。旧 Dashboard/Traces 联动也需要统一 evaluation/sample ID，不能把模拟状态当成真实执行结果。

## 6. 不会随 Git 同步的内容

node_modules、Python .venv、data/control.dev.toml、本地数据库、运行日志、浏览器内编辑的演示数据均不会随代码同步。首次启动会使用提交的 fixtures；若本机编辑的数据需要带走，应在离开前单独导出或转为受控 fixture，勿提交私密数据。
