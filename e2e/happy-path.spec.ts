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
  await expect(page.getByText(/线索 01/)).toBeVisible()
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
  await qaShot(page, '09-first-success')
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.getByRole('button', { name: /还不能确定，应该看看新样本/ }).click()
  await clickGuidePrimary(page)

  await waitForStage(page, 'hidden_test')
  await waitForTransition(page)
  await clickGuidePrimary(page)

  // A real evidence chain now requires two distinct errors plus a short inference.
  await waitForStage(page, 'inspect_errors')
  await expect(page.locator('.test-pixel-group.mistake').first()).toBeVisible()
  await page.locator('.test-pixel-group.mistake').first().click()
  await expect(page.locator('.evidence-console')).toBeInViewport()
  await expect(page.getByText(/已调查 1\/2/)).toBeVisible()
  await page.locator('.evidence-tab').nth(1).click()
  await expect(page.getByText(/已调查 2\/2/)).toBeVisible()
  await qaShot(page, '13-evidence-two')
  await page.getByRole('button', { name: /当前两项信息会把一些猫和面包看得太像/ }).click()
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
  await clickGuidePrimary(page)
  const auditButton = guideSecondary(page)
  await expect(auditButton).toBeEnabled()
  await auditButton.click()
  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByText('先解释这个反常现象')).toBeVisible()
  await qaShot(page, '16-overfit-question')
  await page.getByRole('button', { name: /它太贴着旧样本走/ }).click()
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
  await clickGuidePrimary(page)
  await expect(guideSecondary(page)).toBeEnabled()
  await guideSecondary(page).click()

  await waitForStage(page, 'final_audit')
  await expect(page.getByText('别只看“通过”两个字')).toBeVisible()
  await qaShot(page, '19-final-question')
  await expect(page.locator('.metrics article').nth(1).getByText('100%', { exact: true })).toBeVisible()
  await expect(guidePrimary(page)).toHaveCount(0)
  await page.getByRole('button', { name: /没见过的新样本也稳定/ }).click()
  await expect(page.getByRole('heading', { name: /不是训练满分/ })).toBeVisible()
  await expect(page.getByLabel(/关键线索 4\/4/)).toBeVisible()
  await clickGuidePrimary(page)

  await waitForStage(page, 'transfer_question')
  await waitForTransition(page)
  await page.getByRole('button', { name: '检查新题里的错误案例和数据差异' }).click()
  await page.locator('.transfer-card .action-button.primary').click()

  await waitForStage(page, 'complete')
  await expect(page.getByText('CASE CLOSED', { exact: true })).toBeVisible()
  await expect(page.getByText('你修好的不是一个分数。')).toBeVisible()
  expect(pageErrors).toEqual([])
})
