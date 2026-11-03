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

### 2026-10-30: multi-dataset trigger and report comparison

Trigger now selects one or more published dataset versions (defaulting to the
saved target Config dataset); upload mode validates one upload per selected
version. Environment/model/scorers remain target Config-owned. A single run ID
covers all selected datasets. Backend pins the selection, runner executes each
dataset with unique sample IDs, and the report API aggregates per-dataset metrics
across all sample pages. Live reports show a comparison table and dataset sample
filter. Old single-dataset runs and trigger requests remain compatible.
See the independent backend README's Multi-dataset evaluations section for the
request/response and existing-index schema changes.

Target configuration now owns a multi-select `datasets` list with pinned versions.
Trigger defaults to all configured selections and permits only a nonempty subset;
versions cannot be changed in Trigger. The target trigger API rejects unconfigured
dataset/version pairs, including for legacy single-dataset configurations.


### 2026-11-02: Guardrail 专项评测设计与实施入口

用户已授权实施。已完成基础数据契约/统计函数和示例 scorer；独立 mock Guardrail 已部署。主链路与专项 UI 尚未完成，当前页面不会出现专项改版。

- 设计：[Guardrail 专项评测](designs/2026-11-02-guardrail-evaluation.md)。
- 进度与恢复：[实施计划](designs/2026-11-02-guardrail-evaluation-plan.md)。
- 最新配置、测试证据与待办以实施计划的“当前运行配置与用户可见状态”一节为准。下一步补齐发布绑定/Git artifact readiness，再接 Trigger/proxy/runner/report/UI。
- 实施时每完成一个子任务就更新台账；中断前记录下一操作、测试、部署及未提交状态。
- 本专项 Trigger 选择 target + datasets + environment；dataset 自带 scorer/aspect。普通 dataset 不变。
- 注意 model=none 不能跳过 Guardrail 调用；Git scorer 必须与持有 token 的 proxy 隔离。
- 本节和新设计优先于旧文档中本专项的 dataset 子集限制、共享 scorer 或纯通过率描述。

- 当前 UI/API/runner 镜像仍为 update-score-20261102；独立 mock 镜像为 evaluation-mock-guardrail:scan-20261102。
- Mock ID=mock-guardrail，集群 Service evaluation-mock-guardrail:8002，路径 /runtime/v1/endpoints/mock-guardrail/backend/v1/scans。
- Mock token 已存在 Kubernetes Secret evaluation-mock-guardrail/token，不在文档保存明文。
- mock/scorer 可先用于联调，无需等待真实服务；当前尚未建立专项 target/dataset/scorer/environment 关联，model=none 要求尚未接入专项 runner。


### 2026-11-03 · Guardrail mock 端到端已打通

最新状态见实施计划末尾 2026-11-03 日志。Mock Guardrail Scan 的紧凑 Trigger 与报告已部署，浏览器触发 8 条样本完成；API/runner guardrail-20261103，UI guardrail-20261103-r3。通用 Git 构建和专用 dataset 创建编辑仍待完成。不要按旧段落认定 UI 未部署，也不要把本次 mock 验收当成全部设计完成。


### 2026-11-03 Git scorer configuration alignment

Added Git execution metadata (repository/full commit/script/timeout), UI verification, backend source/type consistency checks, deployed-artifact verification on new version publication, and commit verification for every execution. A deployment registry (`EVAL_GIT_SCORER_ARTIFACTS`) resolves source identity to a separately deployed service. The existing fixture remains available through its previous URL/commit configuration. Git Scan classification draft migrated and v2 published; published v1 remains immutable. Direct Guardrail binding resolution now reads pinned scorer versions rather than accepting only the hardcoded fixture version, with explicit legacy v1 compatibility.

This is a predeployed artifact implementation: no automatic remote Git clone, source inspection, image build, dependency installation, or deployment. Registry source identity is operator-attested; health checks verify the service commit. Do not describe it as validating a live Git remote/script. General numeric scoring expects score/reason; Guardrail artifacts return classification fields.

Local API and future workers: evaluation-worker:git-execution-20261103-r2; UI: evaluation-ui:git-execution-20261103. Fixed source overlay deployment by setting PYTHONPATH=/app/src; earlier overlay images without this setting still loaded the installed package. Backend regressions: 196 passed, 5 skipped. UI production build passed. Artifact verification and new v2 binding resolution passed. Actual Kubernetes run eval-ae924cf060bd895157c58e2e completed 8/8 against the existing dataset-pinned v1; stored report exp-ae924cf060bd895157c58e2eb5e131b1 contains two aspects, each TP/FP/TN/FN=1 and errors=0. The full-run acceptance is legacy compatibility; v2 resolution was verified separately.


### 2026-11-03 Runner-local Git correction (supersedes predeployed artifact design above)

Git scoring now fetches the pinned repository/commit inside the runner, caches source per process, and executes Python JSON stdin/stdout scripts per sample with timeout and a clean environment. API verification fetches source and checks script existence without executing it. Both generic scoring and Guardrail use git_scorers.execute; no scorer HTTP service or artifact registry remains in the runtime. Public HTTPS repositories supported; private Git credentials/dependency installation not implemented. Container is the execution boundary, not a hardened untrusted-code sandbox. Git fetch/script failure points log events. Backend regression tests: 196 passed, 5 skipped, including actual local HTTP Git fetch, commit/path failure, checkout reuse, credential env removal, and timeout. UI build passed.

Local images: evaluation-worker:runner-git-20261103-r2; evaluation-ui:runner-git-20261103. Mock Git source is evaluation-scorer-git:20261103, served by evaluation-scorer-git:8080/scorer.git. It is a Git source server only. Old evaluation-guardrail-scorer-79fe034 was stopped before acceptance. New actual run eval-d4e825aec0d9e0131ae80033 / experiment exp-d4e825aec0d9e0131ae800332fcc858c confirms worker git.scorer.fetch and git.scorer.execute events. Final report verified COMPLETED, 8/8 processed, 0 errors; injection and benign aspects each TP/FP/TN/FN=1. Old scorer HTTP Deployment/Service and obsolete manifest removed after successful acceptance.


### 2026-11-03 Runner SSH Git support

Added EVAL_GIT_SSH_SECRET_NAME, EVAL_GIT_SSH_SECRET_KEY and EVAL_GIT_SSH_KNOWN_HOSTS_CONFIGMAP to the API ConfigMap; Job builder projects selected Secret entry and trusted known_hosts ConfigMap into runner read-only volumes. Private key is not mounted into the API or placed in a ConfigMap/image. SSH URLs supported, host-key verification remains enabled, temporary key mode0600, clean scorer subprocess env. API SSH verification explicitly defers checkout checks to runner. Images include openssh-client. Regression: 198 passed, 5 skipped. Deployed API/future runner image evaluation-worker:runner-ssh-20261103.

Created/pushed backend branch codex/git-scorer-ssh-fixture, commit 04d17e4876856417a801b500d23507976d4aafc4, containing scripts/git-scorer-fixtures/scan_classification.py plus README and exact Git/Docker exclusions for .test/test_rsa and .test/test_rsa.pub. Existing implementation changes remain uncommitted in the working tree. Neither key is tracked or published. Created evaluation-git-ssh Secret from the user's local private-key file and evaluation-git-known-hosts ConfigMap using preexisting trusted GitHub entries.

Git Scan classification v3 pins this SSH source/commit. Acceptance dataset guardrail-ssh-acceptance-060eee81 pins v3. Actual Job eval-4cd4f1eccaa8ccd92279ab8c / experiment exp-4cd4f1eccaa8ccd92279ab8c37a200ed: logs verify GitHub SSH fetch completed once and four script executions completed. Final stored report verified COMPLETED, 4/4 processed, errors=0, TP/FP/TN/FN each 1.


### 2026-11-03 Retire local Git fixture source

Migrated all current dataset drafts/latest versions referencing Git Scan classification v1/v2 to v3. Published guardrail-benign-demo v2 and guardrail-injection-demo v3. No current Target configs needed pin changes. Historical versions remain immutable; rerunning old local-fixture versions requires migration to the latest dataset version. Removed evaluation-scorer-git Deployment/Service, its manifest, and EVAL_GIT_FIXTURE_URL/EVAL_GUARDRAIL_SCORER_COMMIT from the active API ConfigMap and services.yaml. Migration backup: data/local-deploy/before-scorer-v3-migration.json in the UI workspace.


## 2026-11-03: unified Dataset-first workflow

Implemented Dataset publication independent of scorer, evaluation-owned pinned dataset/scorer/aspect bindings, atomic Configure and subset-only Trigger. See [workflow-unification.md](workflow-unification.md) for storage/API changes, deployment images and two successful real Runner acceptance runs. Docker Hub 2.3.2 remains the previous release.
