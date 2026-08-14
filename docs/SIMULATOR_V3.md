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

这已经能表达通用“逐项是否相同的比例”。本轮又补上更底层的 `STREAM AND`，因此玩家还可以自己构造条件比例：

```text
PREDICTED POSITIVE ──┐
                     ├─ STREAM AND ── COUNT TRUE ─┐
TRUE POSITIVE LABEL ─┘                            ├─ DIVIDE ──► NUMBER OUTPUT
TRUE POSITIVE LABEL ─────── COUNT TRUE ───────────┘
```

这张图行为上等价于“找回了多少真实正类”的比例，但模拟器仍然没有 Accuracy / Recall 成品节点；它只提供布尔组合、计数与除法。

![Simulator V3 construction sandbox](assets/simulator-v3.png)

## 模拟器边界

模拟器核心与 React 编辑器分离：

```text
src/simulator/
  types.ts          typed signal / graph schema
  catalog.ts        primitive definitions and pure evaluation
  graph.ts          connection rules / topology
  runtime.ts        deterministic graph execution / sample clock / STEP trace
  harness.ts        reusable I/O test cases / regression runner
  viewport.ts       pan / zoom camera math, independent from graph state
  SimulatorV3.tsx   board editor and visualization
```

React 不计算信号结果。编辑器只生成 `SimulatorGraph`；`runtime.ts` 按拓扑顺序执行节点并产生真实 signal values。

## 当前 signal type

- `number`
- `boolean`
- `number-stream`
- `boolean-stream`

当前 stream 仍是一个 typed value。`NUMBER STREAM → STREAM >` 已能把连续分数逐样本转成布尔决策流，并与 COUNT / AND / DIVIDE 等通用原语继续组合；runtime 已增加持久 sample-clock session，并进一步拆成“样本 × 节点”二维执行游标：每个 STEP 只执行当前样本中的一个拓扑节点，走完整张图后才推进到下一个样本。`STREAM EQUAL / STREAM AND / COUNT TRUE / STREAM LENGTH` 的累计状态跨样本保存，不再为每个 tick 从第 1 个样本重算整条前缀。这样调试时可以看到信号从 source 一步一步穿过比较、计数、除法和 output，而不是按一次 STEP 整张图同时亮起。没有 stream 的标量机器同样保持逐节点 STEP。

`PLAY` 现在也不再瞬间跳到最终结果：它复用同一个 scheduler，按当前速度逐节点自动推进；运行中按钮切换为 `PAUSE`，暂停后保留当前 wire value、sample clock 与 accumulator 状态，可以检查线路、手动 STEP，再从原位置继续 PLAY。速度只改变调度间隔，不改变 runtime 结果。节点标题栏还能设置断点：PLAY 会在目标节点执行前冻结，玩家可先查看上游 wire，再用 STEP 单独执行该节点；stream 机器会在每个样本再次经过该节点时继续命中断点。

## 当前 primitive

标量：

- `NUMBER INPUT`
- `CONSTANT`
- `GREATER THAN`
- `BOOLEAN OUTPUT`
- `NUMBER OUTPUT`
- `DIVIDE`

stream：

- `NUMBER STREAM`
- `BOOLEAN STREAM`
- `STREAM >`（number stream + scalar threshold → boolean stream）
- `STREAM EQUAL`
- `STREAM AND`
- `COUNT TRUE`
- `STREAM LENGTH`

没有 Accuracy、Recall、Train/Test Split、Calibration 等成品 ML 概念。只有当低层原语足够表达这些结构时，才考虑玩家自己构造、封装和复用。

## 编辑器已经支持

- 从元件库点击或拖入节点；
- 构造世界从原来的单屏固定板扩成 `2200×1400` 大画布；滚轮围绕指针缩放，`Space + 左键` 或中键平移，`FIT / VIEW RESET` 管理视角。camera state 与 `SimulatorGraph` 分离，浏览机器不会污染 Undo/Redo 或持久化电路；
- 节点可在空白板移动；
- 从 output port 按住并拖出实时可见 cable，松到 input port 完成自由连线；点击端口仍保留为键盘/无拖拽环境的备用路径；
- typed port 阻止不兼容连接；
- 删除节点会一并删除相关连线；
- 连线本身可直接点选、查看端点并删除，错误接线不再需要拆掉整个节点；
- 标量输入与 boolean stream 可直接修改；
- `PLAY` 沿真实 scheduler 自动逐节点执行，不直接揭示最终状态；
- `PAUSE` 可冻结当前执行现场，再检查 wire value / trace 或改用 STEP；恢复 PLAY 从冻结位置继续；
- 任意节点可设 `BREAKPOINT`；自动 PLAY 在执行该节点前暂停，不提前产生该节点输出，适合定位复杂线路中的第一处行为分歧；
- `SPEED` 提供从 0.5× 到 FAST 的调试速度，只改变播放节奏；
- `STEP` 在标量机器中逐节点推进；在 stream 机器中同样逐节点推进，只有当前样本的全部节点执行完才把 sample clock +1；
- stream STEP 会显示 `SAMPLE i/N · NODE j/M`，可以观察同一个样本依次经过 source、比较、累计器、算术节点与 output；
- 已求值 wire 显示真实当前值，包括当前时钟已经放行的 stream 前缀；
- 任意连线可固定为 `SIGNAL PROBE`：探针在 STEP / PLAY 期间持续显示当前标量或 stream 的最新样本，同时保留已经放行的完整前缀；探针附着在线路而不是节点上，删线后会自动失效，便于盯住中间信号而不反复点选；
- 已固定的 `SIGNAL PROBE` 现在还能设置条件暂停：boolean 信号可在 TRUE / FALSE 出现时中断，number 信号可在最新值达到 `≥ / ≤` 阈值时中断。条件命中发生在被监视源真正产出该值之后、下游节点消费之前，因此 PLAY 可以直接跑到“有意思的样本”再交给 STEP 继续定位，而不需要人工盯完整条 stream；
- Runtime 面板显示实际求值顺序；
- `RUN TRACE` 不再只显示当前 sample 的瞬时列表，而是保留整次运行的逐节点时间线；玩家可以点击任意历史 STEP，把画布、线路值与节点高亮恢复到那个执行瞬间。历史查看只切换观察快照，不回滚 graph，也不移动真实 runtime cursor；点击“返回实时”即可继续看当前执行现场。长运行最多保留最近 500 个 micro-step，避免调试历史无限增长；
- `TEST HARNESS` 可以把当前机器的 source 输入与 OUTPUT 行为冻结成多个测试样例，之后任意改线、调参数或重构 Component，再一键重放整套行为；失败项直接显示 actual / expected，并可把旧输入重新载入当前画布。测试数据与 graph 分开持久化，不会因为改机器而偷偷更新 expected output。这是未来关卡 `I/O + tests` 的底层执行接口，但当前仍只是自由沙盒里的玩家自建回归台；
- source / OUTPUT 现在可以显式命名为稳定的 **I/O terminal contract**。TEST HARNESS 优先按 terminal 名绑定输入输出，而不是按内部 node id：玩家把整台机器删掉重搭、换成另一种拓扑甚至重新生成 node id，只要对外 `score → decision` 之类的 typed I/O 契约不变，旧测试仍然可直接验收。若可运行电路里出现重复 terminal 名则拒绝捕获，避免测试静默绑错端口；
- `RESET SIGNAL` 只清执行状态，不清机器；
- board 自动写入独立 localStorage key，刷新保留机器；
- 节点可多选并保存为 `Blueprint`；Blueprint 只封存选区内部节点与内部连线，跨选区的输入/输出边界保持开放；
- Blueprint 可从 `MY BLUEPRINTS` 再次放入画布，实例拥有全新 node/wire id，不与原机器共享运行状态，并会优先寻找不遮挡已有节点的空位；
- Blueprint 库使用独立 localStorage key 持久化，刷新后仍可复用；
- 选中的 primitive 子图现在还能保存为 `Component`：系统从未被内部连线占用的输入端口、以及对外暴露的输出端口自动推导动态 typed boundary；
- `MY COMPONENTS` 中再次放置时，内部 primitive 会展开到真实 graph/runtime 中执行，但编辑器只显示一个玩家命名的单一黑盒节点；外部连线直接接到它的动态边界端口，内部节点与内部 wire 不在画布上泄露；组件库现在还能单独编辑黑盒名称与每个 typed port 的对外标签，例如把内部 `a/result` 改成 `score/flag`，已有实例与连线不受影响；
- Component 实例可整体拖动、整体删除、整体选中，definition 与 board 分别持久化；同一个自制组件可以反复实例化，而每个实例拥有独立内部 node/wire id；
- 已有自制 Component 现在还能和新的 primitive 一起再次封装成更高一级 Component。保存时会验证必须选中完整黑盒边界，再把内部 primitive 展平进新的 definition，因此玩家可以形成真正的 `build → encapsulate → reuse → encapsulate again` 层级构造链，而不会从 UI 偷穿已有黑盒内部。
- 黑盒实例现在拥有明确的层级调试作用域：`OPEN` 进入该实例内部，primitive / internal wire 恢复为可编辑对象，外部输入输出仍保持接通；顶部 `INSIDE COMPONENT` 明确提示当前层级，完成后 `CLOSE BLACK BOX` 会把原始内部节点重新收回**同一个实例**，保留刚才的参数/线路修改与外部接线。若原内部节点被删掉，关闭会明确失败并提示先 Undo，而不是生成半坏黑盒。组件 definition 仍不会被实例级编辑静默改写；如果玩家希望把当前实例的修改变成新的可复用设计，可以在作用域内显式 `SAVE AS NEW COMPONENT`。新 definition 继承原组件的 typed boundary 与自定义端口标签，但拥有独立 id 和内部实现，因此原组件与其他实例不会被追溯修改。

自动放置也会把同类节点错开，避免连续点击两个 stream source 后节点完全重叠；玩家仍可自由拖动布局。

## 暂时明确不做

本阶段不要为了看起来像完整游戏提前加入 LEVEL / CASE、任务评分、术语教学弹窗、固定正确拓扑、成品 ML 指标节点、Duty / Bureau 迁移。当前 Component 已支持逐层再封装、实例级 `OPEN → 调试 → CLOSE`，并且能把修改后的实例显式 **fork 成新的 definition**；**把实例修改原地升级为新版 definition、保留 definition 内部显式层级而不是保存时展平、组件版本迁移**仍未实现，这些边界继续留在模拟器层解决，不借关卡脚本绕过去。

下一步仍优先补模拟器本身，而不是内容。现在“实例修改 → 分叉新 definition”的安全语义已经成立；如果继续推进组件系统，应先设计清楚“UPDATE DEFINITION 时哪些既有实例跟随、哪些保持旧版本”的版本语义，再实现原地升级。wire probe 已从静态观察升级到条件暂停，整次运行也已有可回看的 RUN TRACE；后续若继续增强调试，应优先考虑 probe-to-probe 比较或真正的层级内外 trace，而不是堆更多静态仪表。只有当 Sandbox 自身已经值得摆弄，再讨论关卡系统。

## 验收原则

V3 的评判标准不是教学目标覆盖率，而是：空白板是否让人自然想放元件、拉线；机器运行时信号是否清楚可追踪；错误是否能靠 STEP / wire value 自己定位；同一行为是否允许不同拓扑实现；模拟器是否在没有任何关卡文案时仍值得摆弄。
