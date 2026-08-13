# AI异常调查局 V2 · Vertical Slice

## 当前方向

V1 已冻结为 Legacy。V2 不再把“案件文本 → 选项 → 正误反馈”作为核心玩法。

当前默认入口是一台可操作的 **AI SYSTEM LAB**：玩家修改系统、安装观察工具、运行测试，再从系统行为里发现问题。剧情、术语和调查局 meta 都必须退到这个操作循环之外。

核心循环只有一句：

`BUILD → RUN → BREAK → FIX`

玩家不提交“答案”。玩家提交的是一个能够通过测试的系统配置。

## 为什么重置

旧 authored runtime 的核心数据结构是 `stage → options → correctIds → feedback`。即使题目使用真实计算，只要主要输入仍是“从几个解释里点一个”，最终体验就会收敛成文字冒险 / 选择题。

V2 的核心状态改成：

`可用原语 + 已安装原语 + 工作台参数 + 运行记录 + 可验证约束`

系统是否通过由纯计算决定，不存在 `correctIds`。

## 三关 vertical slice

### LEVEL 01 · 训练集不是世界

初始系统只有：

`DATA → FEATURE BUS → SIMPLE MODEL → FIELD GATE`

玩家一开始只能看到 TRAIN。第一次出货后，未知 FIELD GATE 暴露失败，并释放新的工作台原语：

`TEST PROBE`

玩家把 TEST PROBE 安装进工作台，然后切换输入信号，直到训练和未知批次都过线。

- 初始“亮度 + 圆度”：TRAIN 100%，UNKNOWN 61%。
- 稳定“纹理 + 比例”：TRAIN 92%，UNKNOWN 88%。
- 通关条件：TEST PROBE 已安装，TRAIN / UNKNOWN 均 ≥80%。
- 术语只在通关后出现：**独立测试集 / 泛化**。

### LEVEL 02 · 平均数会藏人

继承 LEVEL 01 的 TEST PROBE。

54 个病例里只有 4 个优先病例。默认阈值 0.80 时总体 Accuracy 约 93%，但界面仍有事故标记。第一次运行后释放：

`CLASS PROBE`

安装后才量化显示 Priority Recall。玩家直接拖动连续阈值，而不是从几个阈值答案中选一个。

通关约束：

- Accuracy ≥80%；
- Priority Recall ≥75%；
- CLASS PROBE 必须已安装。

合法解不唯一，例如 0.60 与 0.55 都可通过；0.80 会漏掉少数类，0.35 会因误报过多让总体 Accuracy 失败。

通关后才命名：**分类别召回 / 阈值取舍**。

### LEVEL 03 · 只在白天正确

继承：

- TEST PROBE；
- CLASS PROBE；
- FEATURE BUS。

默认亮度信号在 DAY 表现完美，但隐藏 NIGHT gate 崩溃。第一次运行后释放：

`ENV SWITCH`

安装后玩家才能主动在 DAY / NIGHT 之间切换。模型本身固定，玩家只替换观察信号并重新运行。

通关不是“找到一个夜班高分”：同一个 feature 必须分别在 DAY 与 NIGHT 都留下通过记录，否则两个不同配置的好结果不能拼成一个结论。

- brightness：DAY 通过，NIGHT 失败；
- texture：跨环境通过；
- shape：跨环境通过。

因此仍然存在多个真实可行解。

通关后才命名：**分布变化 / 稳定特征**。

## 工作台交互原则

1. **中间工作台是主画面。** 任务文本只说明约束，不承担主要游戏时长。
2. **新知识必须先表现为工具。** 玩家先获得 TEST PROBE / CLASS PROBE / ENV SWITCH，再在操作之后看到术语。
3. **工具真的继承。** 后一关继续显示并使用前一关已经安装的探针，不只是文字说“复用”。
4. **失败来自运行结果。** 不弹“回答错误”；工作台只显示哪个测试没过。
5. **连续参数优先于选项题。** 阈值使用 slider，合法区间由数据决定。
6. **允许多个系统解。** 只要满足真实约束就应该通过。
7. **控制变量进入状态机。** LEVEL 03 要求同一 feature 在两个环境都通过，不能把不同配置的两次绿灯拼在一起。
8. **未安装工具时不泄漏其读数。** 没有 TEST PROBE 看不到 UNKNOWN 实时仪表；没有 CLASS PROBE 不显示少数类 Recall；没有 ENV SWITCH 不提前显示 DAY/NIGHT 对照表。

## 路由与 Legacy 边界

- 默认根路径：V2 workbench。
- `?v2=1`：显式进入 V2。
- `?legacy=1`：进入冻结的 V1。
- 现有 `?seed=...`、`?mode=...`、`?debug=...` 测试/旧链接仍进入 Legacy，保证历史回归可继续运行。

V2 使用独立本地状态：

`aia.lab-v2.v1`

它不会修改 V1 Bureau / Story / Duty 存档。

## 技术边界

V2 当前分为三层：

- `src/lab/v2Engine.ts`：数据与纯计算；
- `src/lab/v2Session.ts`：工具解锁、安装、关卡推进与通关约束；
- `src/lab/LabV2.tsx`：工作台交互与呈现。

这三个层次不得重新引入 authored runtime 的 `options / correctIds` 模型。

## 下一步决策门

当前只证明前三个原语能否形成真正可玩的系统操作循环。**在这三关通过真人体验前，不迁移 CASE 004 / CASE 005，也不继续做 CASE 006。**

下一轮真人测试重点不是“概念有没有讲清楚”，而是：

- 玩家第一眼是否把中央工作台识别为主要玩法；
- 第一次失败后是否自然注意到刚解锁的工具；
- 玩家是否愿意主动改参数再 RUN，而不是寻找“下一段剧情”；
- LEVEL 02 slider 是否让人产生实验感，而不是猜值；
- LEVEL 03 是否真的让玩家意识到“同一个配置要跨环境验证”；
- 三关结束后，玩家是否记得自己获得的是三个可复用工具，而不是三段知识文本。

如果这套 vertical slice 本身不好玩，继续推翻 V2，而不是用更多剧情和内容掩盖核心循环问题。
