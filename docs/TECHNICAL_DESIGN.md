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
  game/
    types.ts                 # GameState / Action / Stage
    reducer.ts               # 状态机
    hints.ts                 # 小析分级提示
    logging.ts               # 匿名行为日志
    routes.ts                # debug 自动路线
  components/
    ScatterPlot.tsx
    TaskBanner.tsx
    FeaturePicker.tsx
    ModelPicker.tsx
    Metrics.tsx
    ErrorSamples.tsx
    AssistantPanel.tsx
    DebugPanel.tsx
  App.tsx
  main.tsx
  styles/app.css
tests/
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

测试数据由 `createDataset(seed)` 一次生成，但普通游戏状态仅保存训练样本与一个不含标签的测试视图。真实测试标签留在评估服务闭包/模块中；仅执行审计或 debug 模式时返回允许的信息。

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

主要状态：seed、stage、selectedFeatures、selectedModel、knnK、fitResult、trainMetrics、testMetrics、viewedMistakes、attempts、failureStreak、hintLevel、history、startedAt、completedAt。

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

## 行为日志
内存记录后可导出 JSON：
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
不写 localStorage 的个人标识；sessionId 为本地随机短 ID。

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
- 首次测试失败后需查看错误样本。
- 连续失败触发 1→2→3 级提示。
- reset/jump 仅 debug 模式生效。

### 自动路线测试
六种人格全部执行到预期终点或明确诊断，不出现无限循环与无可用操作状态。

### 浏览器验证
- 桌面 1440×1000：首屏任务明确，图为视觉中心。
- 手机约 390×844：可完成选择、训练、审计与通关。
- `?debug=1` 面板可操作且普通模式不出现。
- 浏览器 console/page errors 为零。

## CI
Node.js 24（与本地正式工具链一致）：
1. `npm ci`
2. `npm run check`
3. `npm test -- --run`
4. `npm run build`

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
