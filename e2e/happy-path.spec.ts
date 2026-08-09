import { expect, test, type Page } from '@playwright/test'

async function waitForStage(page: Page, stage: string) {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-stage', stage)
}

async function waitForTransition(page: Page) {
  await expect(page.locator('.phase-transition')).toHaveCount(0, { timeout: 5_000 })
}

function guidePrimary(page: Page) {
  return page.locator('.beginner-guide.compact .guide-action .action-button.primary')
}

function guideSecondary(page: Page) {
  return page.locator('.beginner-guide.compact .guide-action .action-button.secondary')
}

async function clickGuidePrimary(page: Page) {
  const button = guidePrimary(page)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
}

async function qaShot(page: Page, name: string) {
  if (!process.env.QA_SHOTS) return
  await page.screenshot({ path: `.tooling/narrative-screens/${name}.png`, fullPage: false })
}

async function chooseEndlessFeatures(page: Page, first: string, second: string) {
  const slots = page.locator('.endless-feature-slots button')
  const inventory = page.locator('.endless-feature-list')
  await slots.nth(0).click()
  await inventory.getByRole('button', { name: new RegExp(first) }).click()
  await slots.nth(1).click()
  await inventory.getByRole('button', { name: new RegExp(second) }).click()
}

async function assertNoOverlap(page: Page, first: string, second: string) {
  const a = await page.locator(first).boundingBox()
  const b = await page.locator(second).boundingBox()
  if (!a || !b) return
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  expect(overlapX * overlapY).toBe(0)
}

test('debug mode keeps the fast engineering controls available', async ({ page }) => {
  await page.goto('?debug=1&seed=20260809')
  await expect(page.getByLabel('开发者测试模式')).toBeVisible()
  await expect(page.locator('.pixel-command-dock .action-button.primary')).toBeVisible()

  const stageSelect = page.getByLabel('开发者测试模式').locator('select').nth(0)
  await stageSelect.selectOption('choose_features')
  await waitForStage(page, 'choose_features')
  await expect(page.locator('.pixel-control')).toBeVisible()
  await expect(page.locator('.pixel-command-dock .action-button.primary')).toBeVisible()

  await stageSelect.selectOption('overfit_reveal')
  await waitForStage(page, 'overfit_reveal')
  await expect(page.locator('.pixel-command-dock .action-button.primary')).toBeVisible()
})

test('zero-background player can investigate the incident and reach CASE CLOSED', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('?seed=20260809')

  // Cold open: the player learns the goal and the visual language before seeing a dashboard.
  const titleAction = page.getByRole('button', { name: /查看事故录像/ })
  await expect(titleAction).toBeVisible()
  await expect(page.getByRole('button', { name: /监督学习 · 无尽调查/ })).toBeVisible()
  await qaShot(page, '00-title')
  await titleAction.click()
  await expect(page.locator('.incident-cold-open')).toBeVisible()
  await qaShot(page, '01-cold-open-cat')
  await expect(page.locator('.cold-open-action')).toHaveCount(1)
  await page.getByRole('button', { name: /这明明是一只猫/ }).click()
  await expect(page.getByText('CONFLICT DETECTED')).toBeVisible()
  await page.getByRole('button', { name: /它到底学错了什么/ }).click()
  await expect(page.getByText('这就是你的案件目标。')).toBeVisible()
  await qaShot(page, '03-cold-open-goal')
  await page.getByRole('button', { name: /接入调查终端/ }).click()

  await waitForStage(page, 'inspect_data')
  await expect(page.getByText('先做一个肉眼判断')).toBeVisible()
  await qaShot(page, '04-observe')
  await expect(page.locator('.model-toolbox')).toHaveCount(0)
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.getByRole('button', { name: /它们大致聚成了两团/ }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await expect(page.getByText(/图里有旧样本“站错了队”/)).toBeVisible()
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.locator('[data-sample-id="train-cat-16"]').click()
  await expect(page.getByText(/旧数据自己就带着噪声/)).toBeVisible()
  await qaShot(page, '05b-sample-hunt')
  await clickGuidePrimary(page)

  // Progressive disclosure: only read the two current sensors; full feature controls are still hidden.
  await waitForStage(page, 'choose_features')
  await expect(page.locator('.sensor-intro')).toBeVisible()
  await qaShot(page, '06-sensors')
  await expect(page.locator('.pixel-control')).toHaveCount(0)
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.locator('.sensor-intro-card').nth(0).click()
  await page.locator('.sensor-intro-card').nth(1).click()
  await expect(page.getByText(/CHANNEL READ:/)).toContainText('2/2')
  await clickGuidePrimary(page)

  await waitForStage(page, 'choose_model')
  const linearCard = page.locator('.pixel-model-card').filter({ hasText: '直线分类器' })
  await expect(linearCard).toBeVisible()
  await expect(guidePrimary(page)).toHaveCount(0)
  await linearCard.click()
  await clickGuidePrimary(page)

  await waitForStage(page, 'train')
  await expect(page.locator('.pixel-control')).toHaveCount(0)
  await clickGuidePrimary(page)
  await waitForStage(page, 'first_success')
  await expect(page.getByText('第一次训练完成')).toBeVisible()
  await expect(page.locator('.model-probe-label')).toHaveText('PROBE ?')
  await qaShot(page, '09-first-success')
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.getByRole('button', { name: '模型会判成：面包' }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await expect(page.getByText(/模型会说什么 ≠ 它真实是什么/)).toBeVisible()
  // Deliberately make the tempting wrong call; the game should let reality disprove it instead of showing an instant red X.
  await page.getByRole('button', { name: /89% 已经足以证明它修好了/ }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await clickGuidePrimary(page)

  await waitForStage(page, 'hidden_test')
  await waitForTransition(page)
  await clickGuidePrimary(page)

  // A real evidence chain now requires two distinct errors plus a short inference.
  await waitForStage(page, 'inspect_errors')
  await expect(page.getByText('临时放行记录')).toBeVisible()
  await qaShot(page, '11b-wrong-call-consequence')
  await expect(page.locator('.test-pixel-group.mistake').first()).toBeVisible()
  await page.locator('.test-pixel-group.mistake').first().click()
  await expect(page.locator('.evidence-console')).toBeInViewport()
  await expect(page.getByText(/已调查 1\/2/)).toBeVisible()
  await page.locator('.evidence-tab').nth(1).click()
  await expect(page.getByText(/已调查 2\/2/)).toBeVisible()
  await qaShot(page, '13-evidence-two')
  await page.getByRole('button', { name: /当前两项信息会把一些猫和面包看得太像/ }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await expect(page.getByText(/线索 02/)).toBeVisible()
  await clickGuidePrimary(page)

  await waitForStage(page, 'iterate')
  await waitForTransition(page)
  await assertNoOverlap(page, '.floating-xiaoxi', '.model-toolbox')
  await expect(page.getByText('做一次极端实验')).toBeVisible()

  // Deliberately take the memorizing path so the player experiences overfitting rather than merely reading about it.
  const k1Card = page.locator('.pixel-model-card').filter({ hasText: 'k=1' })
  await expect(k1Card).toBeVisible()
  await k1Card.click()
  await page.getByRole('button', { name: /旧样本可能满分，但新样本反而更差/ }).click()
  await qaShot(page, '15b-experiment-plan')
  await clickGuidePrimary(page)
  const auditButton = guideSecondary(page)
  await expect(auditButton).toBeEnabled()
  await auditButton.click()
  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByText('先从案件记录里指出异常')).toBeVisible()
  const laterEvidence = page.locator('.evidence-console-head')
  await expect(laterEvidence).toContainText('本轮审计 · 9 个误判')
  await expect(laterEvidence).not.toContainText('已调查')
  // Later audit mistakes remain browsable, but must never continue the earlier 2-item evidence counter.
  await page.locator('.evidence-tab').last().click()
  await expect(laterEvidence).toContainText('本轮审计 · 9 个误判')
  await expect(page.locator('.evidence-tab i').filter({ hasText: 'CHECKED' })).toHaveCount(0)
  await page.locator('.case-attempt-list .case-attempt').last().click()
  await expect(page.getByText('记录找对了，再解释原因')).toBeVisible()
  await qaShot(page, '16-overfit-question')
  await page.getByRole('button', { name: /它太贴着旧样本走/ }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await expect(page.getByRole('heading', { name: '过拟合 / Overfitting' })).toBeVisible()
  await clickGuidePrimary(page)

  await waitForStage(page, 'iterate')
  await expect(page.locator('.phase-transition')).toHaveCount(0)
  await expect(page.locator('.case-attempt')).toHaveCount(2)

  // Repair begins by reading the newly recovered sensor modules, not by opening the whole cockpit at once.
  await expect(page.locator('.repair-sensor-intro')).toBeVisible()
  await qaShot(page, '17b-repair-sensors')
  await expect(page.locator('.pixel-control')).toHaveCount(0)
  await expect(page.locator('.model-toolbox')).toHaveCount(0)
  await page.locator('.repair-sensor-intro .sensor-intro-card').nth(0).click()
  await page.locator('.repair-sensor-intro .sensor-intro-card').nth(1).click()
  await expect(page.locator('.pixel-control')).toBeVisible()
  await expect(page.locator('.model-toolbox')).toBeVisible()

  // Repair using the evidence: change the sensors and return to a simple model.
  await page.locator('.feature-slot').nth(0).click()
  await page.locator('.feature-chip').filter({ hasText: '表面纹理' }).click()
  await page.locator('.feature-slot').nth(1).click()
  await page.locator('.feature-chip').filter({ hasText: '长宽比例' }).click()
  await linearCard.click()
  await qaShot(page, '18-repair-design')
  await page.getByRole('button', { name: /旧样本未必满分，但新样本应该明显改善/ }).click()
  await clickGuidePrimary(page)
  await expect(guideSecondary(page)).toBeEnabled()
  await guideSecondary(page).click()

  await waitForStage(page, 'final_audit')
  await expect(page.getByText('别只看“通过”两个字')).toBeVisible()
  await qaShot(page, '19-final-question')
  await expect(page.locator('.metrics article').nth(1).getByText('100%', { exact: true })).toBeVisible()
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.getByRole('button', { name: /没见过的新样本也稳定/ }).click()
  await page.locator('.investigation-prompt .prompt-commit').click()
  await expect(page.getByRole('heading', { name: /不是训练满分/ })).toBeVisible()
  await expect(page.getByLabel(/关键线索 4\/4/)).toBeVisible()
  await clickGuidePrimary(page)

  await waitForStage(page, 'transfer_question')
  await waitForTransition(page)
  await page.getByRole('button', { name: '检查新题里的错误案例和数据差异' }).click()
  await page.locator('.transfer-lock-step .prompt-commit').click()
  await page.locator('.transfer-lock-step .action-button.primary').click()

  await waitForStage(page, 'complete')
  await expect(page.getByText('CASE CLOSED', { exact: true })).toBeVisible()
  await expect(page.getByLabel('调查评级 A')).toBeVisible()
  await qaShot(page, '21-case-rating')
  await expect(page.getByText('你修好的不是一个分数。')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('endless supervised mode rewards evidence-led experiments over random clicking', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await qaShot(page, '30-endless-start')
  await expect(page.getByText(/审计额度 5/)).toBeVisible()

  // Baseline experiment: deliberately test the weak default sensors.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(1)
  await qaShot(page, '31-endless-first-audit')
  await expect(page.getByText(/审计额度 4/)).toBeVisible()

  // Evidence-led repair: install the stable pair and keep the simple linear model.
  const features = page.locator('.endless-feature-list')
  await features.getByRole('button', { name: /发件人可信度/ }).click()
  await features.getByRole('button', { name: /正文重复度/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(2)
  await qaShot(page, '32-endless-repair')
  await expect(page.getByText(/FIELD AUDIT/)).toBeVisible()

  // A wrong diagnosis cannot be brute-forced into the next option without new evidence.
  await page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText(/不能立刻把四个答案轮流试一遍/)).toBeVisible()
  await page.getByRole('button', { name: '观察特征没有抓住真正差异' }).click()
  await expect(page.getByRole('button', { name: '提交诊断' })).toBeDisabled()

  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(3)
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
  await qaShot(page, '33-endless-solved')
  await expect(page.getByText(/观察特征没有抓住真正差异/)).toBeVisible()

  // Endless means the next case is generated without a reload or backend.
  await page.getByRole('button', { name: '生成下一起案件' }).click()
  await expect(page.getByText(/CASE 6001/)).toBeVisible()
})

test('endless audit budget has a costly recovery path instead of a dead end', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByRole('button', { name: '训练当前方案' }).click()
    await page.getByRole('button', { name: /<60% 翻车/ }).click()
    await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  }
  await expect(page.getByText(/审计额度 0/)).toBeVisible()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await expect(page.getByRole('button', { name: /申请额外审计/ })).toBeVisible()
  await page.getByRole('button', { name: /申请额外审计/ }).click()
  await expect(page.getByText(/审计额度 1/)).toBeVisible()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await expect(page.getByRole('button', { name: /消耗 1 次额度/ })).toBeEnabled()
})

test('endless mode rejects high overall accuracy when a minority class is still missed', async ({ page }) => {
  await page.goto('?mode=endless&seed=6003')
  await expect(page.getByText(/正常日志 40 · 故障日志 4/)).toBeVisible()
  await qaShot(page, '40-imbalance-start')

  // A deceptive tree clears 90% overall but still misses half of the rare faults.
  await chooseEndlessFeatures(page, '突发次数', '错误签名')
  await page.locator('.endless-model-list').getByRole('button', { name: /浅层决策树/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.getByText(/总体分过线了，但至少一类召回仍低于 75%/)).toBeVisible()
  await expect(page.locator('.endless-audit-result .metric-danger')).toHaveCount(1)
  await qaShot(page, '41-imbalance-deceptive-score')

  // A stable pair plus a simple linear rule recovers both classes.
  await chooseEndlessFeatures(page, '错误签名', '时序比例')
  await page.locator('.endless-model-list').getByRole('button', { name: /直线分类器/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.getByText(/总体与两类召回都达到可靠线/)).toBeVisible()

  await page.getByRole('button', { name: /多数类把总体准确率撑高/ }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
})
