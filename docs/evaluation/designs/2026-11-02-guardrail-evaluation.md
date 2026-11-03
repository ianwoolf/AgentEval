# Guardrail 专项评测详细设计

日期：2026-11-02。状态：设计基线已确认，部分基础契约及 mock 已实现；整体链路未完成，当前状态以实施台账为准。
配套执行台账：[实施计划与进度](2026-11-02-guardrail-evaluation-plan.md)。

## 1. 范围与已确认决策

- 仅新增 Guardrail dataset 类型及其专项流程；普通 dataset 的 schema、评分契约和历史报告保持兼容。
- Guardrail dataset 三列为 input、label、strategy；发布版本绑定默认 scorer 及 aspect。
- Trigger 选择 target、一个或多个 dataset 版本、environment。点击 target 行时预选 target。
- 对 Guardrail，target 选择 Guardrail ID，由服务解析 endpoint/token。Environment 的 model 必须是 none；这只禁止 LLM 生成，不能跳过 Guardrail 请求。
- Dataset 自动带入 scorer/aspect，Trigger 不再次选择 scorer。第一版每个 Guardrail dataset 绑定一个 scorer。
- Target configuration 仅提供默认值，不再限制本次 Trigger 的 dataset 子集；保留旧请求路径兼容性。
- Git scorer 版本固定到 commit 和执行产物；输出二分类结果，报告展示 TP/FP/TN/FN。
- 一次测评内各 dataset/scorer 组合分别展示，cost 使用明确标记的 mock 值。
- UI 使用英文文案、紧凑表格、行内校验、侧边详情，不采用大卡片堆叠或多步向导。
- 本阶段不引入 Suite/Objective 注册中心、加权总分、真实计费或任意语言脚本执行。

## 2. 当前代码与差距

Backend 独立仓库 `evaluation-backend`，当前基线提交 03df437；UI 基线 aee2854。

| 位置 | 当前行为 | 本次改动 |
|---|---|---|
| worker.py | model=none 设置 target=None | 显式按执行模式区分 direct guardrail 与无模型评分 |
| targets.py | target 包含 id/name/provider/version/definition | 增加非敏感连接引用和内部 detail resolver |
| target_configs.py / runs.py | 根据保存配置限制 datasets，使用保存 environment | 新建本次运行选择契约；旧接口保留 |
| scorers.py / executable_scorers.py | 内置库、Rule、Prompt/G-Eval | 新增隔离 Git scorer adapter，不改变旧 Score 契约 |
| aspects.py | 基于 scorer.criteria.aspect 聚合通过率 | 为新运行按 binding_id 统计分类指标 |
| storage/experiment.py | 多 dataset 执行 | 增加 Guardrail 请求结果、独立评分和分阶段错误 |
| UI eval-page / trigger-target / reports-page | 当前选择与报告流程 | 紧凑 Trigger、binding 对比、请求详情 |

## 3. 数据契约

### 3.1 Dataset

在既有 dataset 版本中增加可选 `evaluation_type`，缺省 `generic`。仅 `guardrail` 应用下面的验证规则。

业务导入保持 input、label、strategy 三列。input 第一版支持非空字符串或 provider 支持的 JSON 对象；label 必须能映射到 safe/unsafe；strategy 为字符串，允许空值并按 Unspecified 展示。生成稳定 row_id，保留导入顺序，不对相同文本跨行去重。

复用既有 rows/input/reference/metadata 存储，不强迫普通 dataset 改列：Guardrail 导入适配器将 label 放入 reference.label，strategy 放入行 metadata.strategy。导出重新还原三列；UI 用专用三列编辑器。

Guardrail dataset 版本附加配置示例：

```json
{
  "evaluation_type": "guardrail",
  "guardrail": {
    "label_mapping": {"safe": "safe", "unsafe": "unsafe"},
    "scorer_id": "guardrail-classification",
    "scorer_version": 3,
    "aspect_id": "prompt-injection",
    "aspect_name": "Prompt injection detection"
  }
}
```

允许数字 0/1 标签，但映射键规范化规则必须显式且严格，bool 不隐式当数字。发布时验证全部 label、scorer 版本、Git 产物就绪状态。新增配置不改写旧 immutable 版本。

### 3.2 Run binding 与快照

每个所选 dataset 版本生成一个 binding，示例：

```json
{
  "binding_id": "binding-001",
  "dataset_id": "injection",
  "dataset_version": 2,
  "scorer_id": "guardrail-classification",
  "scorer_version": 3,
  "aspect_id": "prompt-injection",
  "aspect_name": "Prompt injection detection",
  "scorer_commit": "full-commit-sha",
  "artifact_digest": "sha256:..."
}
```

binding_id 在 run 内稳定，结果关联不依赖名称。冻结 target/version、environment/version、所有 bindings、标签映射、provider adapter 版本、超时/并发、cost mock 规则和内容保留策略。Token 与私有 Git 凭证不进入快照。

同一 run 第一版禁止重复选择同一 dataset ID；每个 dataset 一个 scorer，因此每行只产生一次请求。后续支持多 scorer 时按 dataset version + row_id 复用一次响应，不跨 dataset 按文本去重。

### 3.3 分类评分

保留旧数值 Score，新增分类结果类型，不把字符串 outcome 塞入旧 value。

```json
{
  "kind": "binary_classification",
  "binding_id": "binding-001",
  "expected": "unsafe",
  "predicted": "unsafe",
  "outcome": "TP",
  "reason": "Unsafe input was blocked",
  "status": "completed",
  "source": "real"
}
```

Positive 固定为 unsafe：unsafe→unsafe=TP；safe→unsafe=FP；safe→safe=TN；unsafe→safe=FN。平台用 dataset label 校验 expected，根据 predicted 计算/核对 outcome。未知结果不得默认为 safe。

## 4. Trigger API 与校验

建议新增 `POST /api/v1/evaluations/guardrail-runs`，避免改变旧 target-runs 的默认含义。复用 run orchestration、幂等、Job 启动及查询能力，不复制另一套调度器。

```json
{
  "name": "Guardrail regression",
  "target_id": "guardrail-privacy",
  "target_version": 3,
  "datasets": [{"dataset_id": "injection", "dataset_version": 2}],
  "environment_id": "env-isolated",
  "environment_version": 1
}
```

Header 保留 X-Project-ID 和 Idempotency-Key。返回既有 run ID / experiment ID，立即跳转 report，显示 QUEUED/RUNNING。

启动前统一验证：同项目目标及版本有效、1–20 个不重复已发布 dataset、总样本上限沿用当前 10000、全部为 guardrail 类型、绑定 scorer 已发布且产物可用、environment model=none、资源限制有效。普通/Guardrail dataset 混选第一版拒绝并给出明确错误。

保存运行快照后才启动 Job；幂等 key 对规范化请求和快照选择做一致性检查。相同 key、不同配置返回冲突。前端禁用重复点击不能代替后端幂等。

## 5. Guardrail detail 与 proxy

接口边界：`TargetDetailResolver.resolve(project, target_id, version, run_id)`。初版 backend 实现配置/Secret 引用解析；未来可替换外部管理服务。

建议内部接口 `GET /internal/evaluations/{run_id}/target-detail`。使用 runner scoped 凭证核验 run/project/target；不能仅凭任意 target ID 获取所有凭证。

返回 endpoint、provider、auth 类型/token、timeout、TLS 策略及 detail revision。UI target 列表仅返回名称/ID/version、经过处理的 endpoint 和 credential_configured 状态。Endpoint 不允许内嵌用户名密码，带敏感查询串的地址不直接展示。

Runner 内独立 guardrail proxy 获取 detail，缓存本次运行配置，provider adapter 负责请求封装与响应规范化。Input 发给 Guardrail；label 和 strategy 不发送，除非未来 provider 契约显式要求且发布新 adapter。

执行顺序：准备运行→解析 detail→加载 scorer artifact→执行样本→proxy 调用→分类评分→collector→ES。准备失败明确标记 run FAILED；单样本 HTTP/解析/评分错误标记 ERROR，继续其他样本。

第一版不开自动重试，记录 attempt=1；未来重试应逐次存储，不覆盖第一次耗时/费用。Token 过期返回显式认证错误，不无限重试。这里的 token 是服务凭证，与实现工作中模型上下文预算无关。

## 6. Git scorer 生命周期与隔离

Git 配置：repo URL、用户输入 ref、发布时 resolved commit、入口 `scorer.py:score`、Python runtime、依赖 lockfile、单条超时、CPU/内存限额。

发布流程：校验仓库配置→受控组件拉取固定 commit→验证入口/依赖→构建隔离执行产物→记录 digest→版本标记 ready。失败版本不可用于新测评。构建本身执行依赖安装，也必须在无业务凭证的隔离环境内运行。

Runner 只加载已就绪的固定产物，不在样本循环中 git pull 或 pip install。不接受 branch HEAD 随运行漂移。私有仓库凭证通过独立 secret reference 提供，只用于代码获取组件。

协议优先 JSON stdin/stdout，每条请求输入 input、expected label、strategy、规范化 output 和必要的脱敏 raw response；输出 predicted/reason，可提供 outcome 供平台校验。限制输入/输出大小与超时；stdout 只承载协议，stderr 为受限且脱敏的诊断日志。

Scorer 是用户代码，不能与持有 endpoint token、ES 凭证的 worker 共用环境变量/可读 secret volume。采用独立容器/现有 sandbox 执行边界，默认无网络、非 root、只读根目录、限制进程与资源。K8s 和 Compose 都要有等效边界，不能用同进程 import 假装隔离。

## 7. 请求结果、指标与 ES

继续三个索引：records-v2 存资源、绑定和 run 汇总；samples-v2 存唯一请求与 scores[]；traces-v1 存阶段 trace。

请求字段：run_id、request_id、dataset_id/version、row_id、strategy、label、status、started_at、guardrail_latency_ms、scorer_latency_ms、total_latency_ms、http_status、normalized_output、request/response、cost、scores[]、trace_id。错误增加 stage/code/retryable，正文遵守现有内容保留策略。

cost 示例：`{"amount":0.001,"currency":"USD","source":"mock","policy_version":"mock-v1"}`。单价来自配置并在 run 冻结，不伪装真实账单。未发出的请求 cost=0；已发出请求包括错误响应按 mock 规则计费。共享请求不重复计费。

每个 binding 汇总 TP/FP/TN/FN、error/pending、valid_count、total_count、coverage、latency avg/P50/P95、cost。Latency 统计所有已发出请求，另给成功请求统计；不混入准备/排队时间。overall wall time 单列。

- Accuracy=(TP+TN)/(TP+FP+TN+FN)
- Precision=TP/(TP+FP)
- Recall=TP/(TP+FN)
- F1=2TP/(2TP+FP+FN)
- FPR=FP/(FP+TN)，FNR=FN/(FN+TP)
- Coverage=有效分类数/已处理样本数；执行中同时展示 processed/total。
- 分母为零返回 null，UI 显示 —；ERROR 不归入任意象限。

Report 按 binding_id 分组，同名 aspect 仍保留独立行。strategy 是行内 drilldown。统计遍历全量结果，不依赖当前请求表分页。Pending/运行中结果标注 provisional。

新增可查询字段需显式 ES mapping；沿用 dynamic:false 时仅保存在 _source 的字段不能直接筛选。部署通过增量 mapping 更新增加字段，不删索引，不重写旧结果。Collector 使用 run/request/binding 标识幂等 upsert，重发不得累加成本或重复计数。

## 8. Report API 与紧凑 UI

扩展现有 report 返回 `binding_results[]`，旧报告无该字段继续旧视图。请求列表支持 binding_id、strategy、outcome、status 和分页，详情按 request_id 获取并做项目隔离。

Trigger：首行 Target + Environment；中部 dataset 搜索与紧凑表格（复选、名称、版本、默认 scorer、aspect、样本数）；底部总选择/样本数与 Cancel/Run。无 scorer 或版本不可用在行内显示，不依赖 tooltip 才能发现错误。

Report：顶部一到两行概览；主体 aspect 对比表（aspect、dataset/scorer、进度、TP/FP/TN/FN、F1、P95、mock cost）；点击行切换下方请求表；请求点击打开侧边面板。四象限和 strategy 统计按需展开。

请求侧栏：输入/label/strategy、判断/reason、HTTP 状态、分阶段 latency、mock cost；请求响应 JSON、trace、Git commit 和版本放折叠区。所有 credential/header 均过滤。表格窄屏允许横向滚动，保留键盘选择与清晰焦点。

Dataset 页面仅 guardrail 类型显示三列与默认 scorer/aspect 配置；普通 dataset 原编辑器保持不变。

## 9. 外部契约待补充及实施边界

1. Guardrail detail 的真实来源（服务/API、鉴权、ID/version 语义）。
2. 首个 provider 的请求示例、成功/拦截/错误响应示例。
3. Git scorer 仓库、入口、私有仓库认证方式及依赖。

以上不是继续所有工作的阻塞：可先实现契约、fake resolver/provider、隔离协议测试和 UI。但没有真实契约时不能猜测厂商格式，不能声称完成真实 Guardrail 联调。

## 10. 验收底线

- 普通 dataset、旧运行/报告通过原回归；Guardrail model=none 确实请求 Guardrail 且无 LLM 调用。
- 两个 dataset、不同 scorer/aspect 一次运行；TP/FP/TN/FN 各有样例，额外包含 timeout 和无效响应。
- 修改配置、Git branch 或标签后，既有 run 的 commit/版本/结果不变。
- 断点/重复 collector 消息不重复计算；分页和筛选不改变全量汇总。
- Secret 不进入 scorer、UI、ES 快照或日志；Git 执行超时和资源限制有效。
- 新旧 API、UI、worker 镜像一致；K8s 和 Compose 配置兼容，部署不覆盖已有 Secret/业务数据。
