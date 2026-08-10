# 《AI异常调查局：失控的分类器》技术设计

## 技术架构
- React + TypeScript + Vite。
- SVG 负责散点、误判标记和决策边界，不引入图表库。
- 浏览器本地状态，无后端、无账号、无外部 AI API。
- 纯 TypeScript 实现数据生成、特征转换、模型、评估、状态机和日志。
- 核心逻辑与 React 解耦，可在 Vitest 的 Node 环境直接测试。

## 目录结构
```text
src/
  content/level1.ts          # 第一关文案、阶段配置、特征与模型解锁
  ml/
    types.ts                 # Sample / Feature / Model 接口
    rng.ts                   # 可复现 PRNG
    data.ts                  # 训练/测试样本生成
    features.ts              # 特征投影
    linear.ts                # 线性分类器
    tree.ts                  # 浅层决策树
    knn.ts                   # KNN
    evaluate.ts              # 指标、错误样本、决策网格
    registry.ts              # 统一模型注册表
  bureau/
    progress.ts              # 调查局长期进度、档案发现、值班结案与工单队列
  game/
    types.ts                 # GameState / Action / Stage
    reducer.ts               # 状态机
    hints.ts                 # 小析分级提示
    logging.ts               # 匿名行为日志
    session.ts               # Story Case 版本化检查点、净化与运行时校验
    routes.ts                # debug 自动路线
  components/
    BureauHub.tsx             # 调查局 Hub：案件板 / 训练 / 档案 / 值班室
    EntryExperience.tsx       # 新人 CASE 001 标题 + Cold Open；入职后可返回 Hub
    InvestigationPrompt.tsx  # 草稿 → 锁定 → 反馈的调查判断
    SampleHunt.tsx           # 直接在散点图中抓异常旧样本
    ExperimentPlan.tsx       # 正式实验前预测与审计额度
    PredictionOutcome.tsx    # 错误上线判断的现场后果
    CaseAttempts.tsx         # CASE_NOTES 可比较 / 可选择实验记录
    CaseRating.tsx           # 证据驱动的结案评级
    SensorIntro.tsx          # 当前与备用观察通道的逐步读取
    ScatterPlot.tsx
    TaskBanner.tsx
    FeaturePicker.tsx
    ModelPicker.tsx
    Metrics.tsx
    ErrorSamples.tsx
    AssistantPanel.tsx
    DebugPanel.tsx
  endless/
    generator.ts             # 四类程序化监督学习故障与传感器通道重排
    observables.ts           # 训练标签 + 无标签现场分布的公开证据
    balance.ts               # evidence-policy / random-clicker 自动玩法基线
    EndlessIntro.tsx         # 无尽模式规则说明与 Boot / 正式模式入口
    BootCase.tsx             # 训练案件 000：控制变量、读日志、诊断提交
    EndlessNavigator.tsx     # answer-neutral NEXT OBJECTIVE / 案件线索 / 档案记录
    FieldManual.tsx          # 玩家主动打开的静态调查方法手册
    session.ts               # 版本化 seed-local 调查 session 与运行时校验
    uiTypes.ts               # 实验记录、证据包、配置 delta / 对照纯函数
    EndlessMode.tsx          # 无尽模式状态与结案逻辑
    EndlessPlot.tsx          # 程序化案件二维实验台
    EndlessControls.tsx      # 特征 / 模型 / 预测 / 审计预算
    EndlessEvidence.tsx      # 错误、类别召回、实验记录与诊断
  App.tsx
  main.tsx
  styles/app.css
tests/
  bureau-progress.test.ts
  ml.test.ts
  game.test.ts
  routes.test.ts
```

## 数据结构
```ts
type Label = 'cat' | 'bread'

type RawFeatures = {
  warmth: number
  roundness: number
  texture: number
  aspect: number
}

type Sample = {
  id: string
  split: 'train' | 'test'
  label: Label
  features: RawFeatures
  flags?: { noise?: boolean; outlier?: boolean; orangeCat?: boolean }
}

type FeatureKey = keyof RawFeatures

type Point2D = {
  id: string
  x: number
  y: number
  label: Label
  source: Sample
}
```

测试数据由 `createDataset(seed)` 一次生成，但普通游戏状态仅保存训练样本与一个不含标签、flags 和语义 ID 的测试视图。`createAuditService` 会把内部 `test-cat-* / test-bread-*` 映射成中性的 `field-001...`；真实测试标签与困难子群 flags 留在评估服务闭包中。仅执行审计时返回该次错误案例需要的信息，`debug=1` 才能查看完整真实标签。

## 模型接口
```ts
interface Classifier {
  readonly id: string
  readonly name: string
  readonly complexity: number
  fit(points: Point2D[]): FittedClassifier
}

interface FittedClassifier {
  predict(point: Pick<Point2D, 'x' | 'y'>): Label
  describe(): Record<string, number | string>
}
```

统一约束：
- `fit` 只接收训练点。
- 模型不读取 split、flags 或测试数据。
- 所有参数由训练数据真实计算。
- `describe()` 为 debug 面板提供参数，不参与 UI 教学结论。

## 模型实现
### 线性分类器
使用两类均值的中点与均值差向量构造线性判别面：
- 法向量 = 猫均值 - 面包均值。
- 阈值 = 两类均值中点在法向量上的投影。
- 等价于一个简化的最近类中心线性判别器，计算真实、稳定、易解释。

### 简单决策树
- 最大深度 2。
- 在 x/y 两轴的样本中点上枚举候选阈值。
- 使用 Gini impurity 选择最佳切分。
- 递归到深度上限或纯叶节点。

### KNN
- 欧氏距离。
- 支持 k=1 与 k=5。
- 平票时使用最近邻标签作为确定性 tie-break。
- k=1 作为过拟合陷阱，k=5 作为更平滑备选。

## 特征配置
每个样本内部包含四个语义特征：
- `warmth`：颜色暖度；橘猫和烘烤面包都可能偏高，因此单独使用会混淆。
- `roundness`：轮廓圆度；猫脸通常更圆，长面包更低，但部分面包也可能圆。
- `texture`：纹理粗糙度；毛发和面包表面存在重叠。
- `aspect`：长宽比；对长条面包很有效，但趴卧猫可能形成异常。

玩家每次选择恰好两项，形成二维投影。切换特征即真实改变训练输入和可视化分布。

## 数据生成策略
固定种子 PRNG 生成：
- 训练集约 36 个样本；测试集约 24 个样本。
- 类别大体平衡。
- 阶段 1 的基础特征对训练样本较易线性区分。
- 训练集中加入少量噪声/异常点，让 k=1 形成破碎决策区。
- 测试集包含训练分布附近的新样本，以及“橘猫/圆面包/趴卧猫”等困难子群。
- 所有随机扰动由 seed 控制；测试断言固定 seed 的指标区间与相对排序，不写死 UI 结果。

## 评估模块
`evaluate(fitted, points)` 返回：
- accuracy
- errorCount
- predictions
- mistakes
- confusion counts

`createDecisionGrid(model, bounds, resolution=32)` 返回每个网格点的预测类别。UI 根据相邻网格块填充半透明区域，不伪造边界。

## 调查局 Meta 层

`src/bureau/progress.ts` 保存跨案件的长期事实，和 Story / Endless 各自的详细 session 分层：

```ts
type BureauProgress = {
  version: 1
  inductionAcknowledged: boolean
  story001: { resolved: boolean; bestGrade?: 'S'|'A'|'B'|'C'; bestScore?: number; resolvedAt?: string }
  bootCase000: { completed: boolean; completedAt?: string }
  duty: { resolutions: Array<{ seed: number; syndrome: EndlessSyndrome; grade: Grade; score: number; resolvedAt: string }> }
}
```

key 为 `aia.bureau-progress.v1`。它只回答“哪些案件已经结案 / 哪些知识已经遇到”，不会复制 Story reducer、Endless experiment history、隐藏测试标签或 behavior log。

App 路由的正常产品语义是：

- 未完成 Story 001：默认进入 Story，新人没有 Duty UI 入口；
- Story 001 首次结案：写入长期进度，随后默认进入 Bureau Hub，并显示一次性 induction；
- 已入职：默认进入 Hub；Story / Boot / Duty 都从 Hub 出发并返回 Hub；
- explicit query (`?mode=endless`, `?mode=boot`, `?debug=1`) 仍可用于开发 / 复现，但不会因为绕过正常入口就凭空授予 Duty meta 进度。

`BureauHub` 只消费各系统的摘要：Story checkpoint 摘要、Endless resumable 摘要和长期 `BureauProgress`。存在未结 Duty session 时只允许继续 / 明确放弃；没有未结案件时，通过 `nextDutySeeds()` 跳过已经归档的 seed，再用 `createEndlessCasePreview()` 生成 3 份 symptom-only 工单。该 preview 的公开类型只含 `seed / caseNo / title / incident / reportedFacts`，不携带 syndrome、diagnosis、test 或 audit；Hub 因此在类型层也拿不到答案对象。

## 游戏状态机
```ts
type Stage =
  | 'briefing'
  | 'inspect_data'
  | 'choose_features'
  | 'choose_model'
  | 'train'
  | 'first_success'
  | 'hidden_test'
  | 'inspect_errors'
  | 'iterate'
  | 'overfit_reveal'
  | 'final_audit'
  | 'transfer_question'
  | 'complete'
```

核心 reducer 状态仍是：seed、stage、selectedFeatures、selectedModel、knnK、fitResult、trainMetrics、testMetrics、viewedMistakes、attempts、failureStreak、hintLevel、history、startedAt、completedAt。

Cold Open、图上异常样本调查、边界 `PROBE ?`、传感器读取、预测下注、正式审计额度、证据推理、实验记录比较、过拟合反思、最终反思和 `CASE_NOTES` 属于单关卡 UI 编排状态，不改变 ML 模型或主 reducer 阶段语义。它们把同一 stage 拆成需要观察 / 判断 / 验证的 micro-beat，而不是增加第二套业务状态机。

Story Case 的长局状态由 `game/session.ts` 统一做版本化检查点。key 为 `aia.story-session.v1.<seed>`；保存 reducer `GameState` 与上述玩家可见 micro-beat，但不会缓存 fitted model，模型仍由 seed + 当前特征 / 模型配置重新计算。`training.params`、审计 mistake 的内部 flags、debug diagnostics 会在序列化前清除；合法 mistake ID 只能是已经公开的 `field-###`。

checkpoint guard 同时做结构与关系校验：stage / micro-beat 必须是 UI 真正可达的顺序；训练 accuracy/errorCount 要符合 seed 对应训练样本数，complexity 必须匹配 `MODEL_REGISTRY`；current audit 与最新 auditHistory 在 confusion、mistake ID / 标签 / 特征上深一致；最新 CASE_NOTES 还必须对应当前已审计模型 / 特征 / 训练分。实验预测命中逻辑抽到 `game/experiment.ts`，运行时写记录和恢复端验证共享同一个 `predictionMatches()`，避免两套公式漂移。迁移题 correctness 直接按 `TRANSFER_QUESTION` 配置核对，额外审计次数则由已花费审计数约束，不能通过修改 localStorage 退款。

Behavior telemetry 只接受合法 feature pair / public mistake ID；`completed`、timestamp 与 elapsedMs 必须和同一匿名 session 时间轴一致。Logger 最多保留最近 500 条事件，并用 `droppedEvents` 累计被丢弃的旧遥测，使极端长局仍可继续 autosave。reader / writer 共享 200KB 上限：损坏、旧版本或超限 payload 会删除 / 拒绝，失败写入不会覆盖最后一份有效检查点。

Story 正式审计额度也不直接持久化：第一份未知审计不计修复预算，之后由 `4 + emergencyAudits - (experimentLog.length - 1)` 重建，因此刷新不能把花掉的额度“退回”。实验前 `pendingPrediction` 属于教学证据，会随检查点恢复；这保证“先预注册假设，再训练 / 审计”的顺序不会被 F5 绕过。

`writeStorySession()` 的失败不是静默状态：GameSession 会显示 `LOCAL SAVE FAILED`，并由一个 retry nonce 显式重跑同一保存 effect。localStorage 恢复可写后，玩家点击“重试本地保存”即可清除警告；保存失败不会阻断当前页面内的游戏流程。

Reducer 对非法动作返回原状态并记录 debug diagnostic；关键动作包括 `START`、`SELECT_FEATURES`、`SELECT_MODEL`、`TRAIN`、`RUN_AUDIT`、`VIEW_MISTAKE`、`REQUEST_HINT`、`ADVANCE`、`ANSWER_TRANSFER`、`RESET_STAGE`、`JUMP_STAGE`。

## 关卡配置格式
`level1.ts` 配置：
- 标题、事故简介。
- 每阶段角色、单句任务、允许操作、解锁模型、解锁特征。
- 成功守卫。
- 小析三级提示。
- 概念揭示文案。
- 迁移问题与解释。

状态机不硬编码具体剧情文本，以便未来新增关卡。

## 监督学习无尽模式
`src/endless/` 复用现有四个模型与二维特征接口，但数据由独立 seed 生成器产生。当前 syndrome：

- `feature-gap`：弱字段几乎不含类别信息，稳定字段组合才可解。
- `overfit-noise`：训练集中加入矛盾局部记录，k=1 会记忆噪声，平滑规则更稳。
- `distribution-shift`：历史捷径字段在现场发生可见分布变化，稳定字段保持关系。
- `class-imbalance`：训练档案被多数类淹没；部分方案总 Accuracy >90% 但少数类 recall <75%。

每个 seed 还会确定性重排四个传感器通道，并从多个案件语境中选择皮肤；因此“稳定信息”不会固定在同一 UI 按钮。

正式模式前有两层桥接，但它们不改变 generator / model：

1. `EndlessIntro` 只解释“配置 → 预测 → 审计 → 对照 → 诊断”的操作循环。
2. `BootCase 000` 使用真实程序化数据、真实分类器和真实 audit 数值完成一条控制变量教学路线；教程解释在此结束。

正式 `EndlessMode` 只保留 answer-neutral 导航：`objectiveFor()` 根据训练、审计、不同配置数、诊断锁和剩余额度返回下一动作目标。`NEXT OBJECTIVE` sticky 在视口顶部，并能定位到实际可操作组件；例如诊断锁且额度为 0 时会直接定位诊断框里的补充审计按钮，而不是把玩家带到实验日志。

正式案件的 syndrome 不直接写进 incident：

- `overfit-noise` 的四条故意矛盾训练记录携带 `flags.noise`，并生成可点击 `archiveAlerts`；UI 只显示采集质量事实，不自动解释为过拟合。
- `distribution-shift` 主题提供 `batchContext.history / field` 原始批次元数据；玩家同时可读取无标签现场 drift。
- `class-imbalance` 由训练样本真实类别比例产生，UI 显示档案构成与分类别 recall。
- `feature-gap` 通过同一模型在不同字段组合上的真实实验差异暴露。

诊断至少要求两个**不同配置**。配置 key 由模型 + 无序特征集合构成；交换 X/Y 不算新配置。达到两个配置后仍不会直接开放病因按钮：玩家必须从 `EXPERIMENTS.LOG` 引用恰好两条不同配置记录，`diagnosisEvidenceStatus()` 才会把证据包标记为 ready。错误诊断会同时记录当前配置数和 run count；必须完成一个字段或模型发生变化的新正式审计，并在下一份证据包中包含 `id > lastDiagnosisRunCount` 的记录，才能改口。完全复现实验会写入日志，但不会解锁诊断。

`EXPERIMENTS.LOG` 通过 `experimentDelta()` 标记 baseline、复现、只换字段、只换模型、混合改动；`experimentPlanDelta()` 在下一次训练前对当前配置做同一套分类。两条引用记录用 `compareExperimentRecords()` 生成 TRAIN / FIELD / min recall / error 的纯数值差分。上述信息只描述玩家自己做了什么，不判断哪次实验“应该”成功。结案评分会奖励单变量对照、轻微惩罚同时改字段与模型，结案报告封存最终引用的 E 记录和已经检查的 field/archive 证据。

正式审计返回的 `mistakes` 在揭示之后可以被玩家主动检查：`EndlessAuditPanel` 使用按钮选择错误，`EndlessPlot` 只对已返回的 public `field-*` 错误点增加可视定位环，`CASE_LEADS.LOG` 仅记录玩家亲手打开的错误。这个流程不会在审计前创建额外测试标签入口。

`session.ts` 使用 `aia.endless-session.v1.<seed>` 保存版本化本地调查状态。存档只包含玩家已经拥有的配置、audit history、诊断状态、证据引用和已检查错误，不保存 generator 内部 test IDs / syndrome answer。运行时 guard 校验 metric 范围、run 顺序、引用 ID、audit/config 一致性等关系；损坏 / 旧版本 payload 会被删除而不是恢复。剩余审计额度不单独持久化，而由 `5 + emergencyCredits - history.length` 重建，因此刷新不会返还额度。入口显式显示 resumable case；新案 / 当前案重置均有明确玩家动作。

零基础指标说明与案件解释分离：正式审计和 `FieldManual` 只定义 `TRAIN`、`FIELD`、分类别 recall 的字面语义，不根据当前结果生成 syndrome 建议。`FieldManual` 作为 `aria-modal` 会把焦点移入对话框、约束 Tab、支持 Escape，并在关闭后恢复到原触发按钮；SVG 档案异常支持 Enter / Space，Space 会 `preventDefault()` 以符合 button 语义。

普通玩家可见的 `observables.ts` 只使用：训练标签 + 现场**无标签**特征分布。它提供：历史类别分离、现场分布变化与旧样本几何矛盾等信号。自动 evidence-policy 与玩家 UI 读取同一类信息，不允许读取隐藏 syndrome/test label 再假装推理。

正式审计初始 5 次；训练免费。每次审计前玩家先预测现场准确率档位。结案要求：存在 `accuracy >= .85 && min(class recall) >= .75` 的可靠实验，并提交正确病因。额度耗尽时可以申请一次补充审计并扣评级，不形成死锁。

## 自动玩法平衡
`balance.ts` 同时执行：

- evidence-policy：按训练类别分离、无标签现场 drift 和旧样本矛盾选择特征 / 模型 / 病因；
- random-clicker：最多随机尝试 5 个模型×特征组合，并随机提交病因。

Vitest 会在大量 seed 上要求 evidence-policy 的结案率与平均未知表现显著优于 random-clicker。这个测试不证明游戏一定“好玩”，但能防止程序化案件退化成“随便点几次也和推理一样有效”。

## 行为日志
默认仍是本地匿名记录，但 Story 检查点会把当前 `BehaviorLog` 一同保存，因此刷新后继续使用原 `sessionId / startedAt / events`；每次真正从检查点恢复会追加一条 `SESSION_RESTORED`。结案页允许普通玩家主动导出完整 JSON，debug 面板也保留原导出入口：
```ts
type BehaviorEvent = {
  sessionId: string
  seed: number
  timestamp: string
  elapsedMs: number
  stage: Stage
  action: string
  features?: FeatureKey[]
  model?: string
  trainAccuracy?: number
  testAccuracy?: number
  mistakeId?: string
  hintLevel?: 1 | 2 | 3
  retryCount: number
  completed: boolean
}
```
不写姓名、账号、邮箱、IP 等个人标识；sessionId 为本地随机短 ID。Story localStorage 中保存的是同一份匿名行为日志，用于跨刷新连续性，显式清档 / 重新调查会同时删除并生成下一局新 session。

## Debug 模式
`?debug=1` 显示独立面板：
- seed 输入/应用、预设 seed 切换。
- 阶段跳转与重置。
- 全解锁。
- 显示测试真实标签、样本预测、模型参数、决策网格摘要。
- 动画速度 0/0.5/1/2。
- 六类自动路线。
- 导出日志 JSON。
- diagnostics 显示非法状态转换、缺失提示、路线卡死。

自动路线执行纯游戏命令，不直接修改 reducer 内部状态，从而能发现状态机问题。

## 测试策略
### 单元测试
- PRNG 同 seed 同输出，不同 seed 有变化。
- 普通测试视图不含 label、flags 或 `cat/bread` 语义 ID。
- 无尽生成器确定性、传感器通道重排、四类 syndrome 均存在可解方案。
- 类别不平衡案件能真实产生“总分高但少数类召回不足”的假好成绩。
- evidence-policy 在批量 seed 上显著优于 5 次 random-clicker。
- 调查评级区分干净证据路线与盲目试错 / 额外额度路线。
- 三模型 fit/predict 的基本正确性。
- 决策树深度不超过 2。
- KNN k=1 / k=5 行为不同且确定性。
- evaluate 与错误列表一致。
- 训练集/测试集严格分离。
- 固定 seed 下存在真实的过拟合陷阱。

### 状态机测试
- 标准路线能通关。
- 未选特征/未训练无法越过守卫。
- 隐藏测试前不暴露测试指标。
- 首次测试失败后需查看两个不同错误样本。
- 连续失败触发 1→2→3 级提示。
- reset/jump 仅 debug 模式生效。

### 自动路线测试
六种人格全部执行到预期终点或明确诊断，不出现无限循环与无可用操作状态。

### 浏览器验证
- Playwright Chromium 剧情路线覆盖 Cold Open、图上抓异常旧样本、决策边界探针、锁定预测、错误上线后果、两条错误证据、可点击实验记录、过拟合、备用传感器修复、迁移问题与结案评级。
- Story session E2E 在真实路线中四次跨刷新：两条误判证据完成后、k=1 实验预注册后、过拟合审计后、CASE CLOSED 后。分别验证微节拍 / 已锁预测 / 审计额度 / 实验历史 / 评级与唯一 COMPLETE 事件都能恢复，并验证显式 resume gateway、二次确认清档和小型 RESET 防误触。
- Story export E2E 真实接收浏览器下载并解析 JSON，要求同一 sessionId 贯穿刷新前后、`SESSION_RESTORED` 数量与实际恢复次数一致、包含早期 / 后期调查动作，同时不包含内部 test ID 或 flags。
- Story 恢复提示与 `OBJECTIVE / MISSION` 有几何 no-overlap 断言；resume gateway 固定在 1280×720 做横向溢出检查。
- 无尽 E2E 覆盖模式说明、Boot Case 000、正式案件 answer-neutral 导航、可点击档案质量记录、不同配置诊断守卫、有限审计预算、正确诊断与下一案生成。
- 证据 E2E 覆盖两条实验记录显式引用、同配置引用拒绝、`EVIDENCE_COMPARE`、可点击现场误判 → `FIELD_MATRIX` 定位与 `CASE_LEADS` 留痕。
- session E2E 覆盖刷新不退款、入口显式恢复 / 二次确认新案、错误诊断锁跨刷新，以及旧证据不能在刷新后重新解锁轮猜。
- 键盘 E2E 覆盖 SVG 档案异常 Space 激活、调查手册焦点进入 / Tab 环 / Escape / 焦点恢复。
- 额外 smoke 使用 1280×720 viewport 验证入口 / Boot / 正式模式无横向爆版且 `定位下一步操作` 仍能把关键 CTA 带进视野。
- distribution-shift E2E 验证历史 / 现场批次元数据真实可见，但首屏不出现“分布漂移”答案词。
- 额度恢复 E2E 故意耗尽 5 次正式审计，验证额外审计可恢复路线但会产生评级代价，避免“有限预算 = 死局”。
- 类别不平衡 E2E 明确验证“总体高分但少数类 recall 50%”不能结案。
- E2E 使用真实 Playwright actionability 检查，防止 SVG、NPC、tooltip、overlay 抢走点击。
- 另有 debug-mode E2E，确保普通玩家的新手门槛不会破坏 `?debug=1` 的快速工程测试能力。
- 本地 `.tooling/` headless Chrome 可在 1440×900 / 1920×1080 做阶段截图 QA；这些运行库与截图不提交 Git。
- 浏览器 console/page errors 为零。

## CI
Node.js 24（与本地正式工具链一致）：
1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test -- --run`
5. `npm run build`
6. 安装 Chromium
7. `npm run test:e2e`

监听 push main 与针对 main 的 pull request。

## 分阶段实现计划
1. 文档 + Git 初始化。
2. Vite/React/TS 基础与测试框架。
3. ML 数据、特征、三模型、评估与固定种子测试。
4. 游戏 reducer、关卡配置、提示与日志。
5. SVG/UI 完整可玩流程。
6. debug 面板与六种自动路线。
7. UI 响应式/动画打磨。
8. 类型检查、单测、构建、浏览器桌面/移动端验证。
9. CI、敏感信息扫描、GitHub 推送与 Actions 检查（远端工具可用时）。
