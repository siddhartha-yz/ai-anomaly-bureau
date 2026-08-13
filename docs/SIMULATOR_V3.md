# Simulator V3 · Construction Sandbox

## 目的

V3 暂停继续生产教学关卡，先验证《AI异常调查局》是否拥有一个本身可玩的系统构造模拟器。默认入口现在是空白 Construction Board；V2 工作台保留在 `?v2=1`，旧剧情 / Bureau / Duty 保留在 `?legacy=1`。

当前里程碑只有一个：玩家能否不用任何正确答案按钮，自己搭出一台阈值机器。

```text
NUMBER INPUT 0.72 ─────┐
                       ▼
                    GREATER THAN ───► BOOLEAN OUTPUT = TRUE
                       ▲
CONSTANT 0.60 ─────────┘
```

![Simulator V3 construction sandbox](assets/simulator-v3.png)

## 模拟器边界

模拟器核心与 React 编辑器分离：

```text
src/simulator/
  types.ts          typed signal / graph schema
  catalog.ts        primitive definitions and pure evaluation
  graph.ts          connection rules / topology
  runtime.ts        deterministic graph execution / STEP trace
  SimulatorV3.tsx   board editor and visualization
```

React 不计算 `0.72 > 0.60`。编辑器只生成 `SimulatorGraph`；`runtime.ts` 按拓扑顺序执行节点并产生真实 signal values。

## 当前 primitive

第一版刻意只有四个：

- `NUMBER INPUT`：产生 number signal。
- `CONSTANT`：产生固定 number signal。
- `GREATER THAN`：两个 number 输入，一个 boolean 输出。
- `BOOLEAN OUTPUT`：接收并暴露 boolean signal。

没有 Accuracy、Recall、Train/Test Split、Calibration 等成品 ML 概念。以后只有当低层原语足够表达它们时，才允许玩家自行构造或封装这些结构。

## 编辑器已经支持

- 从元件库点击或拖入节点；
- 节点可在空白板移动；
- 从 output port 到 input port 自由连线；
- typed port 阻止不兼容连接；
- 删除节点会一并删除相关连线；
- 输入与常量值可直接修改；
- `PLAY` 执行整张图；
- `STEP` 逐节点推进；
- 已求值 wire 显示真实当前值；
- Runtime 面板显示实际求值顺序；
- `RESET SIGNAL` 只清执行状态，不清机器；
- board 自动写入独立 localStorage key，刷新保留机器。

## 暂时明确不做

本阶段不要为了看起来像完整游戏提前加入 LEVEL / CASE、任务评分、术语教学弹窗、固定正确拓扑、Accuracy / Recall 成品节点、Duty / Bureau 迁移、玩家组件封装。

下一步优先扩模拟器本身：stream/sample 类型、FILTER / COUNT / DIVIDE 等低层原语、真正的数据逐样本 STEP。只有当玩家可以在自由沙盒里自行搭出 Accuracy / Recall 一类结构后，再讨论关卡系统。

## 验收原则

V3 的评判标准不是教学目标有没有覆盖，而是：空白板是否让人自然想放元件、拉线；机器运行时信号是否清楚可追踪；错误是否能靠 STEP / wire value 自己定位；同一行为是否允许不同拓扑实现；模拟器是否在没有任何关卡文案时仍值得摆弄。
