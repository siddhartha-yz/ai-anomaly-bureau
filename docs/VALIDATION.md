# V1 发布验证记录

验证日期：2026-08-10

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
- Vitest：15 个测试文件、84 个测试全部通过。
- Vite production build：通过。
- Playwright：23 条 Chromium E2E 通过，覆盖新人 CASE 001 → 正式入职 → Bureau Hub 的宏观闭环、Hub 案件板 / 训练中心 / 档案 / 值班室、程序化工单队列与结案回流、剧情完整案件、Story 本地检查点 / 显式恢复网关 / 实验预注册恢复 / 二次确认 RESET / 保存失败与 retry / 结案匿名日志导出、作弊码正式检查点 / 跨模式跳转、Boot Case 000、显式证据引用 / 对照、可调查现场误判、session 刷新恢复、错误诊断锁跨刷新、键盘 modal、1280×720 压力布局、分布变化、额度恢复与类别不平衡。
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
- 调查评级：错误上线、推理修正、预测偏差、额外审计和提示会降低评级；S 只保留给干净证据路线。
- Story session：版本化 `aia.story-session.v1.<seed>` 往返恢复 reducer + micro-beat；审计额度由实验历史重建而不是直接保存；内部 test ID 与 mistake flags 不进入序列化结果，Story `TrainingResult` 也不携带 fitted model 参数。
- Story session 关系校验：不仅检查字段类型，还检查 reducer stage 与 micro-beat 的可达顺序；`experimentLog / auditHistory / current audit` 必须在模型、特征、训练分、accuracy/error、confusion 与具体 `field-*` mistake 证据上彼此一致。实验 `predictionMatched` 由运行时与恢复端共享同一纯函数重算，不能靠 localStorage 伪造 ✓/×。
- Bureau meta progression：`aia.bureau-progress.v1` 只保存长期结案 / 知识事实；CASE 001 首次结案后才开放 Hub 与 Duty，重复 Duty seed 不会重复制造进度，晋级按不同 syndrome 的经验广度计算；值班工单队列会跳过已归档 seed，并只消费不含 syndrome / diagnosis / test / audit 的 symptom-safe preview。
- Story 训练 / 预算校验：训练 accuracy 与 errorCount 必须符合当前 seed 的真实训练样本数，complexity 必须匹配 `MODEL_REGISTRY`；额外审计次数只能在此前额度确实耗尽后逐次获得，不能手改 `emergencyAudits` 退款。迁移题答案与 correctness 同样按 `TRANSFER_QUESTION` 配置重新核对。
- Story checkpoint 边界：behavior mistakeId 只接受 `field-###`，feature 必须为合法二元组；匿名事件最多保留最近 500 条并显式累计 `droppedEvents`，避免长局日志反过来毒死 autosave。专项测试还用 80 字符 action + 所有可选 telemetry 字段填满 505 次，确认截断后的 500 条最胖合法事件仍可写入并恢复于 200KB checkpoint 上限内。reader / writer 同时限制 200KB，超限 writer 返回 false 且不覆盖最后有效 checkpoint。
- BehaviorLogger continuation：刷新恢复沿用同一匿名 sessionId / startedAt，事件时间继续累计；event timestamp / elapsedMs / completed flag 必须和同一 session 时间轴及 stage 一致，显式新局会生成新的随机 session。
- 无尽生成器：确定性、四类 syndrome、传感器通道重排、可解性与随机配置成功比例。
- 无尽案件 symptom-only brief：incident / reported facts 不直接写出正确诊断；过拟合类含可点击历史档案质量告警，distribution-shift 含历史 / 现场批次元数据。
- 无尽实验设计：同一配置重复审计识别为 replication，不增加可提交诊断所需的“不同配置”数量；只换字段 / 只换模型 / 混合改动均有确定分类；下一次训练前使用同一纯函数语义预览当前实验计划。
- 诊断证据包：必须显式引用两条不同配置的 run；错误诊断后下一份报告必须包含 `lastDiagnosisRunCount` 之后的新记录，旧 E 记录不能反复用于轮猜。
- 引用实验对照：`compareExperimentRecords()` 只返回 TRAIN / FIELD / 最低类别召回 / 错误数与配置变化，不推断 syndrome。
- 无尽 session：版本化 seed-local payload 可往返恢复，损坏 / 旧版本 / 越界指标 / 不存在的 run 引用 / audit 配置冲突都会被拒绝；存档不包含内部 `test-cat/test-bread` ID 或 syndrome answer。
- answer-neutral 导航：baseline、预测、对照、诊断、诊断锁、零额度恢复均映射到可达下一动作；导航文本单测禁止出现四类 syndrome 答案词。
- 类别不平衡：存在总体 Accuracy ≥90% 但最低类别 recall <75% 的真实假好方案，同时存在可靠解。
- 自动玩法平衡：批量 seed 上 evidence-policy 必须显著优于 5 次 random-clicker。

## Playwright 浏览器 E2E

`e2e/happy-path.spec.ts` 当前包含 23 条真实 Chromium 路线。

调查局宏观框架单独验证：

- 全新浏览器仍从 CASE 001 进入，不显示空 Hub、OFFICE 或正常 Duty 入口。
- CASE 001 真实结案后写入 Bureau progress；刷新首次进入 Hub 时出现 `CLEARANCE GRANTED`，确认后不会重复出现。
- Hub 案件板能重开 CASE 001；训练中心识别 Boot Case `CLEARED`；调查档案只显示已经真实发现的条目。
- 值班室无未结案时显示 3 份 symptom-only `INCOMING REPORTS`；已经归档的 seed 不会重新出现在工单队列。
- Duty 真实结案会回写 Bureau：值班结案数增加，对应病症点亮调查档案，再从值班室可以重开同一结案案卷；显式 `?mode=endless` 开发直达即使完成案件，也不会在未入职 profile 中写入 Duty 长期进度。
- 存在未结 Duty session 时，Hub 只引导继续旧案；新报告不能静默覆盖现有 session。
- Hub / 工单队列在 1280×720 下无横向溢出，四个部门都可操作。

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
- `StoryResume` 网关在 1280×720 下无横向溢出；暂去无尽模式不会删除 Story 存档，放弃旧进度和游戏内小型 RESET 都需要第二次确认才真正清档。
- localStorage 故障路线会故意让 Story key 的 `setItem` 抛 `QuotaExceededError`：游戏保持可操作并显示 `LOCAL SAVE FAILED`；恢复 Storage 后点击“重试本地保存”，真实写入成功且警告消失。

作弊码路线会故意从历史 `?debug=1` query 打开页面，先确认它不再提供特权 UI，再用 `CASE001 OVERFIT` 构造真实两次审计的合法 Story checkpoint；进入正式 `overfit_reveal` 后再次刷新，必须回到普通 `StoryResume` 网关。另一条浏览器路线验证 `BUREAU UNLOCK → TRAINING → DUTY 6003` 都进入正式模式。

无尽 onboarding / 证据路线现在验证：

- 正常产品流程由调查局值班室接案后进入模式说明；显式 query 仍可用于开发复现，但不会绕过新人入职去制造长期 Duty 进度。
- Boot Case 000 真实完成“建立基线 → 只换字段做对照 → 从日志认出变量 → 三类证据阅读练习 → 诊断草稿 → 正式提交”；所有分数来自真实 generator / model / audit。
- Boot 完成后使用版本化 localStorage 标记；正式模式仍可 query 直达，训练案件可重玩。
- 正式案件首屏只描述症状，不写出 syndrome；sticky `NEXT OBJECTIVE` 持续告诉玩家下一步缺什么动作，但不推荐具体字段、模型或病因。
- 过拟合类历史档案的质量告警在散点图里为可点击橙色 `!`；只有玩家亲手打开后才进入 `CASE_LEADS.LOG`。
- 正式审计结果只给总体 / 两类 recall 的 PASS/FAIL 门槛，不自动解释成过拟合、漂移或类别不平衡；`TRAIN / FIELD / 召回` 仅有字面指标词典。
- 正式审计返回的错误卡可点击，选中后对应 public `field-*` 点会滚入 `FIELD_MATRIX` 并高亮；只有亲手检查的错误才进入 `CASE_LEADS.LOG`。
- `EXPERIMENTS.LOG` 记录 baseline、只换字段、只换模型、混合改动与复现实验；下一次训练前先显示当前配置相对上一条记录的变化类型。
- 达到两个不同配置后仍必须从日志引用两条记录；同配置引用会被拒绝。有效引用会生成只包含字段 / 模型 / 指标变化的客观对照，病因选项才解锁。
- 错误诊断后，原样复现不会解锁改口；必须产生一个不同配置的新正式审计，而且下一份证据包必须包含这条新记录。
- 诊断锁且额度为 0 时，sticky 导航会直接定位到“申请 1 次补充审计”，验证有限预算不形成软锁。
- 正式无尽 session 按 seed 保存在本地：普通刷新不会返还正式审计额度；错误诊断锁、引用状态和已检查证据也会恢复。模式入口显式显示未结案件 / 剩余额度，生成全新案件需要二次确认。
- 已结案 session 也会显示为 `RESOLVED CASE SAVED`；浏览器路线会从剧情页重新进入无尽入口、重开同一结案案卷并核对引用证据，再从该案生成下一 seed。
- adversarial refresh 路线验证：错误诊断后刷新仍保持锁定，之后即使取得 E03，继续引用旧 E01+E02 也不能提交，必须把新记录写进报告。
- `FieldManual` 的键盘路线验证焦点进入、Tab 环、Escape 关闭与焦点恢复；SVG 档案异常的 Space 激活会阻止默认 button 滚动语义。
- CASE RESOLVED 后不再显示 stale `NEXT OBJECTIVE`；结案案卷封存最终配置、引用 E 记录、实验设计、已检查现场误判与档案复核。
- 1280×720 以及常规桌面 viewport 验证 intro / Boot / 正式模式没有横向爆版，`定位下一步操作` 可将关键 CTA 带入视野。
- 额外 1280×720 压力路线会真正完成两次正式审计、引用 E01/E02 并展开 `EVIDENCE_COMPARE`，再次检查无横向溢出且诊断区仍可由 sticky 任务条定位。
- distribution-shift 路线验证 `HISTORY BATCH / FIELD BATCH` 元数据可见，但首屏不出现“分布漂移”答案词。

额度恢复路线会连续耗尽 5 次正式未知审计，确认额外审计入口出现、恢复 1 次可执行额度，并且这类补救会进入结案评级扣分；有限预算因此制造决策成本，但不会造成不可恢复死局。

类别不平衡路线验证：一个方案可达到约 90%+ 总体准确率，但少数类召回只有约 50%，UI 必须明确拒绝“可靠”结案；换到稳健方案后两类召回恢复，再提交 `class-imbalance` 诊断。

E2E 使用 Playwright 的真实可操作性检查；如果 overlay、NPC、tooltip 或 SVG 层拦截点击，测试会直接失败。

本轮 Playwright 实际发现并修复了两个 CDP 脚本此前无法发现的问题：

- SVG 决策背景可能抢走误判样本点击；现已让背景层不接收 pointer event，并给误判标记增加 26×26 点击热区。较大的 36×36 热区在密集区域会互相抢点击，因此真实 E2E 后进一步缩小。
- 1440×900 下折叠小析仍可能轻微覆盖模型工具盒；现已进一步贴右侧安全区，E2E 明确断言二者不重叠。

## 自动玩法平衡

无尽模式不是只测试“有没有解”，还测试“思考是否真的有收益”。当前批量基线使用 90 个程序化 seed，每个案件运行 24 次 5-audit random-clicker：

- evidence-policy 结案率约 **98.9%**；
- random-clicker 结案率约 **15.7%**；
- evidence-policy 平均最佳未知表现约 **99.4%**；
- random-clicker 平均最佳未知表现约 **88.5%**。

Evidence policy 只读取玩家同样可见的训练标签几何与**无标签**现场分布变化，不读取隐藏 syndrome/test label。测试硬门槛要求 evidence solve rate ≥90%、random solve rate <30%、二者结案率差 >60 个百分点，并要求未知表现存在显著差距。

这些指标不是“游戏一定好玩”的证明，只是防止程序化案件退化成“随便试五次和推理差不多”。

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

为了同时兼容 localhost 与 GitHub Pages 子路径，E2E 使用相对 query 导航；Playwright 配置支持通过 `PLAYWRIGHT_BASE_URL` 验证外部部署，设置后不会额外启动本地 Vite。

## CSS / App.tsx 维护债务审计

本轮做了分析，但没有进行大规模样式重构。

现状：

- UI 经多轮迭代后存在多个分层 CSS 文件；本轮新增 `narrative-expansion.css` 只承载 Cold Open、调查 prompt 和 progressive disclosure，不回头大规模合并历史视觉层。
- `App.tsx` 仍承担较多页面编排。
- 粗略静态扫描能找到若干可能的历史 class，但包含动态 class、媒体查询和层叠覆盖，无法仅凭文本搜索安全删除。

判断：当前视觉结果已经通过真浏览器验证；为了“代码洁癖”合并 CSS 的风险高于收益。本轮只保留与真实 E2E bug 直接相关的低风险修改，没有进行大规模 React/CSS 重构。

后续若要继续收束，建议先引入浏览器 CSS coverage 或截图基线，再按文件逐步删除历史规则。

## 尚未覆盖的风险

- 已获得至少一轮真实零基础新生定性反馈，并据此重做第一分钟、交互可发现性与核心实验循环；尚未完成 5～8 人规模的系统可用性测试。
- **剧情模式 20～30 分钟仍只是设计目标。** 当前没有足够真人计时数据证明已经达到；自动 E2E 会快速操作，不能用于估算真实游玩时间。
- Playwright 当前只覆盖 Chromium + 桌面 viewport，不做浏览器 matrix。
- 没有建立大规模视觉 snapshot 回归；视觉仍以真实截图人工检查为主。
- GitHub Pages 已上线；当前没有针对 CDN 缓存传播延迟的专项测试。
- 外部中文像素字体网络不可用时会回退到系统 CJK 字体，功能不受影响，但视觉会变化。

## 下一步真实玩家测试重点

招募 5～8 名没有 ML 基础的大一新生，优先观察：

- 首屏到第一次有效点击是否 < 30 秒。
- 是否能在 5 分钟内完成第一次训练。
- 是否会把 88.9% 训练表现误解成“问题已经解决”。
- 未知测试跌到 66.7% 后是否主动调查误判。
- k=1 出现训练 100% / 测试下降时，能否用自己的话描述“它太记旧数据了”。
- 是否理解换特征是在改变模型真正看到的数据。
- 迁移问题能否在不背“过拟合”术语的情况下答对。
