# Guardrail 实施计划与恢复台账

设计：[Guardrail 专项评测](2026-11-02-guardrail-evaluation.md)。
最后更新：2026-11-02。当前阶段：P1 进行中，数据契约及基础统计已实现；Trigger/执行链路尚未接入。

## 进度概览

| 阶段 | 状态 | 依赖 | 完成证据 |
|---|---|---|---|
| P0 设计/契约/拆解 | DONE | 无 | 详细设计与本台账 |
| P1 数据契约与兼容 | IN_PROGRESS | P0 | 待填 |
| P2 本次运行选择与快照 | TODO | P1 | 待填 |
| P3 Detail resolver / Guardrail proxy | IN_PROGRESS（仅 mock 服务已部署） | P2；真实联调依赖 provider 契约 | 待填 |
| P4 Git scorer 发布与隔离执行 | TODO | P1；真实仓库验收依赖 Git 信息 | 待填 |
| P5 Runner/collector 全链路 | TODO | P2/P3/P4 | 待填 |
| P6 报告聚合与详情 API | TODO | P1/P5 的结果契约 | 待填 |
| P7 紧凑 UI | TODO | P1/P2/P6 契约 | 待填 |
| P8 联调/回归/部署 | TODO | P1–P7 | 待填 |

状态限 TODO / IN_PROGRESS / BLOCKED / DONE。完成一个子任务就更新，不能等整阶段结束。

## P1 数据契约与兼容

- [ ] 明确 schema_version、generic/guardrail discriminator；Guardrail row 导入/导出适配，不改旧 dataset。
- [ ] 发布验证 label mapping、input、strategy、默认 scorer/version/aspect。
- [x] 定义 RunBinding、分类结果、request telemetry、cost、分阶段 error DTO。
- [ ] 扩展 samples/records mapping 及 collector 验证，保持旧数值 scores 可读。
- [x] 测试三列 roundtrip、非法标签、bool/数字边界、旧 dataset/报告兼容。

完成标准：契约测试通过；没有迁移或重写旧 immutable 文档。

## P2 Trigger 和快照

- [ ] 新 Guardrail run endpoint 复用现有编排器，接受 target/datasets/environment。
- [ ] 校验项目、版本、归档状态、dataset 类型、样本限制、model=none。
- [ ] 从 dataset 解析默认 scorer/aspect，不取 shared scorer intersection。
- [ ] 冻结 bindings/commit/environment/target/cost 配置；幂等请求测试。
- [ ] 旧 target-runs 保留旧语义；新 UI 仅 Guardrail 专项走新入口。

完成标准：不同 dataset/scorer 可创建同一次 run，旧入口测试不退化。

## P3 Detail / proxy

- [ ] TargetDetailResolver interface + fake adapter + Secret 引用实现。
- [ ] 内部 run-scoped detail 接口与 credential 隔离/脱敏。
- [ ] provider adapter 接口；先 fake，再实现有真实示例的首个 provider。
- [ ] direct_guardrail 模式与 model=none 解耦；固定 timeout，无默认重试。
- [ ] 记录 HTTP/latency/attempt/error，认证错误与解析错误明确区分。
- [ ] 测试 token 不进入用户代码/结果/日志；跨项目和越权 target detail 拒绝。

完成标准：fake Guardrail 收到原 input，未收到 label/strategy，未调用 LLM。

## P4 Git scorer

- [ ] Git execution config、ref→commit 固定、发布状态和构建错误契约。
- [ ] 隔离构建/代码获取，不向构建注入业务 Secret。
- [ ] Artifact digest、缓存与 worker 加载；依赖按 lock 安装。
- [ ] JSON 执行协议、输出校验、超时/大小/资源限制。
- [ ] K8s 与 Compose 隔离执行配置；确认子容器/沙箱无敏感挂载与凭证。
- [ ] TP/FP/TN/FN fake Git 仓库测试；branch 移动不改变发布版本。

完成标准：真实隔离边界验收通过，不能用同进程 import 代替。

## P5 Runner / collector

- [ ] 启动预检查、加载冻结 bindings、获取 detail、准备 artifact。
- [ ] 每个 row 一次 Guardrail 请求，分类评分绑定 binding_id。
- [ ] 单样本失败继续，准备失败终止；取消和部分结果状态一致。
- [ ] 请求/评分/trace 写 collector，幂等重发，cost mock 快照规则。
- [ ] 多 dataset 执行回归，重放/错误/失败 scorer 不伪造通过结果。

完成标准：至少两个不同组合完整执行，所有样本可关联请求与评分。

## P6 Report API

- [ ] 全量 binding 混淆矩阵、precision/recall/F1/FPR/FNR/coverage。
- [ ] latency 分布和成本，null 分母与未完成状态。
- [ ] strategy 分组、请求筛选分页、详情及内容保留策略。
- [ ] 旧报告 fallback；同名 aspect 不合并，不按当前页统计。
- [ ] 用已知矩阵 fixtures 验证计数/公式、超过一页、重复写入、ERROR 和 pending。

完成标准：指标与人工预期完全一致，过滤请求表不改变总体汇总。

## P7 UI

- [ ] Guardrail dataset 三列编辑器、默认 Git scorer/aspect 绑定。
- [ ] 紧凑 Trigger：target/environment 同行、dataset 表格、默认版本/评分展示。
- [ ] Run 后立即 report；配置错误明确定位到行。
- [ ] Aspect 对比表、strategy 展开、请求表与详情侧栏。
- [ ] 英文文案、mock 标记、loading/error/empty、键盘和窄屏处理。
- [ ] 测试两 dataset/不同 scorer 选择与报告 drilldown；浏览器截图验收信息密度。

完成标准：无需多步向导即可配置运行，主要信息首屏可扫描。

## P8 联调与部署

- [ ] Backend/UI 回归、类型检查、正式构建；在实际 worker 镜像内测试。
- [ ] fake provider/Git scorer 全链路含四象限、timeout、非法响应、取消。
- [ ] 收到外部契约后执行真实 Guardrail 联调；没有契约则记录明确未验收项。
- [ ] 增量 ES mapping 前备份，保留现有文档、Secret 与配置。
- [ ] 新唯一 image tag；API 和后续 runner 同步；UI 同步更新。
- [ ] 检查 K8s readiness、Compose 渲染/启动配置、18082 静态产物和 API 数据源。
- [ ] 保存验收 run ID、截图、测试数量、image digest、回滚步骤。

完成标准：不能仅凭 HTTP 200 宣称完整联调；必须有完整请求→评分→ES→report 证据。

## 每次实施必须更新的记录

1. 开始：标记正在处理的子任务及本次范围。
2. 每完成可验收单元：勾选、记录文件、测试命令/结果和限制。
3. 遇到阻塞：明确缺失信息；继续不依赖它的工作，不伪造外部契约。
4. 中断前：写当前状态、下一条具体操作、未结束工具 session、未提交改动和恢复注意事项。
5. 每次部署：记 image tag/digest、context/namespace、API/runner/UI 版本、转发端口。
6. 向用户及时报告阶段成果；不要将“代码已写”当作“测试/部署已完成”。


## 当前运行配置与用户可见状态（2026-11-02）

此节为最新状态；下方实施日志保留历史检查点，不代表当前状态。

| 组件 | 当前配置 | 状态 |
|---|---|---|
| Kubernetes | context `docker-desktop`，namespace `evaluation` | 本机集群 |
| UI | `evaluation-ui:update-score-20261102`，入口 `http://127.0.0.1:18082/` | 既有 UI；无专项 Trigger/报告改版 |
| API / 新建 runner | `evaluation-worker:update-score-20261102` | 既有执行链路 |
| Mock Guardrail | `evaluation-mock-guardrail:scan-20261102` | 独立 Deployment/Service，部署时 Ready 1/1 |
| Guardrail ID | `mock-guardrail` | ConfigMap `evaluation-mock-guardrail` 的 `EVAL_MOCK_GUARDRAIL_ID` |
| Scan URL | `http://evaluation-mock-guardrail.evaluation.svc.cluster.local:8002/runtime/v1/endpoints/mock-guardrail/backend/v1/scans` | 集群内地址 |
| Token | Secret `evaluation-mock-guardrail` 的 `token` | 已生成；Bearer；值不写文档 |
| 健康检查 | `/health`、`/ready` | ready 检查 token 已配置 |
| 本机 mock 访问 | 可手动转发 `18083:8002` | 尚未建立常驻转发，见后端部署说明 |
| ES | `.test/es_export` 导入的快照 | 尚未建立专项 dataset/scorer/target 关联 |
| Environment | 专项流程要求 `model=none` | 尚未为 mock 专项创建并绑定配置 |
| 示例 scorer | 后端 `examples/guardrail-scorer/scorer.py` | 已有脚本；未初始化独立 Git 产物/固定 commit/隔离执行 |

**UI 无专项变化的原因：**已部署的只是独立 mock 服务。当前新增的契约、统计函数与示例 scorer 尚未形成可运行的主链路；三列编辑器、紧凑 Trigger、aspect 四象限报告和请求详情 UI 尚未实现/部署。不能把 mock 服务可访问描述为专项评测已完成。

Mock input：普通文本→cleared；`[mock:unsafe]`→flagged（flagOnly=false→blocked）；`[mock:error]`→503；`[mock:timeout]`→即时504。verbose=true 返回 scannerResults。redacted 暂无生成 fixture，但 scorer 支持解析。

已验证：基础后端回归 191 passed / 5 skipped；mock/scorer 单测通过；已部署 Service 的 ready、cleared、flagged、blocked、401、503、504 均通过。尚无专项端到端 evaluation/report ID。

后续顺序：完成发布绑定与 Git artifact readiness → 新 guardrail-runs 接口/快照 → run-scoped detail/proxy → 隔离 scorer 执行 → collector/ES/report API → 紧凑 UI → 整体回归、构建和部署。实现过程中继续逐项更新台账。

## 恢复入口（当前）

- 用户当前授权：已明确要求执行实现；P1 已开始，后续可按台账自主继续。
- 下一步：见最下方最新实施日志；不要重复已通过的契约实现。
- 用户已授权用 mock detail/token 和示例 Git scorer 完成本地联调；Scan 协议已取得。真实服务资料不再阻塞 mock 实施。
- UI/后端基线：aee2854 / 03df437；实施前重新检查 branch/status，不重置现有改动。
- 本机 K8s context=docker-desktop，namespace=evaluation；API/runner/UI tag=update-score-20261102。
- 18082 为 UI 转发；本机 ES 已由 `.test/es_export` 恢复 10 索引/656 条文档。
- 导入前备份：`data/local-deploy/es-backup-before-refresh-20261102`。不要重新导入覆盖后续用户数据。
- 已有未提交部署改动：前端 evaluation-ui.yaml、后端 services.yaml；还有 frontend/node_modules/.bin 平台差异和 `.test/`，不要混入业务补丁或清理。
- 专项基础代码尚未部署到主 API/UI；独立 mock 服务与专用 Secret 已部署。未执行专项端到端测评。

## 实施日志

### 2026-11-02 · P0

- 完成范围、DTO、运行选择、detail/proxy、Git 隔离、指标公式、ES/API/UI 和兼容策略设计。
- 拆解 P1–P8，列出验收与恢复规则；未实施产品代码。

### 2026-11-02 · P1 首个实现检查点

- 新增 backend `guardrail_contracts.py`：Guardrail dataset 配置、严格 label mapping、三列验证、固定 Git binding、分类结果、请求 latency/cost/error 契约。
- `storage/service.py` 接入 evaluation_type 与 Guardrail 专项验证；generic 序列化继续省略新字段，避免已有 immutable dataset 版本比较冲突。
- `storage/api.py` 增加可选 guardrail_result；旧数值 scores 契约保持原样。分类暂放在 guardrail_result.classifications，避免现有 numeric score 聚合直接读取 value 时出错；完整 ES 投影在 P5 接入。
- 前端 contracts.ts 增加可选 Guardrail dataset 类型，尚无专用编辑器。
- 新增 guardrail_metrics.py，按 binding 汇总矩阵、公式、latency、mock cost，处理重复 request、ERROR、pending 和零分母；尚未接入 report API。
- 测试：WSL 后端完整回归 191 passed / 5 skipped；git diff --check 通过。
- 尚未完成 P1：发布时解析 scorer/验证 artifact ready，schema version 及 ES 映射、独立三列导入导出入口。P1 不能标记 DONE。
- 下一操作：先实现发布绑定校验和 Git artifact readiness 契约，再进入 P2 guardrail-runs；P3/P4 需真实服务与仓库信息，但不阻塞 fake adapter 开发。
- 外部资料已通过异步问题请求：detail 来源、provider 请求响应示例、Git scorer 仓库及入口。无需在聊天提供 token。
- 当前代码未部署；现有 K8s 仍为 update-score-20261102。无未结束测试 session。未提交代码，保留原部署 manifest 差异。

### 2026-11-02 · 用户补充 mock 授权

- 用户允许 Guardrail/detail/token 先 mock，Git scorer 可使用本地示例仓库。
- 已读取 tasklattice/tasklattice-guard 的 scan-endpoint-compatibility-design.zh-CN.md：POST /runtime/v1/endpoints/{id}/backend/v1/scans，Bearer，result.outcome 四种值。
- 新增 mock_guardrail.py 与 examples/guardrail-scorer/scorer.py：cleared→safe，其余三个内容 outcome→unsafe；503/504 为错误。
- Mock 通过 [mock:unsafe]/[mock:error]/[mock:timeout] 输入标记控制，不读取 dataset label。
- 尚待：生成本地 Secret、初始化示例 Git 仓库并固定 commit、隔离执行和新 Trigger/报告/UI 接入。未部署 mock。

### 2026-11-02 · 独立 mock Guardrail 已部署

- 新增专用 Dockerfile.mock-guardrail、kubernetes/mock-guardrail.yaml 和调用说明 mock-guardrail.md。
- 实际部署：docker-desktop / evaluation，Deployment+Service evaluation-mock-guardrail，镜像 scan-20261102，Ready 1/1。
- 生成独立 Kubernetes Secret evaluation-mock-guardrail/token（未输出或写入仓库）；ConfigMap 只保存 mock endpoint ID。
- Service 内网 8002，POST /runtime/v1/endpoints/mock-guardrail/backend/v1/scans。
- 验收：ready、cleared、flagged、blocked、503、504、401 全部通过。504 为即时模拟响应，不是网络延迟模拟。
- 未将未完成的 Guardrail runner/Trigger 部署到主 API；下一步仍需接通 detail resolver、Git 隔离执行和报告/UI。

### 2026-11-03 · Mock 完整链路及 UI 已部署（最新状态）

本节覆盖此前“专项 UI 未部署/主链路未接通”的状态。当前打通的是明确允许的 mock 验收路径，不代表通用 Git 构建平台完成。

- 新 API guardrail-runs 接入现有 Job 调度与幂等；按本次 datasets/environment 选择冻结配置，model=none 时执行 Scan。
- run-scoped guardrail-detail 验证 worker capability 后解析 mock endpoint/token；token 仅存在 API Secret 引用和 worker 内存。
- 独立 scorer 服务无业务凭证与挂载。示例 Git 仓库 data/local-deploy/guardrail-scorer-git，commit 79fe034ea15c22f7ff360fb33287ccedd7131a90；镜像 evaluation-guardrail-scorer:79fe034，服务 evaluation-guardrail-scorer-79fe034:8003。Worker 校验返回 commit 与冻结版本一致。
- Runner→Scan→scorer→本地 collector→ES→report 路径已实测。新增 guardrail-report/guardrail-trigger 前端，支持多 dataset 紧凑选择、四象限、F1、P95、mock cost、策略/结果过滤和请求详情。
- API/runner evaluation-worker:guardrail-20261103；UI evaluation-ui:guardrail-20261103-r3；mock Guardrail 仍为 scan-20261102。
- Seed 脚本 scripts/seed_guardrail_demo.py 通过 API 追加 mock-guardrail、guardrail-git-classifier 和 guardrail-injection-demo/guardrail-benign-demo，无覆盖旧数据。环境使用既有 env-isolated v5（none）。
- API 验收 Job eval-f9ce883bd61c312ed970f3fd，experiment exp-f9ce883bd61c312ed970f3fd12deab02：COMPLETED，8 样本，两 aspect 均 TP=FP=TN=FN=1，errors=0，mock cost 每组 $0.004。
- 浏览器亲自 Trigger 验收 Job eval-ab3cf1c6678e2d419b06b185：自动跳转报告，COMPLETED 8/8；浏览器已核对矩阵与请求详情。
- 后端实际镜像回归 192 passed / 5 skipped；前端全量初测 39 pass/1 fail（普通报告重复 alert），修复后 live-report 3 项全部通过，生产构建通过。
- 仍待完成：通用 Git 仓库配置/发布/构建和 artifact registry；专用 dataset 三列创建/绑定编辑器；真实 provider/detail registry；Compose 新链路；服务器请求筛选分页/明确 ES mapping；严格网络隔离及 timeout/cancellation 全面验收。当前仅允许已配置 mock ID 和固定 fixture scorer，不能宣称任意 Git scorer 已支持。
- 下一步按这些未完成项继续，不重复初始化或覆盖现有 ES 数据。源码未提交。
