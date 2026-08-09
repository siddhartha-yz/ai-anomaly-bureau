# V1 发布验证记录

验证日期：2026-08-09

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
- Vitest：4 个测试文件、20 个测试全部通过。
- Vite production build：通过。
- Playwright：2 条 Chromium E2E 通过（零基础玩家完整案件 + debug 工程模式）。
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
- 普通模式不暴露隐藏测试标签。
- 线性分类器、深度 2 决策树、KNN k=1 / k=5 的真实计算。
- 决策边界网格确定性。
- 初始训练捷径在未知样本上真实失败。
- k=1 过拟合陷阱真实存在。
- 两个不同错误样本的证据守卫。
- 三级提示上限。
- 普通模式拒绝 debug 跳关。
- 六类开发者测试人格均在有限步骤内完成关卡，并经历过拟合与多次未知审计。
- 教学任务、NPC 提示、模型 / 特征说明保持短文本约束。

## Playwright 浏览器 E2E

`e2e/happy-path.spec.ts` 当前包含两条真实 Chromium 路线。

零基础玩家完整案件：

1. 标题页点击“查看事故录像”。
2. Cold Open 中亲手确认“这明明是一只猫”，看到 `CAT ≠ BREAD`，再接入调查终端。
3. 在旧样本上完成一次肉眼分布判断。
4. 分别读取当前“颜色暖度 / 轮廓圆度”两个观察通道；此时完整特征工具箱仍隐藏。
5. 亲手点击唯一开放的直线分类器并训练。
6. 第一次成功后先留下“是否真的修好”的预测。
7. 放入此前未参与训练的未知样本并看到真实失败。
8. 调查两个不同黄色 `!`，读取 `EVIDENCE.LOG`，完成一次证据推理。
9. 进入修复，故意装载 KNN k=1，训练并审计，触发真实训练 100% / 未知表现下降。
10. 玩家先解释反常现象，之后才显示“过拟合 / Overfitting”。
11. 返回修复时确认 PHASE 03 不重复播放，并读取新解锁的“表面纹理 / 长宽比例”两个备用观察通道。
12. 重新开放完整特征 / 模型配置，切换到稳健特征 + 直线模型并重新训练 / 审计。
13. 对照 `CASE_NOTES.LOG` 完成最终“为什么这次更可信”的判断。
14. 回答迁移问题并进入 `CASE CLOSED`。

工程模式路线会直接打开 `?debug=1`，验证 DebugPanel、阶段跳转和快速主操作仍可用，不受普通玩家 micro-beat 门槛影响。

E2E 使用 Playwright 的真实可操作性检查；如果 overlay、NPC、tooltip 或 SVG 层拦截点击，测试会直接失败。

本轮 Playwright 实际发现并修复了两个 CDP 脚本此前无法发现的问题：

- SVG 决策背景可能抢走误判样本点击；现已让背景层不接收 pointer event，并给误判标记增加 26×26 点击热区。较大的 36×36 热区在密集区域会互相抢点击，因此真实 E2E 后进一步缩小。
- 1440×900 下折叠小析仍可能轻微覆盖模型工具盒；现已进一步贴右侧安全区，E2E 明确断言二者不重叠。

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
- `demo.gif`：标题 → 事故录像 → 案件目标 → 旧样本观察 → 第一次成功 → 两条证据 → 过拟合 → 备用传感器 → 最终修复的短演示。

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

2026-08-09 对提交 `42998dd` 的 GitHub Actions 运行结果为 `success`，上述步骤全部通过。

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
- 同一条 Playwright happy path 使用 `PLAYWRIGHT_BASE_URL=https://siddhartha-yz.github.io/ai-anomaly-bureau/` 对真实部署站点运行通过。
- 生产 E2E 从标题页完整跑到 `CASE CLOSED`。

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

- 已获得至少一轮真实零基础新生定性反馈，并据此重做第一分钟与交互可发现性；尚未完成 5～8 人规模的系统可用性测试。
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
