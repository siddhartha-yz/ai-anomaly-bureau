# Simulator V3 · Construction Sandbox

## 目的

V3 暂停继续生产教学关卡，先验证《AI异常调查局》是否拥有一个本身可玩的系统构造模拟器。默认入口是空白 Construction Board；V2 工作台保留在 `?v2=1`，旧剧情 / Bureau / Duty 保留在 `?legacy=1`。

当前先验证两层能力：

```text
NUMBER INPUT 0.72 ─────┐
                       ▼
                    GREATER THAN ───► BOOLEAN OUTPUT = TRUE
                       ▲
CONSTANT 0.60 ─────────┘
```

以及不提供任何成品统计节点时，玩家能否自己组合：

```text
BOOLEAN STREAM ──┐
                 ├─ STREAM EQUAL ──┬─ COUNT TRUE ───┐
BOOLEAN STREAM ──┘                 │                ├─ DIVIDE ──► NUMBER OUTPUT
                                   └─ STREAM LENGTH ┘
```

后者已经能表达通用“逐项是否相同的比例”。它不是专门的 Accuracy 节点；模拟器只提供更低层的比较、计数、长度与除法。

![Simulator V3 construction sandbox](assets/simulator-v3.png)

## 模拟器边界

模拟器核心与 React 编辑器分离：

```text
src/simulator/
  types.ts          typed signal / graph schema
  catalog.ts        primitive definitions and pure evaluation
  graph.ts          connection rules / topology
  runtime.ts        deterministic graph execution / sample clock / STEP trace
  SimulatorV3.tsx   board editor and visualization
```

React 不计算信号结果。编辑器只生成 `SimulatorGraph`；`runtime.ts` 按拓扑顺序执行节点并产生真实 signal values。

## 当前 signal type

- `number`
- `boolean`
- `boolean-stream`

当前 stream 仍是一个 typed value，但 runtime 已增加持久 sample-clock session，并进一步拆成“样本 × 节点”二维执行游标：每个 STEP 只执行当前样本中的一个拓扑节点，走完整张图后才推进到下一个样本。`STREAM EQUAL / COUNT TRUE / STREAM LENGTH` 的累计状态跨样本保存，不再为每个 tick 从第 1 个样本重算整条前缀。这样调试时可以看到信号从 source 一步一步穿过比较、计数、除法和 output，而不是按一次 STEP 整张图同时亮起。没有 stream 的标量机器同样保持逐节点 STEP。

## 当前 primitive

标量：

- `NUMBER INPUT`
- `CONSTANT`
- `GREATER THAN`
- `BOOLEAN OUTPUT`
- `NUMBER OUTPUT`
- `DIVIDE`

stream：

- `BOOLEAN STREAM`
- `STREAM EQUAL`
- `COUNT TRUE`
- `STREAM LENGTH`

没有 Accuracy、Recall、Train/Test Split、Calibration 等成品 ML 概念。只有当低层原语足够表达这些结构时，才考虑玩家自己构造、封装和复用。

## 编辑器已经支持

- 从元件库点击或拖入节点；
- 节点可在空白板移动；
- 从 output port 到 input port 自由连线；
- typed port 阻止不兼容连接；
- 删除节点会一并删除相关连线；
- 连线本身可直接点选、查看端点并删除，错误接线不再需要拆掉整个节点；
- 标量输入与 boolean stream 可直接修改；
- `PLAY` 执行整张图；
- `STEP` 在标量机器中逐节点推进；在 stream 机器中同样逐节点推进，只有当前样本的全部节点执行完才把 sample clock +1；
- stream STEP 会显示 `SAMPLE i/N · NODE j/M`，可以观察同一个样本依次经过 source、比较、累计器、算术节点与 output；
- 已求值 wire 显示真实当前值，包括当前时钟已经放行的 stream 前缀；
- Runtime 面板显示实际求值顺序；
- `RESET SIGNAL` 只清执行状态，不清机器；
- board 自动写入独立 localStorage key，刷新保留机器。

自动放置也会把同类节点错开，避免连续点击两个 stream source 后节点完全重叠；玩家仍可自由拖动布局。

## 暂时明确不做

本阶段不要为了看起来像完整游戏提前加入 LEVEL / CASE、任务评分、术语教学弹窗、固定正确拓扑、成品 ML 指标节点、Duty / Bureau 迁移、玩家组件封装。

下一步优先继续补模拟器本身，而不是内容：更一般的 sample primitive、真正的 PLAY/PAUSE 逐 tick 动画，以及玩家自定义 component 的最低可行封装。只有当 Sandbox 自身已经值得摆弄，再讨论关卡系统。

## 验收原则

V3 的评判标准不是教学目标覆盖率，而是：空白板是否让人自然想放元件、拉线；机器运行时信号是否清楚可追踪；错误是否能靠 STEP / wire value 自己定位；同一行为是否允许不同拓扑实现；模拟器是否在没有任何关卡文案时仍值得摆弄。
