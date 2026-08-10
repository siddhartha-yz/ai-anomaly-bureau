# AI异常调查局 · Game Architecture v1

这份文档定义的是**游戏骨架**，不是某一关的 UI 规格。后续新增剧情案件、训练内容或程序化故障时，优先保持这里的循环与职责边界，而不是继续把功能直接堆进 `App.tsx` 或某一个模式入口。

## 1. 玩家身份

玩家不是“机器学习 Demo 的使用者”，而是 **AI异常调查局的调查员**。

第一次进入游戏时身份为：

- `TRAINEE / 实习调查员`
- 只接到 `CASE 001 · 失控的分类器`
- 不先看到一个空办公室，也不提前开放值班系统

完成 CASE 001 后：

- 案件归档；
- 出现一次性 `CLEARANCE GRANTED` 入职交接；
- 获得 `FIELD / 正式调查员` 身份；
- 解锁调查局 Hub：案件板、训练中心、调查档案、值班室。

后续不是靠经验值、金币或重复刷关升级。当前 V1 只有一个轻量身份变化：在至少三类不同程序化故障中完成过独立结案后显示 `INDEPENDENT / 独立调查员`。它表达经验范围，不改变模型数值。

## 2. 四层循环

### 2.1 瞬时操作循环

`观察 → 假设 → 预测 → 实验 → 审计 → 证据`

按钮与指标必须服务于这个循环。单纯“换参数让 Accuracy 更高”不是目标。

### 2.2 单案件循环

`收到异常 → 观察现场 → 形成假设 → 设计对照 → 正式审计 → 调查错误 → 提交诊断 → 验证修复 → 结案`

Story Case 与 Duty Case 可以有不同叙事密度，但都应该遵守这条调查语法。

### 2.3 调查局长期循环

`接案 → 结案 → 案卷/知识进入档案 → 返回调查局 → 选择下一份工作`

这是当前版本新建立的 meta loop。玩家不应该在结案后停在一个孤立的结果页，也不应该从一个模式直接掉进另一个模式。

### 2.4 内容循环

新的内容不是“下一章教一个名词”，而是用新的异常迫使玩家重新使用已经掌握的方法：

`场景 × 数据问题 × 模型行为 × 可观察证据 × 审计限制 × 隐藏病因`

例如：

- 校园门禁 × 光照变化 × 历史高分 × 批次元数据 × 4 次审计 → 分布变化；
- 医疗筛查 × 类别稀少 × 总体 94% × 分类别召回 × 有限错误样本 → 类别不平衡；
- 质检系统 × 少量坏记录 × k=1 记忆 × 档案质量告警 × 5 次审计 → 训练噪声 / 过拟合。

## 3. 调查局 Hub 的职责

Hub 是**世界与长期状态**，不是另一个实验驾驶舱。

### 案件板 / CASE BOARD

负责手工设计的正式剧情案件。

当前 V1：

- `CASE 001 · 失控的分类器`
- 后续位置显示 `CASE ??? / SEALED`

禁止为了让案件板“显得丰富”而把程序化值班案件伪装成第二、第三剧情关。

未来 `CASE 002` 应该以新的正式案件卡加入这里，并拥有自己的剧情状态机 / checkpoint，而不是扩写 CASE 001。

### 训练中心 / TRAINING

负责**教方法**。

当前：

- `TRAINING 000 · 对照实验`

训练中心可以明确解释：控制变量、如何读 TRAIN/FIELD、什么是召回、草稿与正式提交的区别。

这些解释进入正式 Duty Case 后必须撤掉。

### 调查档案 / ARCHIVE

负责**已亲手发现的知识**。

不是技能树，不显示“花点数解锁”。条目只有在玩家真实遇到后才点亮：

- 训练集 / 未知样本
- 泛化
- 过拟合
- 控制变量实验
- 分类别召回
- 观察信息不足
- 分布变化
- 类别不平衡

未知条目显示为 `????????`，避免档案提前剧透未来病因。

### 值班室 / DUTY DESK

负责程序化监督学习案件。

没有未结案件时：

- 显示 3 份 symptom-only `INCOMING REPORTS`；
- Hub 只通过 `bureau/duty.ts` 的安全 preview adapter 取得 `seed / caseNo / title / incident / reportedFacts`，不直接 import 完整 Duty generator；
- 玩家主动选择一份接案；
- 已经归档的 seed 不会重新当成新工单发回队列。

存在未结案件时：

- 优先显示 `OPEN CASE`；
- 不提供会静默覆盖旧进度的新报告入口；
- 想放弃旧案必须进入案件自己的明确二次确认流程。

程序化案件结案后：

- 返回 Hub；
- 值班结案计数增加；
- 该病症进入调查档案；
- 同 seed 重玩不会制造额外“经验”；
- 不同 seed 但同一种病症也不会快速刷出独立调查员身份。

## 4. 正式案件目录与 Story Case 001

所有手工正式案件必须先注册到 `src/bureau/catalog.ts`，并在 `src/story/registry.tsx` 提供对应 runtime。编号、标题、事故摘要、调查目标、分类标签与玩家展示 tags 由 catalog 统一提供；runtime 负责组件、checkpoint 摘要、清档与“已结案 checkpoint → Bureau 长期事实”的 reconciliation。Hub 直接遍历 `FORMAL_CASE_CATALOG`，不会为 CASE 001 手写一套特殊案件卡。V1 的 `FORMAL_CASE_CATALOG` **严格只有 CASE 001**，训练案件保存在独立 `TRAINING_CASE_CATALOG`，因此不会因为 UI 需要占位就伪造一个“CASE 002”。

CASE 001 的定位

CASE 001 是**新人入职案件**，不是整个产品永久首页。

它负责让零基础玩家第一次经历：

1. 看见一个具体事故：CAT ≠ BREAD；
2. 观察旧数据；
3. 训练第一个真实模型；
4. 犯一次“旧分数已经够好”的错误；
5. 在未知样本中看到后果；
6. 调查误判；
7. 亲手经历 k=1 的训练 100% / 未知下降；
8. 重新设计特征与模型；
9. 验证泛化；
10. 完成迁移问题并结案。

结案后不是“重新玩 / 退出”二选一，而是：

`CASE CLOSED → CLEARANCE GRANTED → Bureau Hub`

之后 CASE 001 成为案件板中的一份可重开案卷。

Hub 的部门选择属于办公室层状态，而不是某个案件的状态。从训练中心进入 Boot 后退出会回到训练中心；从值班室进入 Duty 后退出会回到值班室；从案件板打开 Story 再返回则回到案件板。这样 Hub 是持续存在的工作空间，而不是每次返回都重置到第一页的总菜单。

顶部 `SHIFT PRIORITY` 由 `bureau/dispatch.ts` 纯函数生成，只负责“现在最值得去哪个部门”：未结 Duty 优先恢复；未完成 Training 000 时把它作为**可选推荐**；之后只显示已覆盖故障类型数量，四类齐全后指向档案。它禁止读取 syndrome 答案或案件内部实验，因此不会变成跨模式的小析答案提示器。

## 5. Boot Case 000 的定位

Boot Case 不再是“无尽模式前的弹窗教程”，而属于**训练中心**。它的 runtime 位于 `src/training/TrainingCase000Runtime.tsx`，并通过 `src/training/registry.tsx` 注册；虽然训练内容复用 Duty generator 的真实数据与审计逻辑，但不再由 `src/endless/` 目录拥有。

它专门教：

- 一条实验不足以形成解释；
- 一次只改变一个因素；
- 怎样从 EXPERIMENTS.LOG 读出真正发生的变化；
- 训练分高与未知数据稳定不是一回事；
- 总体 Accuracy 可能掩盖某一类失败；
- 选择诊断只是草稿，提交才形成正式报告。

Boot Case 完成后只记录 `CLEARED`，不增加经验值。

## 6. Duty Case 的定位

Duty Case 是**独立应用方法**，不是教学章节。

正式模式只允许三类帮助：

1. 下一步动作导航，例如“还缺一条对照实验”；
2. 仪表字面定义，例如“召回 = 该类真实样本被找出的比例”；
3. 世界中的原始事实，例如采集质量告警、历史/现场批次、类别构成。

禁止动态输出：

- “这看起来像过拟合”；
- “建议换某两个字段”；
- “现在应该选择类别不平衡”。

答案必须来自玩家自己的实验与证据包。

## 7. Meta progression 数据边界

`aia.bureau-progress.v2` 只保存长期事实，并按 catalog id 保存手工内容状态：

- `formalCases[caseId]`：正式案件是否结案、最佳评级 / 分数与首次结案时间；
- `trainingCases[caseId]`：训练案件是否完成与完成时间；
- 是否已经确认正式入职；
- 已经结案的 Duty seed / syndrome / grade / score。

旧 `aia.bureau-progress.v1` 的 `story001 / bootCase000` 会在读取时校验并一次性迁移到 v2；迁移成功后才删除旧 key。Training 000 的旧 `aia.boot-case-000.v2` 也只作为历史完成事实的迁移输入，不再作为新局的第二份长期进度写入。

它**不复制**：

- Story reducer 状态；
- Endless 实验历史；
- 隐藏测试标签；
- fitted model；
- 完整匿名行为日志。

这些仍由各自 session/checkpoint 管理。

原则：Hub 只知道“这宗案子是什么状态”，不接管“这宗案子内部进行到哪一步”。Formal Case 与 Duty 还拥有独立 seed 状态；接取 / 切换 Duty 不会改变正式剧情 checkpoint 的查找、清档或重开身份。

## 8. 导航约束

正常产品入口：

```text
第一次打开
  ↓
CASE 001 标题 / Cold Open
  ↓
CASE 001
  ↓
CASE CLOSED
  ↓
CLEARANCE GRANTED
  ↓
BUREAU HUB
  ├─ 案件板 → Story
  ├─ 训练中心 → Boot
  ├─ 调查档案
  └─ 值班室 → Duty queue → Endless
```

开发 / 复现 query 可以直接打开特定正式模式：

- `?mode=endless&seed=...`
- `?mode=boot`
- `?mode=hub`

但 query 直达不应该凭空给予玩家正常 meta progression。Story 的快速阶段测试改由全局作弊码终端完成；作弊码构造合法正式 checkpoint，而不是另起一套特权状态机。

## 9. V1 明确不做的 meta 系统

为了避免项目变成廉价 RPG，当前不做：

- XP 数值；
- 金币；
- 每日签到；
- 连胜；
- 装备强化；
- 模型属性加成；
- 排行榜；
- 重复刷同一案件获得永久收益。

长期动力来自：

- 未见过的异常；
- 新证据结构；
- 更复杂的调查限制；
- 档案逐渐完整；
- 自己能否用更少、更干净的实验形成解释。

## 10. 新内容接入检查表

新增正式剧情案时：

- [ ] 出现在案件板，而不是值班室；
- [ ] 有明确事故与角色动机；
- [ ] 至少一次真实 ML 认知反转；
- [ ] 有自己的 checkpoint；
- [ ] 结案回到 Hub；
- [ ] 点亮至少一个新的档案条目；
- [ ] 不要求靠重复刷旧案解锁。

新增程序化 syndrome 时：

- [ ] generator 中存在真实数据机制；
- [ ] 病因能从可观察事实 + 实验中区分；
- [ ] incident 不直接说答案；
- [ ] evidence-policy 不读隐藏 diagnosis/test labels；
- [ ] random-clicker 仍明显弱于证据策略；
- [ ] 结案后进入 Duty archive / Archive；
- [ ] 队列预览只使用 symptom-only 信息。

新增训练内容时：

- [ ] 放进训练中心；
- [ ] 可以明确解释方法；
- [ ] 正式 Duty 不依赖该教程的动态提示才能可玩；
- [ ] 完成状态是知识记录，不是数值强化。

---

架构边界还由 ESLint 做最低限度强制：App 不能直接重新依赖 authored case runtime / Story session / Duty session，BureauHub 不能直接读取 Story / Duty session 或完整 procedural generator。App 的 Duty resume / clear 同样只能通过 `bureau/duty.ts`；启动阶段的旧进度归并则集中在 `app/bootstrap.ts`，App 不再认识历史 Boot storage key。这样“Hub / App 只看摘要、案件拥有内部状态”不是只写在文档里的约定。

一句话约束：

> **调查局负责“为什么还有下一局”，案件负责“这一局为什么值得调查”。**
