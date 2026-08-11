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
  app/
    bootstrap.ts             # 应用启动时汇总 Bureau v2 + 旧 Story / Training 迁移
  bureau/
    catalog.ts               # 手工正式案件 / 训练案件唯一身份目录
    dispatch.ts              # Hub 工作优先级；只定位部门，不解释案件
    duty.ts                  # Bureau/App 可见的 Duty preview / resume / clear 适配层
    progress.ts              # catalog-keyed 长期结案与知识事实 + v1→v2 迁移
  story/
    StoryCase001Runtime.tsx  # CASE 001 自己的 UI / micro-beat 编排
    registry.tsx             # 正式案件 runtime：组件 / resume / clear / reconciliation
  training/
    TrainingCase000Runtime.tsx # TRAINING 000：控制变量、读日志、诊断提交
    registry.tsx             # 训练案件 runtime registry
  content/level1.ts          # CASE 001 阶段文案、特征与模型解锁
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
  game/
    types.ts                 # GameState / Action / Stage
    reducer.ts               # 状态机
    hints.ts                 # 小析分级提示
    logging.ts               # 匿名行为日志
    session.ts               # Story Case 版本化检查点、净化与运行时校验
    routes.ts                # 纯测试自动人格路线
  components/
    BureauHub.tsx             # catalog-driven 调查局 Hub：案件板 / 训练 / 档案 / 值班室
    FormalCaseResume.tsx      # 正式案件通用本地存档恢复网关
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
    CheatTerminal.tsx        # QA Test Bench / 合法 checkpoint 快速入口
  qa/
    testBench.ts             # 可逆 aia.* 存档快照、测试沙盒清理与精确恢复
  endless/
    generator.ts             # 四类程序化监督学习故障与传感器通道重排
    observables.ts           # 训练标签 + 无标签现场分布的公开证据
    balance.ts               # evidence-policy / random-clicker 自动玩法基线
    EndlessIntro.tsx         # 无尽模式规则说明与 Training 000 / 正式模式入口
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

测试数据由 `createDataset(seed)` 一次生成，但游戏状态仅保存训练样本与一个不含标签、flags 和语义 ID 的测试视图。`createAuditService` 会把内部 `test-cat-* / test-bread-*` 映射成中性的 `field-001...`；真实测试标签与困难子群 flags 留在评估服务闭包中。只有执行正式审计时才返回该次错误案例需要的信息；runtime 已不再暴露“完整隐藏测试真值”接口。

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
- `describe()` 只用于 ML 层单元测试 / 内部模型检查，不进入 Story `TrainingResult` 或玩家 UI。

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

`src/bureau/catalog.ts` 是手工内容身份的唯一注册点。当前 `FORMAL_CASE_CATALOG` 只含 Story Case 001，`TRAINING_CASE_CATALOG` 只含 Training 000；Hub、Entry、Story cartridge、Resume 与 archive provenance 读取同一目录，避免以后新增正式案件时复制编号 / 标题 / briefing 文案。

手工内容的“身份”和“怎么运行”分离：`src/story/registry.tsx` 要求每个 `FormalCaseId` 注册 `Component / readResume / clearSession / reconcileProgress`；`src/training/registry.tsx` 要求每个 `TrainingCaseId` 注册自己的 runtime component。Vitest 会比较 catalog 与 runtime registry 的 key 集，新增 catalog 条目却忘记接 runtime 会直接失败。`App.tsx` 因此只选择 case id 和模式，不直接 import `StoryCase001Runtime`、Training 000 runtime 或 Story checkpoint reader。

`src/bureau/progress.ts` 保存跨案件的长期事实，和 Formal Case / Endless 各自的详细 session 分层：

```ts
type BureauProgress = {
  version: 2
  inductionAcknowledged: boolean
  formalCases: Partial<Record<FormalCaseId, {
    resolved: boolean
    bestGrade?: 'S'|'A'|'B'|'C'
    bestScore?: number
    resolvedAt?: string
  }>>
  trainingCases: Partial<Record<TrainingCaseId, {
    completed: boolean
    completedAt?: string
  }>>
  duty: { resolutions: Array<{ seed: number; syndrome: EndlessSyndrome; grade: Grade; score: number; resolvedAt: string }> }
}
```

key 为 `aia.bureau-progress.v2`。它只回答“哪些案件已经结案 / 哪些知识已经遇到”，不会复制 Story reducer、Endless experiment history、隐藏测试标签或 behavior log。reader 会校验并迁移旧 `aia.bureau-progress.v1`；未知 catalog id、非法评级 / 时间或重复 Duty seed 会被拒绝。v2 JSON 若损坏，会先清掉坏 key 再尝试仍完整的 v1，因此格式升级不会让一个可恢复旧存档被新的坏 payload 遮住；损坏 v1 也做 best-effort 清理。Training 000 旧完成 key 仅保留为迁移输入，新完成记录只写入 `trainingCases[TRAINING_CASE_000.id]`。

应用启动的持久化 composition 不再写在 `App.tsx`：`src/app/bootstrap.ts#bootstrapBureauProgress()` 读取 canonical Bureau v2、让入职 Formal runtime reconcile 旧结案 checkpoint，并把历史 `aia.boot-case-000.v2` 完成事实归并进 `trainingCases`。旧 Training key 只有在 v2 成功写入后才删除；若浏览器对 Storage 抛 `SecurityError`，bootstrap 返回可用的空长期进度而不是让应用启动崩溃。相关测试同时覆盖成功迁移与 Storage 全拒绝访问。

App 路由的正常产品语义是：

- 未完成 CASE 001：默认进入 formal-case runtime，新人没有 Duty UI 入口；
- CASE 001 首次结案：写入长期进度，随后默认进入 Bureau Hub，并显示一次性 induction；
- 已入职：默认进入 Hub；Formal Case / Training / Duty 都从 Hub 出发并返回 Hub；Hub 的当前部门由 App 层保存，因此 Training / Duty 临时离开后返回原部门而不是重置案件板；
- App 内部模式使用 `formal-case / training / endless` 语义；历史 explicit query `?mode=story`、`?mode=boot` 继续映射到对应 runtime，`?mode=endless` / `?mode=hub` 也保持开发 / 复现兼容；这些直达不会凭空授予 Duty meta 进度，历史 `?debug=1` 参数同样不改变应用权限；
- Formal Case seed 与 Duty seed 分开保存。切换 Duty seed 不会让案件板改用另一个 Story checkpoint key；浏览器回归会真实跨 Duty 往返后重新打开原 CASE 001 结案案卷。

`BureauHub` 只消费各系统的摘要：`readFormalCaseResumes()` 聚合的正式案件 checkpoint 摘要、Duty resumable 摘要和长期 `BureauProgress`。案件板与训练中心分别直接遍历 `FORMAL_CASE_CATALOG / TRAINING_CASE_CATALOG`，而不是手写 CASE 001 / Training 000 卡。存在未结 Duty session 时只允许继续 / 明确放弃；没有未结案件时，通过 `nextDutySeeds()` 跳过已经归档的 seed，再经 `bureau/duty.ts#createDutyCasePreview()` 生成 3 份 symptom-only 工单。该 adapter 只返回 `seed / caseNo / title / incident / reportedFacts`，不携带 syndrome、diagnosis、test 或 audit；`BureauHub.tsx` 不再直接 import `endless/generator`。

同一 `bureau/duty.ts` 还提供 `readDutyResume()` 与 `clearDutyProgress()`：App 只得到 `seed / historyCount / remainingCredits / solved` 摘要和清档动作，不再 import `endless/session` 后自己拼 session 结构。这样 Formal checkpoint 与 Duty session 的内部格式都不会泄漏到应用路由层。

`bureauDispatch()` 只读取长期进度、Boot 完成状态与“是否存在未结 Duty”摘要，输出 `target / code / title / detail / action`。它不会读取 Endless syndrome、字段、模型或审计结果，因此顶部 `SHIFT PRIORITY` 可以承担宏观导航，却不能演变成正式案件的动态解题助手。

`eslint.config.js` 还把这些边界做成 CI 护栏：`App.tsx` 禁止直接 import CASE 001 runtime、Training 000 runtime、Story session 或 Endless session；启动迁移也由 `app/bootstrap` 统一承担，不在 App 里保留旧 localStorage key。`BureauHub.tsx` 禁止直接 import authored runtime、Story / Endless session 与完整 `endless/generator`。本地用 `eslint --stdin --stdin-filename` 注入违规 import 实测，规则会以 `no-restricted-imports` 阻止回归。

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

Story Case 的长局状态由 `game/session.ts` 统一做版本化检查点。key 为 `aia.story-session.v1.<seed>`；保存 reducer `GameState` 与上述玩家可见 micro-beat，但不会缓存 fitted model，模型仍由 seed + 当前特征 / 模型配置重新计算。审计 mistake 的内部 flags 会在序列化前清除；`TrainingResult` 不再携带 fitted model 参数；合法 mistake ID 只能是已经公开的 `field-###`。

checkpoint guard 同时做结构与关系校验：stage / micro-beat 必须是 UI 真正可达的顺序；训练 accuracy/errorCount 要符合 seed 对应训练样本数，complexity 必须匹配 `MODEL_REGISTRY`；current audit 与最新 auditHistory 在 confusion、mistake ID / 标签 / 特征上深一致；最新 CASE_NOTES 还必须对应当前已审计模型 / 特征 / 训练分。实验预测命中逻辑抽到 `game/experiment.ts`，运行时写记录和恢复端验证共享同一个 `predictionMatches()`，避免两套公式漂移。迁移题 correctness 直接按 `TRANSFER_QUESTION` 配置核对，额外审计次数则由已花费审计数约束，不能通过修改 localStorage 退款。

Behavior telemetry 只接受合法 feature pair / public mistake ID；`completed`、timestamp 与 elapsedMs 必须和同一匿名 session 时间轴一致。Logger 最多保留最近 500 条事件，并用 `droppedEvents` 累计被丢弃的旧遥测，使极端长局仍可继续 autosave。reader / writer 共享 200KB 上限：损坏、旧版本或超限 payload 会删除 / 拒绝，失败写入不会覆盖最后一份有效检查点。

Story 正式审计额度也不直接持久化：第一份未知审计不计修复预算，之后由 `4 + emergencyAudits - (experimentLog.length - 1)` 重建，因此刷新不能把花掉的额度“退回”。实验前 `pendingPrediction` 属于教学证据，会随检查点恢复；这保证“先预注册假设，再训练 / 审计”的顺序不会被 F5 绕过。

`writeStorySession()` 的失败不是静默状态：GameSession 会显示 `LOCAL SAVE FAILED`，并由一个 retry nonce 显式重跑同一保存 effect。localStorage 恢复可写后，玩家点击“重试本地保存”即可清除警告；保存失败不会阻断当前页面内的游戏流程。

Reducer 对非法动作返回原状态并记录 diagnostic；关键动作包括 `START`、`OBSERVE_DONE`、`SET_FEATURES`、`SET_MODEL`、`TRAIN_RESULT`、`AUDIT_RESULT`、`VIEW_MISTAKE`、`REQUEST_HINT`、`ADVANCE`、`ANSWER_TRANSFER`。没有专用 jump / load action。

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

`createEndlessCase()` 现在还生成一个 `baseline: { model, features }`，代表事故发生时真实部署的故障配置。baseline selector 可以在 generator 内部用隐藏 field truth 校验“这套部署确实会坏、且存在 material controlled intervention”，因为这是**关卡作者 / 生成器约束**，不是玩家推理接口；`EndlessCasePreview`、Hub、Sensor Deck 与正式导航都不会暴露这个搜索过程、最佳 pair 或隐藏 audit 结果。新局因此不再固定从 `warmth + roundness + linear` 开始，而是先复现一宗真实事故。

`overfit-noise` 的 field probes 会在四维上靠近被错误标记的历史记录，同时附近保留多数正确邻域，使 `k=1` 真实记住局部偶然点、`k=5` 有机会被邻域多数拉回。`distribution-shift` 则不再把历史捷径在现场直接反转，而是把它们压缩到高度重叠的区间：第一次 FIELD 失败因此可以与 overfit 的“训练近满分 / 现场中度下降”重叠，病因不能再只靠一次分数模板识别；稳定字段关系仍保持，因此 fields-only 实验依然能恢复。

正式模式前有两层桥接，但它们不改变 generator / model：

1. `EndlessIntro` 只解释“配置 → 预测 → 审计 → 对照 → 诊断”的操作循环。
2. `BootCase 000` 使用真实程序化数据、真实分类器和真实 audit 数值完成一条控制变量教学路线；教程解释在此结束。

正式 `EndlessMode` 只保留 answer-neutral 导航：`objectiveFor()` 根据训练、审计、不同配置数、诊断锁和剩余额度返回下一动作目标。`NEXT OBJECTIVE` sticky 在视口顶部，并能定位到实际可操作组件；例如诊断锁且额度为 0 时会直接定位诊断框里的补充审计按钮，而不是把玩家带到实验日志。第一次 baseline 审计若存在现场错误且玩家尚未检查当前 run 的任何误判，导航会先返回 `FIELD / INSPECT FAILURE` 并定位 `FIELD_ERRORS.LOG`；点击任一误判后才恢复到 causal-source 选择。这一状态只改变引导，不参与诊断 gate，因此不会把历史错误卡变成不可恢复的硬前置条件。

正式案件的 syndrome 不直接写进 incident，而且 cause-specific 原始事实也不再自动出现在开局 UI。`generator.ts` 为每宗案生成三份 `leadSources`：

- `composition / H-COVERAGE`：历史档案池的精确类别构成；类别比例 ≥3 时 finding 为 `signal`，否则为 `clear`。class-imbalance 案的偏斜会真实进入训练集；部分其他 syndrome 也故意来自偏斜上游档案池，但其本次训练子集仍保持平衡，因此 coverage signal 只表示“上游覆盖值得追查”，不能直接推出训练不平衡。
- `batch / H-CONTEXT`：历史 / 现场采集条件；真正的 shift 案一定有具体 `batchContext`，但一部分 feature-gap / overfit / imbalance 案也故意带有真实、却未必是主因的运营批次变化。因而 `signal` 现在只表示“变化确实发生、值得实验验证”，不能再被当成 distribution-shift 的答案代理。
- `quality / H-RECORDS`：历史质量系统是否标记待复核记录；overfit 的真实噪声与部分其他 syndrome 的 benign quality alert 都会形成 `archiveAlerts`，且都只有玩家打开这份来源后才在散点图出现橙色可点击 `!`。positive finding 只表示记录值得检查，不等价于标签错误或 overfit。

baseline 前三份来源统一 `SEALED`。第一次正式审计之后，玩家主动决定先核验哪一条 causal story；之后只有新增一个此前未审计过、且相对上一轮属于 fields-only / model-only 的配置才再获得一次来源解封额度。`experimentConfigKey()` 会把字段顺序归一化，所以重复同一配置或只交换两个显示槽位都不能刷来源；mixed change 同样不会奖励取证额度，因为它没有形成可归因的对照。`signal` 只是支持继续调查，`clear` 才承担“杀掉一个竞争解释”的反证作用。finding 不包含 syndrome 名称。

来源解封增加轻量 causal-source pre-registration：`caseLeadPredictions` 按 `composition / batch / quality` 保存 `signal | clear`，`EndlessLeadBoard` 只有在 READY source 已留下预测后才允许执行 `onInspectCaseLead`；runtime 同时二次守卫，避免绕过 UI。来源打开后预测不可修改，并用 `caseLeadForecastStats()` 只统计真正已经 inspected 的来源。字段作为 v6 session 的可选扩展保存，因此已有 v6 checkpoint 不需要版本迁移；validator 会拒绝未知 source id / prediction 值，但缺失该字段的旧存档继续合法。

诊断不再只要求“两个不同配置”。`discriminatingExperiment()` 只有在两条相邻正式记录属于 **fields-only 或 model-only**，且 `FIELD` 或最低类别召回的绝对变化达到 **12 个百分点**时，才认为它们真正区分了竞争解释；性能显著下降和显著改善都属于信息，因为 falsification 本来就可能通过“只改一个因素后结果崩掉”完成。受控实验训练完成后、正式审计前必须写入 `causalPrediction: improved | degraded | null`，把“这个单变量应该明显改善 / 明显恶化 / 基本不起作用”封存在 run record 与 session 中；运行时 guard 与按钮状态都阻止未预注册的 fields-only / model-only 审计。为不破坏已经生成的 v6 存档，reader 仍接受旧值 `material`，并沿用旧语义将任意非 null material change 视为该旧预测命中；当前 UI 不再生成它。repeat 只验证稳定性，mixed change 无法归因，都不能解锁病因。

`CASE_LEADS.LOG` 在第一条 baseline 后显示两条 syndrome-neutral 假设：`H-FIELDS / H-MODEL`。每个轴通过 `hypothesisAxisStatus()` 累积全部受控实验，而不是让最后一次结果覆盖此前证据：未测试为 `OPEN`，只有 material change 为 `SUPPORTED`，只有 <12pt 弱变化为 `WEAKENED`，同一轴两类结果都出现则为 `CONTESTED`。`CONTESTED` 明确告诉玩家该因素可能具有条件依赖性，需要回到不同实验的共同端点继续解释冲突；两个轴也都可能被支持。这个状态只由玩家自己的 run history 计算，不读取 `caseData.syndrome`。

病因名称采用更严格的 progressive disclosure：`diagnosisAvailable` 同时要求至少两个不同配置、存在 fresh material single-variable experiment、已经找到 `accuracy >= .85 && min recall >= .75` 的可靠方案、至少主动复核一份 causal source，并满足 **falsificationReady**。后者只有两种来源：① 已打开 source 的 `result === clear`，客观排除了一个因果故事；② 当前 material support 所在轴的**竞争轴**在审计前已经留下 causal pre-registration，随后实际变化 <12pt，形成可追溯的 `WEAKENED` null result。`competingAxisNullResult()` 明确要求 fields support 配 model null，或 model support 配 fields null；而且这个 competing-axis null 必须与 material support 的某个端点共享**完整相同配置**，再沿竞争轴改一个变量。也就是说，fields support 后的 model null 不能只复用相同字段却比较两种从未出现在 support 端点的模型；model support 后的 fields null 也不能只复用相同模型却在两套无关字段之间比较。这样同一轴上的 material + null、第三套无关配置上的 competing-axis null，以及“只共享固定轴但没有真实共同端点”的局部断链，都不能被拼成完整“支持 + 反证”链。引用诊断证据时也重新按所引用 material 对照的轴检查这一条件，避免引用一组支持证据、却拿另一组无关 null 过 gate。`diagnosisEvidenceStatus()` 还要求两条被引用记录在 run history 中真实相邻：正式对照的语义是“上一条配置 → 下一条配置”的实际干预，而不是事后从任意两次历史审计中挑出看起来像单变量的端点重新拼接。这样第二条记录上的 causal pre-registration 与被引用的前置配置始终属于同一次真正执行过的实验。错误诊断后的 retry 还把 `lastDiagnosisRunCount` 传入 competing-axis falsification 搜索：新的 material support 不能复用上次诊断前已经存在的 null result，support 与补全它的干预型反证都必须包含 fresh run。没有预注册的弱变化仍可削弱 UI 中的轴状态，但不会被 `preRegisteredNullResult()` 当作正式 falsification gate。`causalPredictionResult()` 另外把每次已预注册的单变量实验归一成 `expected / observed / hit`，把 material result 再区分为 `improved / degraded / tradeoff`，供实验日志显示“应改善 / 应恶化 / 应基本不变 → 实际明显改善 / 明显恶化 / 指标冲突 / 基本不变”，让方向判断本身成为可复盘记录。当 FIELD 与最低召回都至少变化 12pt 且方向相反时，`discriminatingExperiment()` 保留其 material / discriminating 属性，但方向标为 `tradeoff`；因此它能证明干预轴重要，却不会因为绝对变化稍大的单个指标而误报成净改善或净恶化。只有支持证据而没有独立反证时，`NEXT OBJECTIVE` 会停在 `CAUSE / FALSIFY` 或证据引用阶段，诊断面板会明确提示去测试另一条干预轴或复核一个 `clear` source，syndrome 选项仍不会开放提交。

玩家随后仍必须从 `EXPERIMENTS.LOG` 引用恰好两条能构成 material single-variable comparison 的记录；这组被引用的对照还必须至少有一个端点本身达到可靠线。`latestReliableDiscriminatingExperiment()` 对诊断开放使用同一约束，而 `latestDiscriminatingExperiment()` 仍保留给一般假设状态显示。这样不能把“某处出现过一个可靠 mixed 配置”和“另一处出现过一组 material 单变量变化”事后拼成结案解释；因果证据必须真正触及修复成功的配置。最终病因还必须和这组引用证据的干预轴一致：`overfit-noise` 需要 `H-MODEL` material support，其余三个当前 syndrome 需要 `H-FIELDS` material support。`diagnosisSourceStatus()` 将来源关系显式区分为 `not-required / missing / contradicted / supported`，`diagnosisSourceSupported()` 再把其中可提交的两种状态收敛为布尔 gate。来源可辨识病因仍要求对应的已复核 positive source：overfit→quality、shift→batch、imbalance→composition，且该 lead 必须为 `signal`；`feature-gap` 因没有专属来源不加这层 gate。已复核但为 `clear` 的 required source 属于 `contradicted`，UI 与导航必须把它当作直接反证，而不是继续显示“缺来源”。选择与引用轴矛盾或缺少直接来源支持的病因时可以继续查看选项，但报告提交保持锁定并直接指出矛盾，避免“证据证明字段重要、结论却写成模型过拟合”或“只靠猜 syndrome 名称”这种不自洽报告。若 intervention falsification 用来开放诊断，`latestFalsifiedDiscriminatingExperiment(..., requireReliableEndpoint=true)` 也只接受这类 resolution support。错误诊断后下一份证据还必须包含 `id > lastDiagnosisRunCount` 的新 run。结案时由 `diagnosisSourceLeadId()` 重新定位最终病因要求的正向来源：若存在且已经以 `signal` 通过 gate，`CAUSAL SUPPORT` 会封存该来源 label 与完整 finding；`feature-gap` 则明确记录其支持来自 material 单变量干预。`CAUSE SOURCES` 继续保留全部已复核来源列表，二者分别承担“哪条事实支持最终病因”和“调查过哪些来源”的职责，使最终案卷同时回答“什么支持我的解释”“什么排除了替代解释”以及“哪条受控干预真正连接到可靠修复”。

`EXPERIMENTS.LOG` 通过 `experimentDelta()` 标记 baseline、复现、只换字段、只换模型、混合改动；`experimentPlanDelta()` 在下一次训练前对当前配置做同一套分类。两条引用记录用 `compareExperimentRecords()` 生成 TRAIN / FIELD / min recall / error 的纯数值差分，`discriminatingExperiment()` 在其上只判断“这个单变量实验有没有让世界明显变化”，不推断 syndrome。结案评分继续奖励单变量对照、轻微惩罚 mixed change，结案报告封存最终引用的 E 记录和已经检查的 field/archive 证据。

正式审计返回的 `mistakes` 在揭示之后可以被玩家主动检查：`EndlessAuditPanel` 使用按钮选择错误，`EndlessPlot` 只对已返回的 public `field-*` 错误点增加可视定位环，`CASE_LEADS.LOG` 仅记录玩家亲手打开的错误。这个流程不会在审计前创建额外测试标签入口。

`session.ts` 当前使用 `aia.endless-session.v6.<seed>` 保存版本化本地调查状态。存档仍只包含玩家已经拥有的配置、audit history、诊断/引用、已打开 causal source 与已检查错误，不保存 generator 内部 test IDs / syndrome answer。

版本迁移按数据语义处理，而不是机械改 version：当前 Duty session 为 v6。v6 没有改模型或现场样本，因此 v5/v4/v3 audit history 可以保留；但 `H-COVERAGE` finding 的语义从“训练数据精确构成”扩展为“上游档案池构成”，所以迁移时会把 `inspectedCaseLeadIds` 清空，让玩家重新打开 causal-source folders，而不是静默改写已经读过的证据。迁移仍遵守**先成功写 canonical v6，再删除唯一旧副本**；写入失败时旧原件保留。v2 非 shift 也可直接迁到 v6 并从未打开 causal source 开始；v2 distribution-shift 因 v3 已改变 field world 仍必须作废，v1 继续明确清理。运行时 guard 继续校验 metric 范围、run 顺序、引用 ID、audit/config 一致性等关系；剩余审计额度仍由 `5 + emergencyCredits - history.length` 重建，因此刷新不会退款。

零基础指标说明与案件解释分离：正式审计和 `FieldManual` 只定义 `TRAIN`、`FIELD`、分类别 recall 的字面语义，不根据当前结果生成 syndrome 建议。`FieldManual` 作为 `aria-modal` 会把焦点移入对话框、约束 Tab、支持 Escape，并在关闭后恢复到原触发按钮；SVG 档案异常支持 Enter / Space，Space 会 `preventDefault()` 以符合 button 语义。

普通玩家可见的 `observables.ts` 只使用：训练标签 + 现场**无标签**特征分布。它提供：历史类别分离、现场分布变化与旧样本几何矛盾等信号。正式 Sensor Deck 不再把四个字段统一压成 `旧差异 X/5 / 现场变化 Y/5` 排行；玩家需要切换二维投影观察 `FIELD MATRIX`。自动 evidence-policy 仍可把同一类可见统计压缩成策略分数用于批量验证，但不允许读取隐藏 syndrome/test label 再假装推理。

正式审计初始 5 次；训练免费。每次审计前玩家先预测现场准确率档位；fields-only / model-only 还必须做方向性 causal pre-registration。`causalForecastStats()` 从相邻正式记录中汇总这些因果预测的 hit / miss，baseline、repeat、mixed 不计入。结案评分沿用既有实验次数 / 现场预测 / 额外额度 / controlled-vs-mixed 结构，但在原始封顶分之后再对每次 causal miss 扣 3 分，因此错误预测仍保留为有效实验事实和 falsification，却会降低调查评级，避免方向预注册退化成无成本随机选择。结案要求：存在 `accuracy >= .85 && min(class recall) >= .75` 的可靠实验，并提交正确病因。额度耗尽时可以申请一次补充审计并扣评级，不形成死锁。

## 自动玩法平衡
`balance.ts` 同时执行：

- evidence-policy：和玩家一样先审计 generator 给出的故障 baseline，再根据训练类别构成、无标签现场 drift、档案质量告警与旧样本几何设计一个 fields-only / model-only 干预；如果第二跑只完成了假设区分但仍未可靠，最多再做第三次受控修复；只有拿到 material discriminating evidence + 可靠方案 + 可见证据支持的病因才算 solved；
- random-clicker：也从同一个 deployed baseline 起步，在总 5-audit 预算内随机尝试其余模型×特征组合并随机提交病因，避免比较起点不公平。

`duty-hypothesis-depth.test.ts` 额外在大量 seed 上要求：部署 baseline 真实不可靠、存在 ≥12pt 的 syndrome-appropriate 单变量干预，并要求绝大多数案件中目标干预轴相对竞争轴具有清晰优势；overfit 还检查自然 `k=1 → k=5` 对照具有足够高的区分覆盖率。`balance.test.ts` 则继续要求 evidence-policy 的结案率与平均未知表现显著优于 random-clicker。它们都不能证明游戏一定“好玩”，但能同时防止“开局已经修好”“没有可区分实验”和“随便点几次也和推理一样有效”三类退化。

## 行为日志
默认仍是本地匿名记录，但 Story 检查点会把当前 `BehaviorLog` 一同保存，因此刷新后继续使用原 `sessionId / startedAt / events`；每次真正从检查点恢复会追加一条 `SESSION_RESTORED`。结案页允许玩家主动导出完整 JSON：
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

## QA Test Bench / 测试作弊码
项目不再维护 `?debug=1` 特权模式或独立 DebugPanel。`CheatTerminal` 现在外层是一个可逆的 **QA Test Bench**，内层仍把测试意图转换成正式可恢复状态：

- 普通 URL 不显示测试入口；显式 `?qa=1` 才在右下角显示 `QA BENCH / OPEN`，也可继续用 Backquote / Ctrl+Shift+K。
- 第一次执行任何会改状态的命令（除 `HELP`）时，`qa/testBench.ts` 会把当前全部 `aia.*` localStorage key（不含自身 backup）保存到 `aia.qa-backup.v1`，同时记录测试开始 URL。第二次跳转复用原快照，绝不把测试中的脏状态覆盖成“原存档”。
- 工作台提供 CASE 001 START / ERRORS / OVERFIT / REPAIR / FINAL / CLOSED、Bureau、Training、四类代表 Duty 卡片，以及“任意 Duty seed”数字输入；不要求测试者记命令。
- 测试会话中右下角持续显示 `QA TEST / SAVE SAFE`；“全新用户状态”只有在有效 backup 存在时才允许清掉当前 `aia.*` working state。
- “恢复原存档并结束测试”先删除测试产生的游戏 key，再逐字恢复原 entries，最后才删除 backup 并返回原 URL；若恢复写入失败，backup 保留以便重试。
- `CASE001 ...` 仍使用真实 reducer、模型训练、审计和实验记录构造版本化 Story checkpoint；`BUREAU UNLOCK` 仍走正式 `BureauProgress`；`TRAINING` 打开 Training 000；`DUTY <seed>` 清理该测试 seed 的 Endless session 后进入正式案件。命令执行后通过正常路由重载，不在 React 内存里注入一套作弊 state。

因此 Test Bench 解决的是**测试导航与存档隔离**，不是新增平行游戏逻辑。Story 作弊 checkpoint 仍必须通过同一个 `writeStorySession()` / `readStorySession()` validator，Duty 跳转仍运行真实 generator/audit/session。

六类自动人格路线继续存在于 `game/routes.ts`，但只作为 Vitest 的纯模拟测试，不出现在玩家 UI。

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
- Story reducer 不提供 jump/load action；快速定位由合法 checkpoint 作弊码完成。

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
- 作弊码 E2E 会从历史 `?debug=1` query 启动，确认该参数已无特权；随后输入 `CASE001 OVERFIT`，验证两条真实实验、审计余额与刷新恢复都来自正常 Story checkpoint。另一路跨 Story / Bureau / Boot / Duty 验证全局终端。
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
6. 正式状态作弊码与六种纯测试自动路线。
7. UI 响应式/动画打磨。
8. 类型检查、单测、构建、浏览器桌面/移动端验证。
9. CI、敏感信息扫描、GitHub 推送与 Actions 检查（远端工具可用时）。
