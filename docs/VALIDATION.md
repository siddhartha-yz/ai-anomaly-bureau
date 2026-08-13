# V1 发布验证记录

验证日期：2026-08-12

## 发布级验证命令

正式工具链：Node.js 24 LTS（本地使用 v24.19.0）。

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

当前结果：

- ESLint：通过，0 warning / 0 error。
- TypeScript strict typecheck：通过。
- Vitest：25 个测试文件、154 个测试全部通过。
- Vite production build：通过；当前冻结 runtime 构建为 `assets/index-RuQWNlKh.js` + `assets/index-B__UcwdL.css`（生产发布后再记录远端哈希）。
- Playwright：33 条 Chromium E2E 全部通过（完整串行套件 33/33 通过），覆盖新人 CASE 001 → 正式入职 → CASE 002 → CASE 003 → CASE 004 → CASE 005 → Bureau Hub、五类 Formal Case checkpoint / 恢复、CASE 002 多解阈值约束、CASE 003 跨环境稳定特征、CASE 004 身份台账 / 分组切分 / 干净验证、合法作弊 checkpoint、可逆 QA Test Bench、`?qa=1` 对 CASE 002/003/004/005 的免重放入口、Boot Case 000、Duty cause-source sealing、syndrome-level competing causes、support + falsification 诊断 gate、生成器 falsification-route 可解性、H-FIELDS / H-MODEL 区分实验、因果预注册、显式证据引用、现场误判、session 刷新恢复、错误诊断锁、1280×720、分布变化、额度恢复与类别不平衡。架构 import 护栏另由 ESLint 在 CI 中执行。
- GitHub Actions CI：通过；GitHub runner 已真实执行 lint、typecheck、unit tests、build、Chromium E2E。

## 固定 seed 教学指标

默认 seed：`20260809`。

| 特征 | 模型 | 训练表现 | 未知测试表现 |
|---|---|---:|---:|
| 暖度 + 圆度 | 直线分类器 | 88.9%（4 错） | 66.7%（8 错） |
| 纹理 + 长宽比 | 直线分类器 | 88.9%（4 错） | 100%（0 错） |
| 纹理 + 长宽比 | 浅层决策树 | 88.9%（4 错） | 100%（0 错） |
| 纹理 + 长宽比 | KNN k=1 | 100%（0 错） | 79.2%（5 错） |
| 纹理 + 长宽比 | KNN k=5 | 88.9%（4 错） | 100%（0 错） |

这些指标由浏览器模型实时计算，不是 UI 写死结果。固定 seed 同时满足：

- 初始方案先建立“第一次成功”。
- 同一方案在未知样本上明显下降。
- k=1 真实出现训练 100% / 未知表现下降的过拟合陷阱。
- 直线、浅树、k=5 至少三种稳健路线可通过最终审计。

## 单元 / 状态机验证

Vitest 当前覆盖：

- 固定 seed 数据可复现。
- train / test split 严格分离。
- 普通模式不暴露隐藏测试标签；public test 同时移除 flags，并使用 `field-001...` 中性 ID，避免从 DOM / DevTools 语义 ID 猜类别。
- 线性分类器、深度 2 决策树、KNN k=1 / k=5 的真实计算。
- 决策边界网格确定性。
- 初始训练捷径在未知样本上真实失败。
- k=1 过拟合陷阱真实存在。
- 两个不同错误样本的证据守卫。
- 三级提示上限。
- Story reducer 不存在 jump/load 特权动作；作弊码必须生成可被正式 session validator 接受的完整 checkpoint。
- 六类开发者测试人格均在有限步骤内完成关卡，并经历过拟合与多次未知审计。
- 教学任务、NPC 提示、模型 / 特征说明保持短文本约束。
- 调查评级：错误上线、推理修正、预测偏差、额外审计和提示会降低评级；S 只保留给干净证据路线。Duty 的评分由 `dutyInvestigationScore()` 集中计算：单变量实验设计奖励最多只计算前 2 次，防止第 4 次以后出现 `+3 controlled +2 prediction -4 extra audit` 的边际刷分；专项单测固定一条旧公式会从 94 涨到 95 的路线，要求修复后第 5 次“完美”受控实验反而从 94 降到 92。Duty 的方向性 causal pre-registration 由 `causalForecastStats()` 汇总，baseline / repeat / mixed 不计入，并由 `dutyCausalForecastPenalty()` 对每次可由受控实验验证的因果方向 miss 扣 3 分。来源预判由 `caseLeadForecastStats()` 只统计实际打开且有历史预测的来源，但 HIT/MISS 仅供结案复盘，不计评级：benign source confound 为保持 syndrome-level ambiguity 会跨病因出现，且部分由未公开 seed bucket 决定，不能用不可稳定推断的隐藏事实惩罚玩家。旧 v6 已打开但没有预测记录的来源继续不伪造记录。真实结案 E2E 使用一条 1 hit / 1 miss 的来源路线，检查 `SOURCE FORECAST 1/2`、明确“不计调查评级”的反馈与最终评分明细，同时继续检查因果预测扣分。
- Story session：版本化 `aia.story-session.v1.<seed>` 往返恢复 reducer + micro-beat；审计额度由实验历史重建而不是直接保存；内部 test ID 与 mistake flags 不进入序列化结果，Story `TrainingResult` 也不携带 fitted model 参数。
- Story session 关系校验：不仅检查字段类型，还检查 reducer stage 与 micro-beat 的可达顺序；`experimentLog / auditHistory / current audit` 必须在模型、特征、训练分、accuracy/error、confusion 与具体 `field-*` mistake 证据上彼此一致。实验 `predictionMatched` 由运行时与恢复端共享同一纯函数重算，不能靠 localStorage 伪造 ✓/×。
- Bureau meta progression：`aia.bureau-progress.v2` 使用 `formalCases[caseId] / trainingCases[caseId]` 保存 catalog-keyed 长期结案 / 知识事实；旧 v1 `story001 / bootCase000` 会校验后迁移，未知 case id、越过 `CASE 001 → 002 → 003 → 004 → 005` prerequisite 的伪造结案记录与重复 Duty seed 都会被拒绝。若 v2 key 存在但 JSON 已损坏，reader 会清理坏 v2 并继续尝试仍完整的 v1，而不是直接丢失可恢复进度；损坏的 v1 JSON 也会清理。CASE 001 首次结案后开放 Hub，之后案件板按 prerequisite 逐宗开放；值班工单队列继续跳过已归档 seed，并只消费不含 syndrome / diagnosis / test / audit 的 symptom-safe preview。
- Story 训练 / 预算校验：训练 accuracy 与 errorCount 必须符合当前 seed 的真实训练样本数，complexity 必须匹配 `MODEL_REGISTRY`；额外审计次数只能在此前额度确实耗尽后逐次获得，不能手改 `emergencyAudits` 退款。迁移题答案与 correctness 同样按 `TRANSFER_QUESTION` 配置重新核对。
- Story checkpoint 边界：behavior mistakeId 只接受 `field-###`，feature 必须为合法二元组；匿名事件最多保留最近 500 条并显式累计 `droppedEvents`，避免长局日志反过来毒死 autosave。专项测试还用 80 字符 action + 所有可选 telemetry 字段填满 505 次，确认截断后的 500 条最胖合法事件仍可写入并恢复于 200KB checkpoint 上限内。reader / writer 同时限制 200KB，超限 writer 返回 false 且不覆盖最后有效 checkpoint。
- BehaviorLogger continuation：刷新恢复沿用同一匿名 sessionId / startedAt，事件时间继续累计；event timestamp / elapsedMs / completed flag 必须和同一 session 时间轴及 stage 一致，显式新局会生成新的随机 session。
- 无尽生成器：确定性、四类 syndrome、传感器通道重排、可解性与随机配置成功比例；每宗新案还必须生成一个真实不可靠的 deployed baseline，而不是从固定默认配置开始。
- Duty hypothesis-depth：`duty-hypothesis-depth.test.ts` 在 160 个连续 seed 上逐案检查 deployed baseline 不可靠、存在 ≥12pt 的 syndrome-appropriate 单变量干预；要求目标干预轴相对竞争轴明显占优的比例 ≥90%，overfit 的自然 `k=1 → k=5` 对照具有 ≥95% 的 material-discrimination 覆盖率。
- 最终再次独立压力扫描 2,000 个 seed（四类各 500）：**2,000/2,000 deployed baseline 均不可靠，2,000/2,000 都存在 syndrome-appropriate ≥12pt 单变量干预**。softened shift 初版曾抓到唯一 seed 11626 fallback 到可靠默认配置；最终修成只允许真实失败且仍存在 material field-only recovery 的 fallback 后，2,000-seed 复扫为 0 反例。
- `duty-causal-ambiguity.test.ts` 新增 syndrome-level obviousness 回归：240 个 opening 都不允许自动出现精确类别构成、batch history/field、质量告警 label 或 syndrome 词；800-seed first-audit 测试要求 overfit 与 distribution-shift 高度落在同一个 `[53%, 85%)` 不可靠 FIELD 区间，且两类 mean FIELD 差 <8pt。最终 200+200 分布实测：overfit median 75%、shift median 71.4%，单看一次 “TRAIN≈100 / FIELD 中度失败” 已不足以命名病因。
- causal-source 可解性：400 个连续 seed 逐案要求 `H-COVERAGE / H-CONTEXT / H-RECORDS` 至少一份为 `CLEAR`，同时保留既有“batch / coverage / quality signal 可跨 syndrome 出现”的 ambiguity 回归。该不变量来自真实反例 seed 6017：修复前它是 overfit 案件，三份来源全为 SIGNAL，而所有连接可靠修复的 H-MODEL 端点都没有 anchored H-FIELDS null，因此 falsification gate 永久不可达。新增 Chromium 路线会真实跑 6017：baseline → H-RECORDS SIGNAL → k=5 reliable model-only repair → H-COVERAGE CLEAR → 引用 E01/E02，确认诊断提交重新可达。
- 无尽案件 cause-specific 原始事实全部改成 player-opened evidence：baseline 前 `H-COVERAGE / H-CONTEXT / H-RECORDS` 都是 SEALED；玩家复现事故后才可主动打开精确档案构成、历史/现场批次或质量记录。overfit 的橙色 archive anomaly 也只有打开 H-RECORDS 后才出现。Formal Sensor Deck 继续不显示四字段 `旧差异 X/5 / 现场变化 Y/5` 答案排行。
- 无尽实验设计：同一配置重复审计识别为 replication；只换字段 / 只换模型 / 混合改动均有确定分类。只有 fields-only / model-only 且 FIELD 或最低 recall 绝对变化 ≥12pt 才是 discriminating evidence；显著改善和显著恶化都可以减少不确定性，repeat / mixed 不能。
- 竞争假设状态：`H-FIELDS / H-MODEL` 各自只读取玩家 run history，并累积该轴全部受控实验；未测试为 OPEN，只有 material controlled change 为 SUPPORTED，只有不足 12pt 的弱变化为 WEAKENED，同时存在 material 与弱变化则为 CONTESTED。这样后做的一次局部 null 不会覆盖先前真实支持，反之亦然；UI 会要求解释为何同一因素在不同配置附近表现不同。两个轴仍可以同时 SUPPORTED，此时 UI 明确提示单一主因解释不足。causal pre-registration 对 fields-only / model-only 正式审计是必填项：未选择“应该明显改善 / 应该明显恶化 / 应该基本不变”时审计按钮保持 disabled，运行时 `audit()` 也会拒绝绕过 UI 的调用；弱变化只有在审计前已留下该因果预期时，才可通过 `preRegisteredNullResult()` 作为正式 falsification gate，禁止看完结果后再把普通 null result 包装成反证。实验日志现在同时封存方向预期与实际 `improved / degraded / tradeoff / null` 结果，并标记预测命中或失误；因此玩家不仅要预注册“会不会变”，还要在 material prediction 时判断变化方向。若 FIELD 与最低 recall 都达到 12pt material change 但方向相反，结果必须是 `tradeoff`：仍属于 discriminating evidence，但改善/恶化预注册均判 miss，且不能作为 null falsification。旧 v6 session 中的 `material` 仍可恢复并保持原有粗粒度命中语义，但当前 UI 不再生成该值。
- 诊断 gate 现在要求 **reliable solution + material discriminating experiment + 至少一份主动 causal-source review + falsification**。falsification 可以是 source `clear`（例如质量记录无异常 / 批次无实质切换），也可以是真正测试过但变化 <12pt 的预注册单变量 null result；但干预型 null 必须来自当前 material support 的**竞争轴**，并且与该 support 的某个端点共享完整相同配置，再沿竞争轴改变一个变量。即 fields-only support 的 model-only null 必须直接从其旧端点或新端点换模型，model-only support 的 fields-only null 必须直接从其旧端点或新端点换字段；仅共享字段或模型这一条固定轴、但两个 null 端点都不是 support 端点的“断链”实验不再算独立反证。同一轴的一次 material + 一次 null、第三套无关配置上的竞争轴 null 也仍然无效。引用的两条 run 也会按自身 material axis 重新校验这一条件，并且必须在 run history 中真实相邻，防止玩家跨过中间实验事后拼接一个从未执行过的合成对照；`diagnosisEvidenceStatus()` 的回归测试同时覆盖 non-sequential pair 拒绝与相邻 pair 接受。若证据包只有支持而没有独立反证，诊断区会明确提示去测试另一条轴或寻找 `clear` source。干预型 gate 不再只检查“最后一次 material 实验”：`latestFalsifiedDiscriminatingExperiment()` 会寻找最近一组仍完整的 support + competing-axis null 因果包，因此玩家在证据已经自洽后继续做另一项 material 探索，不会无故把 syndrome 重新锁住；且 `afterRunId` 同时约束 support 与 competing-axis null：错误诊断后即使重新取得 fresh material support，也不能复用诊断前的旧 null 反证绕过 fresh-evidence 要求。**一旦反证成立，诊断区与 CASE RESOLVED 报告都会显式写出究竟是哪份 CLEAR 来源、或哪两条 E 记录组成了竞争轴 null 对照**，使结案证据链可复盘，而不是只在内部布尔 gate 中消失。
- 诊断来源一致性：`diagnosisSourceStatus()` 将 required source 分成 `not-required / missing / contradicted / supported`；`diagnosisSourceSupported()` 要求 `overfit-noise / distribution-shift / class-imbalance` 分别亲自复核 `H-RECORDS / H-CONTEXT / H-COVERAGE`，且对应来源实际为 `signal` 才能提交。另一份无关 `clear` 来源只能承担竞争解释反证，不能替代当前病因的正向来源事实；已复核的 required source 若为 `clear`，则属于 `contradicted`，必须明确反馈“当前病因被直接反驳”，不能继续伪装成“还缺证据”。`feature-gap` 没有专属来源，保持由字段轴 material support + 独立反证成立。专项单测覆盖四种来源状态；另以 400 个连续 seed 校验所有可由来源辨识的真实病因始终生成对应 positive source，防止未来生成器改动把案件变成无法合法结案。该 400-seed 压力测试显式使用 15s timeout，避免与 Chromium/CI 负载并行时撞上 Vitest 默认 5s 假超时。真实 Chromium 路线同时覆盖 missing→signal 解锁与 missing→CLEAR contradiction 两种路径。
- Duty 导航与诊断 gate 保持同一事实来源：当引用实验已经就绪、玩家也选定病因，但该病因缺少对应 positive source 时，`NEXT OBJECTIVE` 不再误报 `DIAGNOSIS / READY`，而是切换为 `CAUSE / SUPPORT` 并把定位按钮指回因果线索板；对应来源复核完成后才恢复诊断就绪。单元测试检查该状态不泄露 syndrome 答案词，真实 Chromium retry 路线检查前后两个导航状态与定位目标都同步变化。第一次 baseline FIELD 失败还新增 `FIELD / INSPECT FAILURE` 节奏：只要当前首轮审计有误判且尚未检查该 run 的错误，任务条先定位 `FIELD_ERRORS.LOG`，玩家打开一条真实误判后再进入 causal-source 选择；该步骤是 answer-neutral 引导而非结案硬 gate。代表性 Chromium Duty 路线真实检查了任务文案、定位滚动、误判详情以及随后切换到“先决定查哪一种原因”。结案报告同时封存最近 3 条已检查误判的 `E## / FIELD-### / 实际类别 → 模型判断`，避免现场证据在最终案卷中退化成纯计数；新增 `CAUSAL SUPPORT` 区块进一步把最终病因的正向支持与 `FALSIFICATION` 分开封存：有专属来源的病因记录对应 `SIGNAL` 与完整 finding，`feature-gap` 则明确说明正向支持来自被引用的 material 单变量干预。Chromium 分别覆盖 feature-gap 与 class-imbalance 两种结案路径。
- 引用实验对照：`compareExperimentRecords()` 只返回 TRAIN / FIELD / 最低类别召回 / 错误数与配置变化，不推断 syndrome；`discriminatingExperiment()` 只回答“这个受控实验有没有让世界明显变化”。
- 无尽 session：当前为 `aia.endless-session.v6.<seed>`。v5/v4/v3 audit history 可迁移，但 causal-source finding 语义曾发生变化，因此迁移后 `inspectedCaseLeadIds` 会重置为空，要求玩家重新打开来源；迁移仍要求**先成功写 v6 再删除旧 key**，模拟 `QuotaExceededError` 时旧存档原件必须保留。v2 非 shift 仍可直接迁入 v6；v2 shift 因历史 field world 已变化继续明确作废；v1 继续不迁移。当前 v6 reader 会按 session seed 重新生成案件，逐条重算训练准确率、FIELD accuracy/error、两类 recall、可靠性与现场预测命中，并核对已检查 FIELD error 的真实类别/模型判断；把 localStorage 中的数值改成另一组“看似合理”的 0–1 指标也会被拒绝。reader 同时拒绝重复 cause-source id、“已复核来源数超过 baseline + 新单变量配置实际赚取额度”，以及“历史审计次数与额外审计额度不可能同时成立”的伪造 payload：前 5 次审计免费，之后每多做 1 次必须对应此前在额度耗尽时逐次申请的 recovery credit，不能手改 `emergencyCredits` 规避评级扣分。存档仍不包含内部 `test-cat/test-bread` ID 或 syndrome answer。
- answer-neutral 导航：baseline、预测、对照、诊断、诊断锁、零额度恢复均映射到可达下一动作；导航文本单测禁止出现四类 syndrome 答案词。
- causal-source pacing：第一次 baseline 赚 1 次来源复核；之后只有**此前未审计过、且相对上一轮只改字段或只改模型**的新配置再赚 1 次。repeat、字段顺序交换与 fields+model mixed change 都不增加额度；已打开来源仍可回看，未使用额度可累计。运行时点击守卫与 v6 session validator 共用同一纯额度推导，单测同时覆盖重复/混合实验和伪造 localStorage 超额复核；浏览器路线断言 repeat/mixed 后剩余来源继续 SEALED，直到新的单变量对照完成。
- causal-source forecast：READY 来源可以直接复核；`预测 SIGNAL / 预测 CLEAR` 改为可选的打开前直觉记录，不再阻塞取证。原因是 benign source confound 的部分结果由未公开 seed bucket 决定，强制二选一会制造无信息点击。若玩家主动预测，打开后仍锁定并显示 HIT/MISS；`caseLeadForecastStats()` 只统计真正打开且确有预测的来源。v6 session 继续以可选 `caseLeadPredictions` 向后兼容保存，专项测试覆盖合法往返、未知值拒绝、旧 v6 无字段继续恢复；Chromium 同时验证“无预判直接复核”以及 CLEAR→CLEAR / SIGNAL→SIGNAL 可选命中路线。
- 类别不平衡：存在总体 Accuracy ≥90% 但最低类别 recall <75% 的真实假好方案，同时存在可靠解。
- 自动玩法平衡：批量 seed 上 evidence-policy 必须显著优于 5 次 random-clicker。90 seed × 24 random-run 的统计压力测试显式使用 15s timeout，避免 CI / Chromium 并行负载下撞到 Vitest 默认 5s 假超时；本轮完整套件曾在 5.36s 触发该假超时，单独复验与放宽后全量复验均通过。
- Formal Case runtime registry：catalog 中每个正式案件都必须有 runtime。CASE 001 保留自己的长篇 reducer runtime；CASE 002/003/004/005 共用 `StoryPuzzleRuntime`，但各自拥有独立 `aia.formal-puzzle.v1.<caseId>.<seed>` checkpoint。reader 会按实际关卡配置重算 option 是否属于当前 stage、correct 标记是否真实、成功检查数是否足以到达当前 stage，伪造 `correct: true` 或直接把 stage 改到结案都会被拒绝；resume 摘要、clear 与 checkpoint→Bureau reconciliation 全由 registry owner 提供。CASE 005 额外固定 40 人 CALIBRATION split 与完全独立的 100 人 AUDIT split：映射只由前者拟合，后者只做 ECE / Brier 与政策效果验证，防止把最终审计集反向用于校准。
- Training runtime registry：catalog 中每个训练案件都必须有 runtime；Training 000 已迁到 `src/training/TrainingCase000Runtime.tsx`，并继续复用真实 Endless generator / audit，而不是作为 `src/endless/` 的特殊教程组件存在。
- Bureau Duty adapter：`createDutyCasePreview()` 的回归测试只允许 `caseNo / incident / reportedFacts / seed / title` 五类公开字段，并明确拒绝 syndrome / diagnosis / publicTest / audit；`readDutyResume()` 只暴露 `seed / historyCount / remainingCredits / solved`，`clearDutyProgress()` 负责清档。Hub 已不直接 import 完整 generator，App 也不再直接 import Endless session。
- App bootstrap：启动时遍历完整 `FORMAL_CASE_CATALOG`，CASE 001 长篇 checkpoint 与 CASE 002/003/004/005 solved puzzle checkpoint 都能归并进 canonical Bureau v2，但 later-case reconciliation 仍受 prerequisite 约束；历史 Training 完成 key 继续迁移且只有在 v2 写成功后才删除。模拟所有 Storage 操作抛 `SecurityError` 时，bootstrap 仍返回空长期进度并允许应用继续启动。

## Playwright 浏览器 E2E

`e2e/happy-path.spec.ts` 当前包含 **33 条**真实 Chromium 路线；本轮冻结源码完整执行 33/33。

调查局宏观框架单独验证：

- 全新浏览器仍从 CASE 001 进入，不显示空 Hub、OFFICE 或正常 Duty 入口。
- Bureau migration browser route 会真实写入损坏的 v2 JSON 与完整 v1 payload，刷新后要求恢复正式调查员 / CASE 001 / Training 000 长期事实、写出合法 v2 并删除旧 v1 key。
- CASE 001 真实结案后写入 Bureau progress；刷新首次进入 Hub 时出现 `CLEARANCE GRANTED`，确认后不会重复出现。
- Hub 案件板从 formal catalog 渲染 CASE 001/002/003/004/005：CASE 002 在 CASE 001 后 ACTIVE，CASE 003 / 004 / 005 按前置关系逐宗保持 SEALED；结案后 `1/5 → 2/5 → 3/5 → 4/5 → 5/5 CLOSED` 与 archive provenance 同步更新。训练中心仍从独立 training catalog 渲染；Duty queue 继续通过 Bureau-facing safe preview adapter 生成。
- 值班室无未结案时显示 3 份 symptom-only `INCOMING REPORTS`；已经归档的 seed 不会重新出现在工单队列。
- Duty 真实结案会回写 Bureau：值班结案数增加，对应病症点亮调查档案，再从值班室可以重开同一结案案卷；显式 `?mode=endless` 开发直达即使完成案件，也不会在未入职 profile 中写入 Duty 长期进度。
- 存在未结 Duty session 时，Hub 只引导继续旧案；新报告不能静默覆盖现有 session。
- Formal Case seed 与 Duty seed 已分离：浏览器路线预先保存一份由正式 writer 净化的 CASE 001 结案 checkpoint，随后接取不同 seed 的 Duty 并返回 Hub，案件板仍必须显示 `打开结案案卷`，且能够重新进入原 `CASE CLOSED`；Duty seed 变化不能改变 Story checkpoint 身份。
- Hub / 工单队列在 1280×720 下无横向溢出，四个部门都可操作；CASE 002/003/004/005 的新系统谜题整案浏览器路线也固定在 1280×720，入口、谜题、结果指标与结案均无横向溢出。CASE 004 第一阶段的 E2E 还要求从原始台账中点出真实跨 split 实体，而不是直接接受系统给出的“存在泄漏”结论。

零基础玩家完整案件：

1. 标题页点击“查看事故录像”。
2. Cold Open 中亲手确认“这明明是一只猫”，看到 `CAT ≠ BREAD`，再接入调查终端。
3. 在旧样本上完成一次肉眼分布判断，并直接在散点图里点出一个真实异常旧样本。
4. 分别读取当前“颜色暖度 / 轮廓圆度”两个观察通道；此时完整特征工具箱仍隐藏。
5. 亲手点击唯一开放的直线分类器并训练。
6. 第一次训练后先读一个没有真值的 `PROBE ?`，只根据决策区域判断“模型会说什么”。
7. 再锁定“89% 是否足以批准上线”的现实预测；E2E 故意选择错误的 89% 结论，验证游戏不会即时红叉，而会产生“临时放行 → 现场误判”的后果。
8. 放入此前未参与训练的未知样本并看到真实失败。
9. 调查两个不同黄色 `!`，读取 `EVIDENCE.LOG`，锁定一次证据推理。
10. 进入修复，先留下实验预测，再故意装载 KNN k=1，训练并消耗正式审计额度，触发真实训练 100% / 未知表现下降。
11. 从可点击 `CASE_NOTES.LOG` 中亲手指出反常实验，之后才解释原因并显示“过拟合 / Overfitting”。
12. 返回修复时确认 PHASE 03 不重复播放，并读取新解锁的备用观察通道。
13. 重新开放完整特征 / 模型配置；改方案后必须重新留下实验预测，再训练 / 审计。
14. 对照 `CASE_NOTES.LOG` 完成最终“为什么这次更可信”的判断。
15. 迁移问题同样采用“草稿 → 锁定 → 反馈”，避免通过提交按钮亮灭探答案；随后进入 `CASE CLOSED` 并显示调查评级。

同一 Story 路线现在额外把“刷新恢复”当成正式验收对象，而不是只在结案前一路直跑：

- 两条误判已调查且证据推理已经锁定时刷新：先出现 `UNFINISHED CASE SAVED`，继续后仍是 `inspect_errors`、2/2 证据与推理结果不丢；恢复提示与 `OBJECTIVE / MISSION` 通过几何 no-overlap。
- k=1 实验已经选择模型并锁定“训练可能满分、未知反而更差”，但尚未训练时刷新：模型、`PREDICTION LOCKED` 和正式额度 4 原样恢复，避免 F5 抹掉实验预注册。
- k=1 正式审计后刷新：仍停在 `overfit_reveal`，两条实验记录存在，修复正式额度仍为 3。
- CASE CLOSED 后刷新：进入 `RESOLVED CASE SAVED`，重新打开仍保持评级 A，不重播阶段过场，匿名日志的 `COMPLETE` 始终只有 1 条。
- 普通结案页真实下载行为日志 JSON：同一 sessionId 贯穿四次恢复，最终有 4 条 `SESSION_RESTORED`，并包含早期 `VIEW_MISTAKE`、后期 `RUN_AUDIT` 与最终 `EXPORT_LOG`；文件不含内部 `test-cat/test-bread` 或 mistake flags。
- `FormalCaseResume` 网关在 1280×720 下无横向溢出；暂去无尽模式不会删除 Story 存档，放弃旧进度和游戏内小型 RESET 都需要第二次确认才真正清档。
- localStorage 故障路线会故意让 Story key 的 `setItem` 抛 `QuotaExceededError`：游戏保持可操作并显示 `LOCAL SAVE FAILED`；恢复 Storage 后点击“重试本地保存”，真实写入成功且警告消失。

作弊码路线仍故意从历史 `?debug=1` query 启动并用 `CASE001 OVERFIT` 构造合法 Story checkpoint，但状态修改命令现在还必须自动创建 `aia.qa-backup.v1` 并显示 `QA TEST / SAVE SAFE`。QA Test Bench 浏览器路线先写入真实 Bureau + Story 正常存档，再跨 `CASE 001 OVERFIT → CASE 002 → CASE 003 → CASE 004 → CASE 005 → DUTY 6006`，最后一键恢复：要求原 URL 精确返回、原 `aia.*` entries 逐字相等、测试 Duty session 与 backup 都消失。另一条路线确认普通 URL 完全不显示 QA 按钮，`?qa=1` 才显示 `QA BENCH / OPEN`；它还直接用 `CASE 004 · 干净验证` 中间 stage 快捷入口落到第三谜题，并验证 checkpoint 由普通 session reader 接受，随后再用“任意 DUTY SEED”输入 7421 打开正式案件。

无尽 onboarding / 证据路线现在验证：

- 正常产品流程由调查局值班室接案后进入模式说明；显式 query 仍可用于开发复现，但不会绕过新人入职去制造长期 Duty 进度。
- Boot Case 000 真实完成“建立基线 → 只换字段做对照 → 从日志认出变量 → 三类证据阅读练习 → 诊断草稿 → 正式提交”；所有分数来自真实 generator / model / audit。
- Training 000 完成后的 canonical 长期事实只写入 `aia.bureau-progress.v2.trainingCases`；历史 `aia.boot-case-000.v2` 只作为旧存档迁移输入，新完成路线明确断言不会再写这个副本。正式模式仍可 query 直达，训练案件可重玩。
- 正式案件首屏只描述症状，不写 syndrome，也不自动显示精确类别构成 / 批次详情 / 质量告警；Sensor Deck 同样没有四字段全局 0–5 答案分数。第一次 baseline 后才解封 `H-COVERAGE / H-CONTEXT / H-RECORDS` 三条竞争原因，玩家必须主动选一条复核。
- `H-FIELDS / H-MODEL` 继续作为干预层竞争假设；浏览器路线验证它们从 OPEN 出发，repeat 保持 OPEN，真正的受控实验才产生 SUPPORTED / WEAKENED。即使玩家绕过 `NEXT OBJECTIVE` 直接做出可靠修复，只要没复核原因来源，四个 syndrome 名称仍然不渲染。
- overfit seed 6117：E01 `KNN k=1` TRAIN 100% / FIELD 72%；玩家主动打开 H-RECORDS 才看到 4 条质量记录。E02 只换 k=5 后 FIELD 81%，模型轴得到支持但仍不可靠；E03 再 fields-only 修复到 FIELD 100%。**此时仍不能诊断**，因为只有支持没有反证；再打开 H-CONTEXT 得到“没有设备、环境或采集规范的实质切换”，杀掉 context story 后才首次显示 syndrome 选项。
- shift seed 6006：E01 FIELD 71%；先开 H-RECORDS 得到“无质量异常”，排除 records story；E02 保持字段只换 k=5 后 FIELD 75%、关键变化 <12pt，因此 H-MODEL = WEAKENED；再开 H-CONTEXT 才看到夜场 / 灯光 / 摄像距离变化；E03 fields-only 后 FIELD 100%、H-FIELDS = SUPPORTED。这里同时存在 source falsification + intervention falsification。
- imbalance seed 6003：开局看不到 40:4；E01 总体 90% 但故障 recall 50%。只有玩家主动开 H-COVERAGE 才看到正常 40 / 故障 4；fields-only 修复到 100% 后仍不能命名病因，因为“类别偏斜”只是支持。再开 H-RECORDS 得到没有采集质量异常，排除 records story 后才开放诊断。
- 过拟合类历史档案的橙色 `!` 也不再是首屏指纹；只有玩家主动打开 H-RECORDS 后才显示并允许进一步检查具体异常记录。
- 正式审计结果只给总体 / 两类 recall 的 PASS/FAIL 门槛，不自动解释成过拟合、漂移或类别不平衡；`TRAIN / FIELD / 召回` 仅有字面指标词典。
- 正式审计返回的错误卡可点击，选中后对应 public `field-*` 点会滚入 `FIELD_MATRIX` 并高亮；只有亲手检查的错误才进入 `CASE_LEADS.LOG`。
- `EXPERIMENTS.LOG` 记录 baseline、只换字段、只换模型、混合改动与复现实验；下一次训练前先显示当前配置相对上一条记录的变化类型。
- 两个不同配置本身不再足够：有效引用必须是 material fields-only / model-only comparison；同配置、mixed change、变化太小的单变量对照都会被拒绝。有效引用还必须触及至少一个可靠端点，防止把历史中无关的可靠 mixed 配置与另一组 material 对照事后拼成结案解释。回归测试专门构造“E01→E02 material 但仍不可靠，E03 通过无关 mixed 路径可靠”的断链历史，要求诊断引用保持未就绪；把 E02 本身改成可靠端点后才恢复就绪。有效引用只生成字段 / 模型 / 指标变化，不替玩家解释 syndrome。
- 错误诊断后，原样复现不会解锁改口；必须产生新的 material controlled evidence，而且下一份证据包必须包含这条新记录；若依赖 intervention falsification，则配套 competing-axis null 也必须在上一次诊断后新取得，旧 null 不可复用。浏览器测试还专门验证“从可靠方案只改一个因素后性能显著下降”同样能作为 falsification 证据重新开放报告。
- 诊断锁且额度为 0 时，sticky 导航会直接定位到“申请 1 次补充审计”，验证有限预算不形成软锁。
- 正式无尽 session 按 seed 保存在本地：普通刷新不会返还正式审计额度；错误诊断锁、引用状态和已检查证据也会恢复。恢复时不仅按 seed 重算每次实验指标与已检查误判，还拒绝自相矛盾的诊断 / 结案状态：没有真实提交记录不能凭 `solved` 进入 CASE CLOSED；未结错诊记录的 `lastDiagnosisRunCount / lastDiagnosisConfigCount` 必须真实对应当次诊断时的历史前缀，不能把它们篡改为 0 绕过 fresh-evidence 锁；已结案记录还必须重新满足正式 UI 的因果 gate，包括 fresh 相邻引用、material 单变量区分、与诊断一致的干预轴、至少一份来源复核、独立 falsification、所需 positive source 与可靠端点。单纯伪造“正确病因 + 两条重复实验 + 另一条可靠实验”不再能恢复成 CASE CLOSED。模式入口显式显示未结案件 / 剩余额度，生成全新案件需要二次确认。
- 已结案 session 也会显示为 `RESOLVED CASE SAVED`；浏览器路线会从剧情页重新进入无尽入口、重开同一结案案卷并核对引用证据，再从该案生成下一 seed。
- adversarial refresh 路线验证：错误诊断后刷新仍保持锁定，之后即使取得 E03，继续引用旧 E01+E02 也不能提交，必须把新记录写进报告。
- `FieldManual` 的键盘路线验证焦点进入、Tab 环、Escape 关闭与焦点恢复；SVG 档案异常的 Space 激活会阻止默认 button 滚动语义。
- CASE RESOLVED 后不再显示 stale `NEXT OBJECTIVE`；结案案卷封存最终配置、引用 E 记录、实验设计、已检查现场误判与档案复核。
- 1280×720 以及常规桌面 viewport 验证 intro / Boot / 正式模式没有横向爆版，`定位下一步操作` 可将关键 CTA 带入视野。
- 额外 1280×720 压力路线会真正完成两次正式审计、引用 E01/E02 并展开 `EVIDENCE_COMPARE`，再次检查无横向溢出且诊断区仍可由 sticky 任务条定位。
- distribution-shift 路线验证 batch 元数据**首屏不可见**；baseline 后玩家主动打开 H-CONTEXT 才看到 `HISTORY / FIELD` 具体事实，而且 finding 仍不出现“分布漂移”答案词。

额度恢复路线会连续耗尽 5 次正式未知审计，确认额外审计入口出现、恢复 1 次可执行额度，并且这类补救会进入结案评级扣分；有限预算因此制造决策成本，但不会造成不可恢复死局。

类别不平衡路线验证：一个方案可达到约 90%+ 总体准确率，但少数类召回只有约 50%，UI 必须明确拒绝“可靠”结案；换到稳健方案后两类召回恢复，再提交 `class-imbalance` 诊断。

E2E 使用 Playwright 的真实可操作性检查；如果 overlay、NPC、tooltip 或 SVG 层拦截点击，测试会直接失败。

本轮 Playwright 实际发现并修复了两个 CDP 脚本此前无法发现的问题：

- SVG 决策背景可能抢走误判样本点击；现已让背景层不接收 pointer event，并给误判标记增加 26×26 点击热区。较大的 36×36 热区在密集区域会互相抢点击，因此真实 E2E 后进一步缩小。
- 1440×900 下折叠小析仍可能轻微覆盖模型工具盒；现已进一步贴右侧安全区，E2E 明确断言二者不重叠。

## 自动玩法平衡

无尽模式不是只测试“有没有解”，还测试“思考是否真的有收益”。当前批量基线使用 90 个程序化 seed，每个案件运行 24 次、总预算 5-audit 的 random-clicker；evidence-policy 与 random-clicker 都从同一个真实 deployed failure baseline 起步：

- evidence-policy 结案率 **100%**；
- random-clicker 结案率约 **15.1%**；
- evidence-policy 平均最佳未知表现 **100%**；
- random-clicker 平均最佳未知表现约 **92.2%**；
- evidence-policy **90/90** 都取得 material single-variable discriminating evidence；
- evidence-policy 平均正式审计 **2.02 次**：88/90 用 2 次完成，2/90 需要第 3 次受控修复。

Evidence policy 只读取玩家可检查的训练标签几何、类别构成、档案质量事实与**无标签**现场分布变化，不读取隐藏 syndrome/test label，也不能枚举隐藏 field outcome 选最优方案。当前硬门槛要求 evidence solve rate ≥95%、random solve rate <25%、二者结案率差 >70 个百分点，并要求未知表现仍有显著差距；代表 seed 还要求每局 `discriminating === true` 且最多 3 次审计。

这些指标仍不是“游戏一定好玩”的证明；它们的含义更具体：防止程序化案件退化成“开局已经修好”“根本没有能区分解释的实验”或“随便试五次和推理差不多”。

## Headless Chromium 人工视觉路线

服务器无 sudo，因此没有修改系统级 GUI 环境。用于视觉 QA 的 Chrome、共享库、CJK 测试字体、CDP 脚本和阶段截图都放在 Git 忽略的 `.tooling/` 中。

新版第一关还通过 `QA_SHOTS=1 npm run test:e2e` 在 1440×900 抓取关键阶段截图，并与既有 1920×1080 路线共同检查：

- 小析悬浮避让。
- sticky 新手任务卡。
- 奖励弹窗避让。
- 误判证据自动进入视野。
- 阶段过场仅播放一次。
- 过拟合 / 修复 / 结案剧情台词状态。
- 像素 UI 的主要布局与滚动行为。
- Cold Open 的单一 CTA 与目标建立。
- progressive disclosure：初始阶段不提前显示完整特征 / 模型驾驶舱。
- 两条证据阅读时右侧推理题保持 sticky 可见。
- 过拟合后备用传感器先读取、后开放完整修复工具。
- 非交互 mission cue 不再伪装成实心按钮。

Windows 真机截图仍作为最终美术判断基准；headless Chromium 主要负责流程、遮挡、点击命中和布局回归。

## README 展示素材

已将真实 Chromium 素材放入 `docs/assets/`：

- `hero.png`：Cold Open 中小析正式给出案件目标。
- `misclassification.png`：两条未知误判证据与现场推理。
- `endless.png`：监督学习无尽模式的首次正式审计。
- `endless-boot.png`：Boot Case 000 的两条控制变量实验记录。
- `imbalance.png`：总体高分但少数类召回失败的类别不平衡陷阱。
- `demo.gif`：标题 → 事故录像 → 案件目标 → 旧样本观察 → 决策探针 → 两条证据 → 过拟合 → 备用传感器 → 最终修复的短演示。

素材不是设计稿或伪造界面，均来自当前 V1 的真实运行状态。

## GitHub Actions CI

当前 CI 在 `push main` 与针对 `main` 的 pull request 上执行：

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test -- --run`
5. `npm run build`
6. 安装 Chromium
7. `npm run test:e2e`

本轮 Story checkpoint / 显式恢复网关 / 匿名日志连续与导出 / 保存失败 retry，以及既有无尽调查功能都已经完成本地完整验证并 push；Pages HTML 实际引用本轮 production asset 后，又用同一套生产 URL E2E 做远端验收，没有用本地结果冒充远端结果。

## GitHub Pages 部署状态

在线试玩：

`https://siddhartha-yz.github.io/ai-anomaly-bureau/`

仓库侧配置：

- `.github/workflows/pages.yml`
- Node 24 自动 build
- `actions/configure-pages`
- Pages artifact 上传
- `actions/deploy-pages`
- Vite production 使用相对静态资源路径，适配仓库子路径 Pages

仓库 owner 完成首次 Pages 启用后，提交 `42998dd` 的 `Deploy Pages` workflow 已完整 `success`。

公网验收：

- 页面 HTML：HTTP 200。
- production JS asset：HTTP 200。
- 2026-08-10 04:27 +08:00，公网 HTML 已实际引用本轮构建产物 `assets/index-CT6RjPEj.js`。
- 2026-08-10 04:34 +08:00，第一次 17-route 生产验收中 15 条通过、2 条在 `page.goto` 前置导航阶段遇到 GitHub Pages `net::ERR_CONNECTION_CLOSED`；两条定向立即重跑均通过，没有出现产品断言失败。
- 因此 Playwright 只对 `CI` 或显式外部 `PLAYWRIGHT_BASE_URL` 验收开放 1 次 test retry；localhost 开发 / 本地回归仍保持 0 retry，避免用重试掩盖稳定业务缺陷。
- 2026-08-10 04:39 +08:00，完整 17-route 生产 E2E 再次运行，**17 / 17 全部通过**。
- 生产 E2E 同时覆盖 Story Case 001、debug、无尽模式说明、Boot Case 000、症状 / 档案证据、显式实验引用与客观对照、同配置引用拒绝、现场误判定位、刷新不退款、错误诊断锁跨刷新、未结 / 已结案 session 入口、键盘手册、sticky NEXT OBJECTIVE、1280×720 基线与证据阶段、distribution-shift、额度恢复、类别不平衡与下一案生成。
- 2026-08-10 06:35 +08:00，公网 HTML 已实际引用最新 Story checkpoint 构建 `assets/index-lSOnrOh8.js`。第一次 19-route 验收中仅 endless refresh 路线首次 `page.goto` 遇到一次 `net::ERR_CONNECTION_CLOSED`，其 retry 立即通过；该路线随后单独重跑也首轮通过，没有产品断言失败。
- 2026-08-10 06:36 +08:00，再次完整运行最新 **19-route** 生产 E2E，**19 / 19 首轮全部通过**。新增覆盖 Story resume/discard、localStorage 写入失败 + retry、四次阶段恢复、实验预注册恢复、RESET 二次确认、结案 JSON 下载与恢复/警告布局安全。
- 最新 production JS 与本地最终 build 做 SHA-256 字节比对：两者均为 `68bfcae5029df7af47e347a160c00c565a914e04ede7e83725b5365cf16c85a1`。
- 上述生产验收对应的功能 / 测试检查点 `1197de1`，其 GitHub `CI` 与 `Deploy Pages` workflow 均已 `completed / success`；后续纯文档提交不改变 production bundle。
- 2026-08-10 08:26 +08:00，本轮 Story checkpoint 关系加固的最终功能检查点 `4bdf95a` 已由 Pages 实际发布为 `assets/index-sDwaHLsF.js`，GitHub `CI` 与 `Deploy Pages` 均为 `completed / success`。
- 对该精确 production asset 连续运行两次完整 19-route E2E：两次都只有 1 条路线在任何产品断言执行前的 `page.goto` 遇到 GitHub Pages `net::ERR_CONNECTION_CLOSED`，且发生在不同 endless 路线上；各自 test retry 均立即通过，两条失败路线随后单独首轮复验也通过。没有出现 Story / Endless 的产品断言失败，因此没有为了外部连接瞬断修改业务代码或放宽本地 retry。
- 最新 production JS 与本地 release build 的 SHA-256 均为 `9e431579dd70b1ef47fc0d57ce4c9e0d78fb471b06598213a0432f0ebb4f52a6`（393434 bytes）；CSS `assets/index-Da9oSxjH.css` 两端 SHA-256 均为 `6d711b6aa28c6ac207bbc22ac4c64319490482b5f044fd1c92b2633379bda303`（159870 bytes）。
- 2026-08-10 10:23 +08:00，本轮 Bureau Hub / meta loop 的 production HTML 已实际引用 `assets/index-CHLw5uOw.js`；随后直接对 `github.io` 运行最新 **22-route** Chromium E2E，**22 / 22 首轮全部通过**，包括新人不见空 Hub、CASE 001 → CLEARANCE GRANTED → Hub、1280×720 Hub、Duty 工单队列、Duty 结案回流与原有 Story / Endless 全部路线。
- 本轮 production JS 与本地 build 的 SHA-256 均为 `8cd0a26c61436bdc2cd728721f414b723d2a4967c064062d15b4c3b57f0bb5df`（411474 bytes）；CSS `assets/index-B06ZCwZi.css` 两端 SHA-256 均为 `406cf3b4ebd9931eec1c789954e3c87c127064d3bac3e101321441969a157a91`（174938 bytes）。对应提交 `9391f8e` 的 GitHub `CI` 与 `Deploy Pages` 均已 `completed / success`。
- 2026-08-10 10:38 +08:00，safe duty preview 边界进入最终 runtime `assets/index-Dh_HZzuz.js` 后，再次对真实 Pages 完整执行 **22 / 22** Chromium E2E，首轮全部通过。JS 本地 / 远端 SHA-256 均为 `44cdd65888b13858ff6cfd5d5690cd91fc43cbd0f0e936502570b5e35965b88a`（411605 bytes）；CSS 仍为 `406cf3b4ebd9931eec1c789954e3c87c127064d3bac3e101321441969a157a91`（174938 bytes）。提交 `63bb096` 的 `CI` 与 `Deploy Pages` 均已 `completed / success`。

- 2026-08-10 12:54 +08:00，本轮调查局框架 / 作弊码最终 runtime 检查点 `34dfac3` 已由 Pages 发布为 `assets/index-DtiyRLxy.js`。对该精确线上版本完整运行 **23 / 23 production E2E，首轮全部通过**；覆盖正式 Story 作弊 checkpoint、Bureau / Training / seeded Duty 跨模式作弊码、case catalog、Hub 部门回流与 SHIFT PRIORITY，同时保留此前 Story / Endless 全部回归路线。GitHub `CI` 与 `Deploy Pages` 均为 `completed / success`。最终 JS 本地 / 线上 SHA-256 均为 `47a148aa154cd4c91a814b8151afa3ef0d2b86211d9591b4dd0fe3c38240a010`（413943 bytes）；CSS `assets/index-KfJ1P0yG.css` 两端 SHA-256 均为 `ebc5b8feba255c857ab68492ed2ecb6f160fc5e7def1f29ab3b59bc6d0d2c31f`（177241 bytes）。
- 2026-08-10 14:28 +08:00，本轮 authored-case framework 最终代码检查点 `39dc728` 已由 Pages 发布为 `assets/index-DGjhPZT4.js`；随后文档检查点 `b127bd8` 的 GitHub `CI` Run 94 与 `Deploy Pages` Run 78 也都显示 `completed successfully`。线上 HTML 实际引用 `assets/index-DGjhPZT4.js` 与 `assets/index-KfJ1P0yG.css`；JS 本地 / 线上 SHA-256 均为 `2bd3e2347534c519767afe3061d8f3a5125d4866a1ef93139ed0e33f58a10f97`（416012 bytes），CSS 两端仍为 `ebc5b8feba255c857ab68492ed2ecb6f160fc5e7def1f29ab3b59bc6d0d2c31f`（177241 bytes）。直接对该精确 `github.io` 版本运行完整 **23 / 23 production E2E，首轮全部通过**，包括 catalog-driven Formal / Training runtime、Bureau progress v2、Formal/Duty seed 隔离与旧 query 兼容路线。
- 2026-08-10 14:41 +08:00，Bureau 迁移恢复最终代码检查点 `21d1344` 的 GitHub `CI` Run 96 与 `Deploy Pages` Run 80 均 `completed successfully`；生产 HTML 已切换到 `assets/index-BXnu41BS.js`。本地 / 线上 JS SHA-256 均为 `e4e30ab651ee4e3135ef026a93d127474d7b506df83689d2e31b7154d3c015fb`（416099 bytes），CSS `assets/index-KfJ1P0yG.css` 两端仍为 `ebc5b8feba255c857ab68492ed2ecb6f160fc5e7def1f29ab3b59bc6d0d2c31f`（177241 bytes）。随后测试检查点 `9cf8ad5` 的 `CI` Run 97 与 `Deploy Pages` Run 81 也均 `completed successfully`；直接对该精确 `github.io` 代码版本运行当前完整 **24 / 24 production E2E，首轮全部通过**，新增真实覆盖“损坏 v2 JSON + 完整 v1 → 恢复 Bureau 长期事实 → 写出合法 v2 → 删除旧 v1”。
- 2026-08-10 15:12 +08:00，本轮最终 authored-content / application-shell 检查点 `f190ef5` 的 GitHub `CI` Run 101 与 `Deploy Pages` Run 85 均 `completed successfully`。生产 HTML 实际引用 `assets/index-BYY1gKnf.js` 与 `assets/index-KfJ1P0yG.css`；JS 本地 / 线上 SHA-256 均为 `97f0ac5dd7ae250ea5fdf5d2f3f33e90e94c9b196e939e11824025981cc05b6e`（416226 bytes），CSS 两端 SHA-256 均为 `ebc5b8feba255c857ab68492ed2ecb6f160fc5e7def1f29ab3b59bc6d0d2c31f`（177241 bytes）。该精确线上版本完整执行 **24 / 24 production E2E，首轮全部通过**；本地最终发布级验证同时为 **20 个 Vitest 文件 / 100 个测试全通过**。这一版已包含 Formal / Training runtime registry、Bureau progress v2 与恢复、Formal / Duty seed 隔离、`bureau/duty.ts` preview/resume/clear 边界、ESLint import 架构护栏，以及 `app/bootstrap.ts` 对旧 Story / Training 进度的容错归并。
- 2026-08-10 20:37 +08:00，本轮 Duty hypothesis-testing 功能检查点 `5f4e6ab` 的 GitHub `CI` Run 103 与 `Deploy Pages` Run 87 均 `completed successfully`。生产 HTML 已实际引用 `assets/index-d8imknCr.js` 与 `assets/index-DyIuyVLf.css`；JS 本地 / 线上 SHA-256 均为 `8471754bb94e629ef947b347bbdbacf37c4475fe12cb3c4ab0010fc33492ea7c`（422643 bytes），CSS 两端 SHA-256 均为 `ad1ffeca075a7768e8ede31a4d8a3ee029e18f8e4b8b8ab35dfa686cc4e142ec`（178644 bytes）。第一次对该精确线上版本运行 26-route E2E 时，只有 Story resume 路线在任何产品断言前的 `page.goto` 遇到一次 GitHub Pages `net::ERR_CONNECTION_CLOSED`，其 test retry 立即通过；其余 25 条首轮通过。随后对同一精确 asset 再次完整运行 **26 / 26 production E2E，全部首轮通过**，包括 overfit 分阶段推理、seed 6006 的 `H-MODEL OPEN → WEAKENED / H-FIELDS OPEN → SUPPORTED` falsification、replication/mixed 非区分证据、错误诊断后的新 falsification、类别不平衡高总体分陷阱与完整 CASE CLOSED 路线。没有为了外部连接瞬断修改业务代码或放宽 localhost retry。
- 2026-08-10 22:21 +08:00，本轮 syndrome-level causal investigation + QA Test Bench 功能检查点 `1708d20` 的 GitHub `CI` Run 105 与 `Deploy Pages` Run 89 均 `completed successfully`。生产 HTML 已实际引用 `assets/index-CZZF0Q_G.js` 与 `assets/index-H5bxzfje.css`；JS 本地 / 线上 SHA-256 均为 `6f95811a46ac3e53bd75f92bb41f4ee568cccd7949e72433469899500bf733cf`（431406 bytes），CSS 两端 SHA-256 均为 `cba8eca4f8228186947cc7aa6481f2c331aa804e73d83bc0a3faf9dc812aac83`（183707 bytes）。对该精确线上版本直接完整运行 **29 / 29 production Chromium E2E，首轮全部通过**，无 retry：新增覆盖 `qa=1` 可见测试入口、任意 Duty seed、人为正常存档跨 Story/Duty 测试后的逐字恢复、三条 sealed competing causes、cause-source 主动取证、可靠修复后仍要求 falsification、overfit source-level 排除、shift null-result 排除、imbalance 40:4 延迟揭示与既有完整 CASE CLOSED / Bureau / Training / session 路线。

为了同时兼容 localhost 与 GitHub Pages 子路径，E2E 使用相对 query 导航；Playwright 配置支持通过 `PLAYWRIGHT_BASE_URL` 验证外部部署，设置后不会额外启动本地 Vite。

- 2026-08-11，本轮 Duty 结案因果一致性收紧：最终选择的 syndrome 必须与所引用 material 单变量证据的干预轴一致（`overfit-noise → H-MODEL`，其余当前 syndrome → `H-FIELDS`）。新增 unit regression 固化映射，并把真实错误诊断恢复 E2E 改为“错误但因果轴一致”的诊断；浏览器同时验证 `H-FIELDS` 证据选择 overfit 时会显示证据—结论矛盾且 `提交诊断` 保持 disabled。最终本地验证为 ESLint 通过、TypeScript 通过、24 个 Vitest 文件 **129 / 129**、production build 通过、完整 Chromium E2E **30 / 30**。

## CSS / App.tsx 维护债务审计

本轮做了分析，但没有进行大规模样式重构。

现状：

- UI 经多轮迭代后存在多个分层 CSS 文件；本轮没有为了框架重构顺带合并视觉层。
- `App.tsx` 已从 1123 行降到 168 行，只保留应用级模式、case id、Bureau progression 更新与返回路径编排；CASE 001 运行时、Formal resume/clear/reconciliation、Training 000 runtime、Duty session 摘要/清档以及旧进度启动迁移均已移出 App。
- 粗略静态扫描仍能找到若干可能的历史 class，但包含动态 class、媒体查询和层叠覆盖，无法仅凭文本搜索安全删除。

判断：当前视觉结果已经通过真浏览器验证；React 的 authored-content 边界已经完成本轮目标，但为了“代码洁癖”继续合并 CSS 的风险高于收益。本轮没有进行大规模视觉样式重构。

后续若要继续收束，建议先引入浏览器 CSS coverage 或截图基线，再按文件逐步删除历史规则。

## 尚未覆盖的风险

- 已获得至少一轮真实零基础新生定性反馈，并据此重做第一分钟、交互可发现性与核心实验循环；尚未完成 5～8 人规模的系统可用性测试。
- **剧情模式 20～30 分钟仍只是设计目标。** 当前没有足够真人计时数据证明已经达到；自动 E2E 会快速操作，不能用于估算真实游玩时间。
- Playwright 当前只覆盖 Chromium + 桌面 viewport，不做浏览器 matrix。
- 没有建立大规模视觉 snapshot 回归；视觉仍以真实截图人工检查为主。
- GitHub Pages 已上线；当前没有针对 CDN 缓存传播延迟的专项测试。
- 外部中文像素字体网络不可用时会回退到系统 CJK 字体，功能不受影响，但视觉会变化。
- opening fingerprint 已进一步削弱：`H-CONTEXT / H-RECORDS / H-COVERAGE` 的 positive finding 现在都能出现在 **四种 syndrome** 中。shift 仍有真实环境/设备变化，但其他案件可带有非主因的运营批次变化；overfit 仍有真实噪声，但其他案件可带 benign quality alert；imbalance 仍真的使用偏斜训练集，但其他案件也可能来自偏斜的上游历史档案池，而本次模型训练子集保持平衡。三组 400-seed 回归都要求对应 signal 覆盖四种 syndrome，且目标 syndrome 在 positive finding 中占比低于 65%。因此“资料夹亮了”只能说明该来源值得追查，不能直接当病名答案。
- Duty session 升到 **v6**。v5/v4/v3 以及可兼容的 v2 实验历史仍可迁移，但迁移时重新封存 causal-source folders，避免旧存档中已经读过的 H-COVERAGE 在新版本里静默变成另一条 finding；v2 distribution-shift 仍因旧 field world 不兼容而作废，写入新 key 失败时保留旧存档。当前 reader 还会复核每条历史实验的预注册关系：只有 `fields-only / model-only` 单变量实验必须携带事前 causal forecast，baseline / repeat / mixed 不得事后伪造 forecast；因此删除一次预测失误或给旧实验补写“预注册”都会使 checkpoint 作废。

## 下一步真实玩家测试重点

招募 5～8 名没有 ML 基础的大一新生，优先观察：

- 首屏到第一次有效点击是否 < 30 秒。
- 是否能在 5 分钟内完成第一次训练。
- 是否会把 88.9% 训练表现误解成“问题已经解决”。
- 未知测试跌到 66.7% 后是否主动调查误判。
- k=1 出现训练 100% / 测试下降时，能否用自己的话描述“它太记旧数据了”。
- 是否理解换特征是在改变模型真正看到的数据。
- 迁移问题能否在不背“过拟合”术语的情况下答对。
