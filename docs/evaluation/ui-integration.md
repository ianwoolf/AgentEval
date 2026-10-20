# Evaluation 工作台：纯 UI 演示与后端对接说明

> **2026-10-20 状态更新**：真实 Trigger → Kubernetes Job → Langfuse 与报告恢复已接通；资源编辑仍是 UI 演示，真实执行目前使用 mock-score。当前实现、部署、限制与接续工作见 [分支交接](2026-10-20-branch-handoff.md)。下文较早日期的“无真实执行/纯模拟/未实现后端”描述为历史记录，不能代表当前 Trigger 状态。独立后端在被主仓库忽略的 `evaluation-backend/` 中单独管理 Git。

后端实现规划见 [模块、接口与 OpenShell 执行设计](backend-execution-design.md)，包含 Dataset/Target/Scorer library 加载、任务状态与实时报告，以及平台无关的结果投递抽象。

2026-10-19 UI 更新：入口更名为 Evaluation。主页面先选择 Target type，再展示对应 Target 列表，目前仅提供 Guardrail。Target 以表格展示，最后一列的 History 打开该 Target 的历史记录弹窗（支持状态筛选、进度、取消与报告入口），Trigger 打开配置弹窗，固定所选 Target，并选择 Dataset 版本、执行环境及评分器，点击 Run evaluation 直接启动并跳转到该任务的报告详情。报告实时展示运行状态、样本进度和临时指标，完成后自动更新；不再包含 Review 步骤。运行进度、取消和报告入口位于 History 弹窗中，主页面仅展示 Target 列表。没有新增真实执行接口。

更新日期：2026-10-18。本文中的 v2 API 是拟议契约，**尚未实现任何对应 HTTP 服务**。

## 1. 本轮交付和运行边界

入口：`/individual/evaluation/catalog`。侧栏 Evaluation 包含 Eval、Datasets、Environments、Scorers、Reports。Observer 的 Dashboard 位置不变。

- 数据集目标 objective 和被测 target 独立。同一 Dataset 可以用于 Prompt 和 Guardrail。
- Dataset 管理名称、目标、描述、标签、自定义 JSON 元数据、字段定义、记录和版本。支持 CSV/JSON/JSONL 上传或粘贴，字段映射、全量验证、预览和原子追加。演示每次导入最多 2 MB / 1,000 行。字段类型 string/number/boolean/json；用途 input/reference/metadata。
- Sandbox 是唯一环境类型，但可创建多套配置；支持网络 allowlist、只读/可写路径、进程命令、CPU、内存、超时。每次保存创建新版本。
- LLM/Guardrail 必经 Evaluation 代理是**设计意图**，界面显示为必选拦截能力；目前没有任何请求被真实拦截，也没有限制被真实执行。
- 内置 scorer 只读；自定义 scorer 可新建、保存草稿、发布升级、查看历史、启停、模拟测试。支持 LLM rubric 与 code 文本；UI 从不执行 code，不把文本传给 eval/Function 或远程服务。
- Eval 选择目标、发布的数据集版本、环境配置、多个启用的已发布 scorer；复核后创建模拟任务。每 900 ms 产生一个样本结果，可取消。
- Report 支持 Evaluation ID **精确匹配**和 Target 过滤；样本搜索、通过/失败筛选、紧凑/完整内容、Trace/评分理由抽屉、快照和 JSON 导出。
- 目标库仅含内置 Prompt 和 Guardrail 演示目标，本轮不新增目标管理器。
- 状态保存在 `WorkbenchProvider` 的内存中。Evaluation 子页面间切换保留，离开 Evaluation 布局、切换项目或刷新页面会重置。没有 localStorage、浏览器数据库或后端持久化。
- 为保留现有链接，旧 Dataset/Report/Run 详情路由仍使用旧 evaluation-layer 演示；旧 Dashboard/Traces 与新工作台的模拟状态独立。新工作台报告链接使用 `/evaluation/reports?evaluationId=...`。后端接入时统一迁移，不能假定两个 store 已同步。

## 2. 文件与边界

`web/apps/control/src/features/evaluation-workbench/`：

| 文件 | 职责 |
|---|---|
| contracts.ts | UI 资源 DTO、快照、结果、拟议 v2 启动请求和事件类型 |
| domain.ts | 发布、校验、克隆快照、确定性模拟和 fixtures |
| import-data.ts | CSV/JSON/JSONL 解析、字段映射与类型校验 |
| provider.tsx | 项目 Evaluation 布局内的会话状态和模拟时钟 |
| datasets-page.tsx / import-dialog.tsx | 数据集列表、编辑、版本、导入流程 |
| environments-page.tsx | Sandbox 限制配置和版本 |
| scorers-page.tsx | 内置/自定义评分器管理 |
| eval-page.tsx | 创建、复核、模拟执行、取消 |
| reports-page.tsx | 报告检索、样本结果和 Trace |
| domain.test.ts / workbench.test.tsx | 数据边界、版本不可变和交互测试 |

接入时保留页面组件和 DTO 语义，用服务适配层 + query cache 替换 `useWorkbench` 的读写、移除模拟 interval。不要让页面直接知道 Python repository 表结构。`CreateEvaluationRequest` 是当前 UI 便利表单，environment/scorers 使用最新发布版本；**正式接口使用 `StartEvaluationV2Request`，所有资源显式固定版本**，避免复核到执行之间出现隐式升级。

## 3. 资源关系

```mermaid
flowchart LR
  Dataset[Dataset + published version] --> Evaluation
  Target[Prompt / Guardrail + version] --> Evaluation
  Environment[Sandbox configuration + version] --> Evaluation
  Scorers[Scorers + versions] --> Evaluation
  Evaluation --> Snapshot[Immutable launch snapshot]
  Evaluation --> Samples[Sample results]
  Samples --> Scores[Per-scorer feedback]
  Samples --> Trace[LLM / Guardrail / scorer spans]
  Snapshot --> Report
  Samples --> Report
```

- 所有资源在服务端归属 projectId；不得通过客户端传入的 ID 跨项目访问。
- Dataset 不含 targetId；旧 API 的 target-bound dataset 应迁移为项目资源。
- Draft 可编辑；发布版本只读，编号单调递增，包含字段、元数据和记录内容的快照/内容哈希。
- Environment / Scorer 发布后同样不可变。停用 scorer 只阻止新任务，不删历史版本。
- Eval 引用固定版本，并保存便于审计的可读配置快照；Report ID 可与 Evaluation ID 一一对应，样本独立分页。
- 字段用途不等于 target 参数名。正式接入需要 `fieldMapping`，例如 `query <- input`；服务端校验目标输入 schema 的兼容性。本轮通用模拟目标不需要额外映射表单。

## 4. 拟议 REST API

统一前缀：`/api/v2/projects/{projectId}/evaluation`。复用现有登录会话，经 Web 服务代理到评测 API。列表返回 `Page<T>`：`{items, nextCursor}`，默认 limit 50，最大 200；cursor 不透明，过滤条件变化后重置。

| 方法和相对路径 | 请求 | 返回/用途 |
|---|---|---|
| GET /targets?kind=PROMPT\|GUARDRAIL | cursor, limit, query | Page<Target>，带可用版本和输入 schema |
| GET /datasets | query, tags, cursor, limit | Page<DatasetSummary>，不携带全量 records |
| POST /datasets | DatasetContent（初始 rows 可空） | 201 Dataset + ETag |
| GET /datasets/{id} | — | 元数据、draft schema、版本概要 + ETag |
| PATCH /datasets/{id}/draft | 元数据/字段变更，If-Match | 新 draft + ETag |
| GET /datasets/{id}/draft/records | cursor, limit | Page<{id, values: Row}> |
| POST /datasets/{id}/draft/records | {values: Row}，If-Match | 201 record |
| PATCH /datasets/{id}/draft/records/{recordId} | {values: Row}，If-Match | 更新 record |
| DELETE /datasets/{id}/draft/records/{recordId} | If-Match | 204，仅删除草稿记录 |
| POST /datasets/{id}/imports/preview | multipart file 或 {format, content, mapping} | {importId, validCount, invalidCount, preview, errors} |
| POST /datasets/{id}/imports/{importId}/commit | {mode:"APPEND"}，If-Match | 原子提交；返回记录数和 ETag |
| POST /datasets/{id}/versions | {notes}，If-Match | 201 DatasetVersion；空/无效记录拒绝发布 |
| GET /datasets/{id}/versions | cursor, limit | 版本概要列表 |
| GET /datasets/{id}/versions/{version}/records | cursor, limit | 发布版本的 records |
| GET /environments | cursor, limit | Page<Environment> |
| POST /environments | EnvironmentConfig | 201 Environment，初始 v1 |
| POST /environments/{id}/versions | EnvironmentConfig，If-Match | 201 immutable version |
| GET /environments/{id}/versions/{version} | — | EnvironmentVersion |
| GET /scorers | source, enabled, cursor, limit | Page<Scorer> |
| POST /scorers | ScorerConfig | 201 custom draft |
| PATCH /scorers/{id}/draft | ScorerConfig，If-Match | 更新草稿，内置返回 403 |
| PATCH /scorers/{id} | {enabled:boolean} | 改启停；内置不可在此修改 |
| POST /scorers/{id}/versions | {notes}，If-Match | 发布不可变版本 |
| GET /scorers/{id}/versions/{version} | — | ScorerVersion |
| POST /scorers/{id}/tests | {draftRevision, input, output, reference} | 202 {testId}；在隔离 worker 中运行 |
| GET /scorers/{id}/tests/{testId} | — | 状态、score、reason、错误 |
| POST /evaluations | StartEvaluationV2Request；Idempotency-Key | 202 {id,status:"QUEUED",snapshot,createdAt} |
| GET /evaluations | targetId, status, cursor, limit | Page<EvaluationSummary> |
| GET /evaluations/{id} | — | 进度、状态、快照、错误；不嵌入全部结果 |
| POST /evaluations/{id}/cancel | — | 202 current status，幂等 |
| GET /evaluations/{id}/events | Last-Event-ID | SSE 有序事件，断线可恢复 |
| GET /reports | evaluationId（exact）, targetId, cursor, limit | Page<ReportSummary> |
| GET /reports/{evaluationId} | — | 汇总指标、快照、partial 标记 |
| GET /reports/{evaluationId}/samples | status, query, scorerId, cursor, limit | Page<SampleResult>；支持 score 排序 |
| GET /reports/{evaluationId}/samples/{sampleId}/trace | — | 嵌套 span 树、反馈及脱敏 attributes |
| GET /reports/{evaluationId}/export?format=json | — | 导出完整报告，明确包含全部结果或当前筛选 |

正式后端的 draft 行编辑使用稳定 recordId；当前 UI 用数组下标仅用于本地编辑，不可拿它作为持久化主键。导入 preview 服务端保留临时 artifact，建议 TTL 30 分钟；提交时重新校验 schema revision，过期/冲突拒绝提交且不部分写入。错误需返回行号、字段名及原因。

### 启动请求示例

```json
{
  "name": "Privacy policy regression",
  "target": {"id": "guardrail-privacy", "version": 2},
  "dataset": {"id": "ds-support", "version": 1},
  "environment": {"id": "env-isolated", "version": 1},
  "scorers": [{"id": "sc-safety", "version": 1}, {"id": "sc-tone", "version": 2}],
  "fieldMapping": {"query": "input"},
  "metadata": {"trigger": "manual"}
}
```

服务器在同一事务内检查权限、版本存在、版本发布状态、scorer 启用状态、schema 兼容性和限额，生成快照再入队。Idempotency-Key 相同且请求相同返回原任务；不同请求返回 409。

### 评分器输入/输出约定

```json
{
  "request": {"input": {"query": "reset password"}, "output": {"response": "use reset link"}, "reference": {"expected": "secure reset flow"}},
  "result": {"score": 0.85, "reason": "Includes secure account verification steps."}
}
```

分数有限且位于 [0,1]。错误或超时不能伪装为 0 分：返回独立 ERROR 状态、错误 code 与可展示 message。通过判定由固定版本 threshold 决定；样本只有所有选定 scorer 成功并达标才 PASS。报告通过率分母需明确：本 demo 为已完成样本数；生产同时返回 total/completed/pass/fail/error/cancelled。

### 错误与并发

```json
{"error":{"code":"VALIDATION_FAILED","message":"Import contains invalid rows","fieldErrors":{"rows[3].count":"Expected finite number"},"requestId":"req-..."}}
```

- 400 malformed JSON / 参数；401 未登录；403 权限不足/内置只读；404 不存在或不可见。
- 409 VERSION_CONFLICT / INVALID_STATE；412 If-Match 失败；413 文件过大；422 schema 或字段校验失败；429 限流；503 worker 不可用。
- Draft PATCH、导入提交和版本发布使用 ETag/If-Match；失败时 UI 保留编辑内容并提示重载冲突，不静默覆盖。
- 资源列表及 mutation 显式展示 loading / empty / retry；本轮内存 mutation 不伪造网络 loading。

### 执行状态和事件

正式状态：QUEUED → RUNNING → COMPLETED / FAILED；QUEUED/RUNNING → CANCELLING → CANCELLED。终态不可倒退。SSE sequence 单调递增；客户端丢弃重复 sequence，断线后重连并拉取最新任务快照。sample 事件引用稳定 sampleId，评分结果支持独立延迟完成。取消以服务端确认状态为准，不能仅靠前端停止计时器。

UI demo 为 RUNNING → COMPLETED/CANCELLED，每个 tick 同时产出样本和全部 scorer 结果，分数为固定模拟逻辑；不会因用户 rubric 不同而实际计算。Dashboard 旧流式 traces 尚未与这些事件关联。

## 5. Sandbox / 拦截后端职责

环境页面借鉴仓库已有 OpenShell 风格的策略维度，而不是宣称字段可直接传给 OpenShell。正式接入需有版本化 policy compiler：

- 将网络、文件系统、进程 allowlist 编译成当前 OpenShell 支持的实际 policy，检查冲突路径、危险命令、资源配额、通配规则，拒绝无法落实的配置。
- LLM 和 Guardrail 代理是 worker 侧强制路由；阻止任务通过直连地址、替代协议、环境变量绕过。UI 勾选状态不能作为安全控制。
- 临时凭证由服务端签发，限定 evaluation/project/audience、短有效期；配置只存 credential reference，不返回 secrets。
- 区分沙箱执行网络与 scorer worker 的模型访问；scorer code 在独立隔离环境中运行，设置 CPU/内存/超时，禁用任意宿主访问。
- 记录 target/scorer/version、输入输出、token/cost、span parent、错误；脱敏后才能返回 UI；执行取消和超时清理 worker 与临时文件。
- Prompt 和 Guardrail 分别通过对应 adapter 执行，不通过本轮 `advanceEvaluation` 模拟函数。

## 6. 现有后端迁移清单

已有 Python API：`src/api/routers/{datasets,runs,reports,targets}.py`；UI adapter：`src/api/dto.py`。旧路由被 TALI `/api/v1/evaluations/*` 代理。新的 v2 path 不与旧 API 混用。

1. Dataset 从 target 绑定改成 project 资源；objective/metadata/schema 纳入版本，旧 targetId 作为迁移 provenance 留档。
2. 新增 Environment/EnvironmentVersion、Scorer/ScorerVersion/ScorerDraft 持久化实体；禁止升级原地覆盖旧版本。
3. Run 增加 target kind/revision、环境/scorer 引用、fieldMapping、immutable snapshot、幂等键和生命周期状态。
4. Report 增加多 scorer feedback、样本 trace、部分完成标识及索引（projectId, targetId, createdAt；evaluationId 唯一）。
5. React hooks 接入统一 API service；启用缓存失效、错误提示和 SSE；取消 session-only banner 后必须有集成测试证明持久化。
6. 旧 Dashboard、Trace 和新 Eval 共用任务/样本 ID；替换旧 store 后再移除 legacy 路由或保留重定向。

## 7. 验收与手动演示

1. Datasets → New dataset：填写 name/objective，编辑字段；导入、映射、验证、确认；发布 v1。
2. Environments → New configuration：保留 Sandbox，填写限制，保存 v1。
3. Scorers → New scorer：填写定义和版本说明，模拟测试并发布 v1；再发布 v2，确认 v1 可查看。
4. Eval → New evaluation：选择 Prompt/Guardrail、dataset version、environment、内置和自定义 scorer；Review → Run simulation。
5. 等待完成，打开 Report；按 Evaluation ID/Target 筛选，打开样本，查看输入/输出/reference/反馈/trace；导出 JSON。
6. 编辑任一资源后查看旧 Report Configuration，仍是启动时版本。运行中取消后保持 CANCELLED，不继续产出样本。
7. 刷新恢复固定 fixtures；跨项目不共享会话状态。旧 Dashboard 保持可访问。

自动化：在 `web/apps/control` 执行 `../../node_modules/.bin/vitest run src/features/evaluation-workbench src/components/layout/app-shell-navigation.test.ts src/components/layout/header-breadcrumb.test.ts src/routes/-evaluation-layer-routing.test.ts`；TypeScript：`node web/node_modules/typescript/bin/tsc -p web/apps/control/tsconfig.json --noEmit`。

## 8. UI 参考

[LangSmith: Analyze an experiment](https://docs.langchain.com/langsmith/analyze-an-experiment)：采用其样本 input/output/reference、评分与耗时/成本列，以及点击样本查看 trace/feedback 的信息结构。本轮没有实现实验对比、在线追踪接入或完整 LangSmith 功能集。

## Guardrail 演示数据格式（2026-10-18 更新）

默认数据集为 `ds-guardrail`（Guardrail conversation safety），预置报告 `eval-demo-001/002` 均为 Guardrail 测试。保留 Prompt 目标供其他数据集使用。

```json
{
  "messages": [
    {"role": "system", "content": "Protect private information."},
    {"role": "user", "content": "How do I reset my own password?"}
  ],
  "has_issue": false,
  "category": "benign"
}
```

`messages` 是必填 JSON 字段，用途 input；`has_issue` 是必填 boolean，用途 reference，true=存在风险，false=正常。`category` 是可选 metadata。输入只携带 messages，不将 ground-truth label 传给 target。通用字段编辑器的 json 类型只验证 JSON 有效性；正式 Guardrail adapter 需要额外校验 messages 数组及 role/content schema。

报告输出包含 `has_issue`、`decision`（BLOCK/ALLOW）和 reason。预测与标注相同得 1 分，不同得 0 分；标准 scorer 阈值 0.8。报告显示期望标记、检测标记、误报/漏报计数。第 3 和第 5 个演示样本刻意模拟漏报和误报，实际没有调用 Guardrail。刷新页面后生效，之前在浏览器内编辑的草稿不持久化。

## 报告顶部配置摘要

报告移除 Configuration 标签页，改为指标上方的 Target / Environment / Dataset 三张摘要卡，点击弹框查看对应详情；完整 launch snapshot（含 scorers）在弹框中折叠展示。

`EnvironmentConfig` / `EnvironmentVersion` 新增 `modelId: string`、`guardrailId: string`、`runner: {id: string, concurrency: number}`；可在环境配置编辑器中填写，保存新环境版本后供新 Eval 使用。Runner 并发数为 1–32 的整数，其余资源限制沿用 cpu、memoryMb、timeoutSeconds、commands、network 和路径字段。历史报告使用启动时深拷贝的值，不读取当前环境的最新版本。

默认 modelId=`demo-model-support`、guardrailId=`guardrail-privacy`、runner.id=`demo-sandbox-runner` 均为演示标识，不代表真实可用服务。Environment 的 guardrailId 表示环境中配置的 Guardrail 服务；Target ID 表示本次被测对象，两者应分别展示。正式接口需服务端校验这些引用的存在性、项目权限及版本兼容性。

### Git 仓库打分器

自定义打分器的 New / Manage 表单使用 Git repository 和 Script path，替代内联 rubric / code 编辑；内置打分器仍只读。`ScorerConfig` 保留 `kind: "CODE"`，新增 `repoUrl?: string`、`scriptPath?: string`；两个字段对自定义打分器发布必填，内置打分器仍使用 `definition`。草稿允许未填完整。仓库地址支持 HTTPS / SSH；脚本路径相对于仓库根目录，不允许绝对路径、反斜杠或 `..` 路径段。

发布版本及 evaluation 的 scorer 快照保存仓库地址、脚本路径、阈值和版本说明。报告的 scorer definition 展示该版本对应的仓库及脚本路径。示例仓库是演示占位地址；UI 不验证仓库存在性、不 clone、不执行脚本，Test 仍返回固定模拟分数。

后续对接：scorer 创建 / 更新 / 发布接口接收上述字段；后端发布时需解析并保存不可变 `commitSha`，校验仓库访问权限及脚本存在性，在受限 runner 中执行。当前 UI 版本只冻结地址与路径，尚不能保证远程代码内容可复现。脚本契约仍为输入 `input`、`output`、`reference`，返回 `score`（0–1）及 `reason`；Git 凭证应由后端凭证引用管理，不放在仓库 URL 中。

### Dataset 可选评分器（2026-10-19）

Dataset 编辑器的 Scorers 页签可多选允许使用的评分器。`DatasetContent.scorerIds?: string[]` 随草稿保存、随发布版本冻结；未配置或空数组表示不限制评分器。Eval 按所选 Dataset 版本过滤评分器，同时要求评分器已启用且已发布；打开执行弹窗时默认全选该数据集版本下已启用且已发布的评分器；更换 Dataset 或版本会重新全选对应可用评分器，用户可手动取消。发布数据集只固定评分器 ID，执行时仍按现有逻辑使用评分器的最新发布版本，并写入执行快照。

Scorers 列表及详情的 Datasets 页签反查显式配置关联的数据集，标明 Draft 和已发布版本。即使草稿移除关联，历史版本的关联仍展示；未限制评分器的数据集不计入显式关联。这些关联不是历史运行使用统计。正式后端应在发布与启动时校验评分器存在性、项目归属及版本规则，并为反查建立索引；当前仍为会话内 UI 数据。

默认 Guardrail conversation safety 数据集显式关联 Policy compliance 与 Risk classification。Risk classification 的说明、版本备注与 Test 样本采用该数据集的 messages / has_issue 格式，比较 output.has_issue 和 reference.has_issue；匹配为 1，不匹配为 0。Test 按钮仍返回固定模拟分数，不执行该评分契约。

Evaluation 侧栏显示规则：有效项目角色 admin 显示 Evaluation、Datasets、Environments、Scorers、Reports；member、compliance、ada、frt、iss 仅显示 Evaluation 和 Reports。真实 admin 与 Demo admin 使用相同规则。此变更仅调整导航可见性。
