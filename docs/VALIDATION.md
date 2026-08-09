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
- Vitest：9 个测试文件、37 个测试全部通过。
- Vite production build：通过。
- Playwright：13 条 Chromium E2E 通过，覆盖剧情完整案件、debug 工程模式、无尽模式说明、Boot Case 000、正式证据导航、症状文案、复现实验守卫、桌面 viewport、分布变化、额度恢复与类别不平衡。
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
- 普通模式拒绝 debug 跳关。
- 六类开发者测试人格均在有限步骤内完成关卡，并经历过拟合与多次未知审计。
- 教学任务、NPC 提示、模型 / 特征说明保持短文本约束。
- 调查评级：错误上线、推理修正、预测偏差、额外审计和提示会降低评级；S 只保留给干净证据路线。
- 无尽生成器：确定性、四类 syndrome、传感器通道重排、可解性与随机配置成功比例。
- 无尽案件 symptom-only brief：incident / reported facts 不直接写出正确诊断；过拟合类含可点击历史档案质量告警，distribution-shift 含历史 / 现场批次元数据。
- 无尽实验设计：同一配置重复审计识别为 replication，不增加可提交诊断所需的“不同配置”数量；只换字段 / 只换模型 / 混合改动均有确定分类。
- answer-neutral 导航：baseline、预测、对照、诊断、诊断锁、零额度恢复均映射到可达下一动作；导航文本单测禁止出现四类 syndrome 答案词。
- 类别不平衡：存在总体 Accuracy ≥90% 但最低类别 recall <75% 的真实假好方案，同时存在可靠解。
- 自动玩法平衡：批量 seed 上 evidence-policy 必须显著优于 5 次 random-clicker。

## Playwright 浏览器 E2E

`e2e/happy-path.spec.ts` 当前包含 13 条真实 Chromium 路线。

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

工程模式路线会直接打开 `?debug=1`，验证 DebugPanel、阶段跳转和快速主操作仍可用，不受普通玩家 micro-beat 门槛影响。

无尽 onboarding / 证据路线现在验证：

- 标题次入口先进入模式说明，不直接把新人扔进 sandbox。
- Boot Case 000 真实完成“建立基线 → 只换字段做对照 → 从日志认出变量 → 三类证据阅读练习 → 诊断草稿 → 正式提交”；所有分数来自真实 generator / model / audit。
- Boot 完成后使用版本化 localStorage 标记；正式模式仍可 query 直达，训练案件可重玩。
- 正式案件首屏只描述症状，不写出 syndrome；sticky `NEXT OBJECTIVE` 持续告诉玩家下一步缺什么动作，但不推荐具体字段、模型或病因。
- 过拟合类历史档案的质量告警在散点图里为可点击橙色 `!`；只有玩家亲手打开后才进入 `CASE_LEADS.LOG`。
- 正式审计结果只给总体 / 两类 recall 的 PASS/FAIL 门槛，不自动解释成过拟合、漂移或类别不平衡。
- `EXPERIMENTS.LOG` 记录 baseline、只换字段、只换模型、混合改动与复现实验；错误诊断后，原样复现不会解锁改口，必须产生一个不同配置的新正式审计。
- 诊断锁且额度为 0 时，sticky 导航会直接定位到“申请 1 次补充审计”，验证有限预算不形成软锁。
- 1280×720 以及常规桌面 viewport 验证 intro / Boot / 正式模式没有横向爆版，`定位下一步操作` 可将关键 CTA 带入视野。
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

本轮证据驱动剧情与无尽模式的本地完整验证已通过；最终提交 push 后会再次以 GitHub Actions / Pages 和生产 URL E2E 作为发布验收，不用本地结果代替远端结果。

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
- 同一组 Playwright E2E 使用 `PLAYWRIGHT_BASE_URL=https://siddhartha-yz.github.io/ai-anomaly-bureau/` 对真实部署站点运行通过。
- 沉浸式新版生产 E2E 已实际覆盖 Cold Open、两条误判证据、k=1 过拟合、备用传感器修复与 `CASE CLOSED`；debug 工程模式也同时通过。

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
