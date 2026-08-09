import { expect, test, type Page } from '@playwright/test'
import { endlessSessionKey } from '../src/endless/session'
import { storyAuditCredits, storySessionKey, type StorySessionData } from '../src/game/session'

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

async function citeEndlessRuns(page: Page, ...runNumbers: number[]) {
  for (const runNumber of runNumbers) {
    const label = `引用 E${String(runNumber).padStart(2, '0')}`
    await page.locator('.endless-run-log').getByRole('button', { name: label }).click()
  }
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
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storySessionKey(20260809))).toBeNull()
})

test('endless mode introduces its loop before the player enters the sandbox', async ({ page }) => {
  await page.goto('?seed=20260809')
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await expect(page.getByText(/这里没有固定解法路线/)).toBeVisible()
  await expect(page.getByRole('button', { name: /进行训练案件 000/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /已熟悉流程？直接进入无尽调查/ })).toBeVisible()
  await qaShot(page, '50-endless-intro')
})

test('Boot Case 000 teaches comparison before unlocking formal endless play', async ({ page }) => {
  await page.goto('?mode=boot')
  await expect(page.getByRole('heading', { name: /训练案件 000/ })).toBeVisible()
  await qaShot(page, '51-boot-brief')
  await page.getByRole('button', { name: /复现旧方案/ }).click()
  await page.getByRole('button', { name: /训练旧方案/ }).click()
  await page.getByRole('button', { name: /运行第一次现场审计/ }).click()
  await expect(page.locator('.bootcase-log article')).toHaveCount(1)
  await page.getByRole('button', { name: /建立对照实验/ }).click()
  await page.getByRole('button', { name: /运行对照实验/ }).click()
  await expect(page.locator('.bootcase-log article')).toHaveCount(2)
  await expect(page.locator('.bootcase-log article').nth(0)).toContainText(/链接数量.*感叹号密度|感叹号密度.*链接数量/)
  await expect(page.locator('.bootcase-log article').nth(1)).toContainText(/正文重复度.*发件人可信度|发件人可信度.*正文重复度/)
  await expect(page.locator('.bootcase-log')).toContainText('LINEAR')
  await expect(page.locator('.bootcase-log')).toContainText('TRAIN')
  await expect(page.locator('.bootcase-log')).toContainText('FIELD')
  await qaShot(page, '52-boot-two-runs')
  await page.getByRole('button', { name: /比较两条记录/ }).click()
  await page.getByRole('button', { name: '只改变了观察字段' }).click()
  await page.getByRole('button', { name: '锁定判断' }).click()
  await expect(page.getByText(/控制变量思路/)).toBeVisible()
  await page.getByRole('button', { name: /再学三种常见证据模式/ }).click()

  for (const answer of [
    '模型可能把训练里的偶然噪声也记住了',
    '总体分掩盖了少数类一直漏掉',
    '训练环境和现场环境是不是已经不一样了',
  ]) {
    await page.getByRole('button', { name: answer }).click()
    await page.getByRole('button', { name: '锁定判断' }).click()
    await expect(page.getByText('判断成立。')).toBeVisible()
    await page.locator('.bootcase-feedback.success button').click()
  }

  await expect(page.getByText(/DIAGNOSIS REPORT/)).toBeVisible()
  await page.getByRole('button', { name: /旧方案的观察字段没有抓住真正稳定的差异/ }).click()
  await expect(page.getByText(/只是选中了一个草稿，还没有提交/)).toBeVisible()
  await qaShot(page, '52c-boot-diagnosis-draft')
  await page.getByRole('button', { name: '提交训练诊断' }).click()
  await expect(page.getByText('报告成立。')).toBeVisible()
  await page.getByRole('button', { name: /封存训练案件/ }).click()
  await expect(page.getByText('TRAINING COMPLETE')).toBeVisible()
  await qaShot(page, '53-boot-complete')
  await page.getByRole('button', { name: /进入正式无尽调查/ }).click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await expect(page.getByText(/NEXT OBJECTIVE/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('aia.boot-case-000.v2'))).toBe('complete')

  // Completion is remembered: the next title entry recommends formal play, while replay stays optional.
  await page.goto('?seed=20260809')
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  await expect(page.getByRole('button', { name: /TRAINING COMPLETE.*进入正式无尽调查/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /重玩训练案件 000/ })).toBeVisible()
})

test('formal endless mode exposes facts and next actions without revealing the diagnosis', async ({ page }) => {
  await page.goto('?mode=endless&seed=20260809')
  await expect(page.getByText(/温室最近出现大量病害误报/)).toBeVisible()
  await expect(page.getByText(/把几次脏镜头造成的异常当成了规律/)).toHaveCount(0)
  await expect(page.locator('.endless-reported-facts')).toContainText('档案系统标出了 4 条采集质量异常记录')
  await expect(page.locator('.endless-archive-anomaly-frame')).toHaveCount(4)
  await expect(page.locator('.endless-console .objective-focus')).toHaveCount(0)
  await expect(page.locator('.endless-console .endless-primary.objective-action')).toHaveText('训练当前方案')
  await expect(page.locator('.endless-lead-board')).toContainText(/亲手查看过的事实会记录在这里/)
  await page.getByRole('button', { name: '定位下一步操作' }).click()
  await expect(page.locator('.endless-primary.objective-action')).toBeInViewport()
  // Formal mode exposes measurements, but removes the answer-like feature prose used during development.
  await expect(page.locator('.endless-feature-list button small')).toHaveCount(0)
  const archiveAlert = page.getByRole('button', { name: /查看档案异常 archive-flag-01/ })
  await archiveAlert.focus()
  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      if (event.key === ' ') window.sessionStorage.setItem('archive-space-prevented', String(event.defaultPrevented))
    }, { once: true })
  })
  await page.keyboard.press('Space')
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('archive-space-prevented'))).toBe('true')
  await expect(page.getByLabel('历史档案异常记录')).toContainText(/镜头污染/)
  await expect(page.getByLabel('历史档案异常记录')).toContainText(/需要用实验验证/)
  await expect(page.locator('.endless-lead-board')).toContainText(/已打开档案质量告警 1\/4/)
  await page.getByLabel('历史档案异常记录').getByRole('button', { name: '×' }).click()
  const manualOpener = page.getByRole('button', { name: '调查手册' })
  await manualOpener.click()
  await expect(page.getByRole('heading', { name: '调查手册' })).toBeVisible()
  const manualClose = page.getByRole('button', { name: '关闭调查手册' })
  const manualReturn = page.getByRole('button', { name: '返回案件' })
  await expect(manualClose).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(manualReturn).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(manualClose).toBeFocused()
  await expect(page.getByText(/这不是答案表/)).toBeVisible()
  await expect(page.getByLabel('指标词典')).toContainText('真实属于这一类的样本里，有多少被模型正确找出来')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '调查手册' })).toHaveCount(0)
  await expect(manualOpener).toBeFocused()
  await expect(page.getByText('先建立第一条基线记录')).toBeVisible()
  await qaShot(page, '54-endless-purpose')

  await page.getByRole('button', { name: '训练当前方案' }).click()
  await expect(page.getByText('先预测，再花审计额度验证')).toBeVisible()
  await qaShot(page, '55-endless-predict')
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.getByText('建立一条对照实验')).toBeVisible()
  await expect(page.locator('.endless-lead-board')).toContainText('正式审计 #1')
  await qaShot(page, '56-endless-compare')
})

test('formal endless case briefs expose symptoms without spelling out any diagnosis', async ({ page }) => {
  const cases = [
    { seed: 6000, diagnosis: '观察特征没有抓住真正差异', symptom: /报名邮件|垃圾箱/, shot: '55-feature-gap-brief' },
    { seed: 6001, diagnosis: '模型把训练噪声和偶然点记得太死', symptom: /历史样品|缺陷|传感器|质检/, shot: '56-noise-brief' },
    { seed: 6002, diagnosis: '训练环境与现场环境发生了分布变化', symptom: /白天|夜间|现场|历史/, shot: '57-shift-brief' },
    { seed: 6003, diagnosis: '多数类把总体准确率撑高，少数类却一直漏掉', symptom: /总体准确率|故障|正常日志/, shot: '58-imbalance-brief' },
  ]

  for (const item of cases) {
    await page.goto(`?mode=endless&seed=${item.seed}`)
    const brief = page.locator('.endless-case-brief')
    await expect(brief).toContainText(item.symptom)
    await expect(brief).not.toContainText(item.diagnosis)
    await expect(page.getByLabel('当前调查目标')).toContainText('基线')
    await expect(page.locator('.objective-action')).toHaveCount(1)
    await qaShot(page, item.shot)
  }
})

test('repeating the same endless configuration is replication, not new diagnostic evidence', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')

  for (let repeat = 0; repeat < 2; repeat += 1) {
    await page.getByRole('button', { name: '训练当前方案' }).click()
    await page.getByRole('button', { name: /<60% 翻车/ }).click()
    await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  }

  await expect(page.locator('.endless-run-log article')).toHaveCount(2)
  await expect(page.locator('.endless-run-log article').nth(1)).toContainText('复现实验')
  await expect(page.getByLabel('当前调查目标')).toContainText('继续获取能区分解释的证据')
  await expect(page.locator('.endless-objective-stats')).toContainText('不同配置 1')
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)

  await page.locator('.endless-model-list').getByRole('button', { name: /浅层决策树/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车|60–84% 勉强|≥85% 稳定/ }).first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-objective-stats')).toContainText('不同配置 2')
  await expect(page.locator('.endless-diagnosis')).toBeVisible()

  // Once diagnosis becomes available, citing the two replication runs is still invalid evidence.
  await citeEndlessRuns(page, 1, 2)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('同一配置')
  await expect(page.getByLabel('已引用实验对照')).toContainText('同配置复现')
  await expect(page.getByRole('button', { name: /观察特征没有抓住真正差异/ })).toBeDisabled()
  await page.locator('.endless-run-log').getByRole('button', { name: /已引用 E02/ }).click()
  await citeEndlessRuns(page, 3)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('证据包就绪')
  await expect(page.getByRole('button', { name: /观察特征没有抓住真正差异/ })).toBeEnabled()
})

test('endless investigation survives refresh without refunding audit budget', async ({ page }) => {
  const seed = 6012
  const sessionKey = endlessSessionKey(seed)
  await page.goto(`?mode=endless&seed=${seed}`)
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(1)
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')

  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), sessionKey)).not.toBeNull()
  const persisted = await page.evaluate((key) => window.localStorage.getItem(key) ?? '', sessionKey)
  expect(persisted).toContain('"history"')
  expect(persisted).not.toMatch(/test-cat|test-bread|diagnosis\.correct|"syndrome"/)

  await page.reload()
  await expect(page.getByLabel('已恢复本案进度')).toBeInViewport()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')
  await expect(page.locator('.endless-run-log article')).toHaveCount(1)
  await expect(page.getByText('FIELD AUDIT', { exact: true })).toBeVisible()
  await qaShot(page, '34-endless-session-resumed')

  const resetButton = page.getByRole('button', { name: '重置本案' })
  await resetButton.click()
  await expect(page.getByRole('button', { name: '再次点击确认重置' })).toBeVisible()
  await page.getByRole('button', { name: '再次点击确认重置' }).click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 5')
  await expect(page.locator('.endless-run-log')).toHaveCount(0)
  await expect(page.getByLabel('已恢复本案进度')).toHaveCount(0)
  await expect.poll(() => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw).history.length : -1
  }, sessionKey)).toBe(0)

  await page.reload()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 5')
  await expect(page.locator('.endless-run-log')).toHaveCount(0)
  await expect(page.getByLabel('已恢复本案进度')).toHaveCount(0)
})

test('wrong endless diagnosis remains locked across refresh until fresh evidence is cited', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')

  // Baseline + one controlled field-only repair create two distinct configurations.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await chooseEndlessFeatures(page, '发件人可信度', '正文重复度')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await citeEndlessRuns(page, 1, 2)

  await page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText(/报告已暂时锁定/)).toBeVisible()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 3')

  await page.reload()
  await expect(page.getByLabel('已恢复本案进度')).toBeInViewport()
  await expect(page.getByText(/刚提交：模型把训练噪声和偶然点记得太死/)).toBeVisible()
  await expect(page.getByText(/报告已暂时锁定/)).toBeVisible()
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 3')

  // A genuinely new model-only audit reopens evidence collection, but old E01+E02 still cannot be reused.
  await page.locator('.endless-model-list').getByRole('button', { name: /浅层决策树/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await citeEndlessRuns(page, 1, 2)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('必须包含上次诊断后新增的实验记录')
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await page.locator('.endless-run-log').getByRole('button', { name: /已引用 E02/ }).click()
  await citeEndlessRuns(page, 3)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('证据包就绪')
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeEnabled()
})

test('endless gateway explicitly resumes or abandons a saved investigation', async ({ page }) => {
  const seed = 6020
  await page.goto(`?mode=endless&seed=${seed}`)
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')

  await page.getByRole('button', { name: '返回剧情案件' }).click()
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  const savedCase = page.getByLabel('已保存无尽案件')
  await expect(savedCase).toContainText('UNFINISHED CASE SAVED')
  await expect(savedCase).toContainText('CASE 6020')
  await expect(savedCase).toContainText('1 次正式审计 · 剩余审计额度 4')
  await expect(page.getByRole('button', { name: /继续 CASE 6020/ })).toBeVisible()
  await qaShot(page, '35-endless-gateway-resume')

  await page.getByRole('button', { name: /继续 CASE 6020/ }).click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')
  await expect(page.getByLabel('已恢复本案进度')).toBeVisible()

  await page.getByRole('button', { name: '返回剧情案件' }).click()
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  await page.getByRole('button', { name: '生成一宗全新案件' }).click()
  await expect(page.getByRole('button', { name: /再次点击：放弃旧进度并生成新案件/ })).toBeVisible()
  await page.getByRole('button', { name: /再次点击：放弃旧进度并生成新案件/ }).click()
  await expect(page.getByText(/CASE 6021/)).toBeVisible()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 5')
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), endlessSessionKey(seed))).toBeNull()
})

test('endless onboarding and next-step navigation remain usable across desktop viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('?mode=boot')
    await expect(page.getByRole('heading', { name: /训练案件 000/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true)

    await page.goto('?mode=endless&seed=6000')
    await expect(page.getByLabel('当前调查目标')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true)
    await page.getByRole('button', { name: '定位下一步操作' }).click()
    await expect(page.locator('.objective-action')).toBeInViewport()
  }
})

test('endless onboarding stays operable on a 1280x720 laptop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('?seed=20260809')
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  await expect(page.getByRole('button', { name: /进行训练案件 000/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)

  await page.getByRole('button', { name: /进行训练案件 000/ }).click()
  await expect(page.getByRole('button', { name: /复现旧方案/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)

  await page.goto('?mode=endless&seed=20260809')
  await expect(page.getByLabel('当前调查目标')).toBeVisible()
  await page.getByRole('button', { name: '定位下一步操作' }).click()
  await expect(page.locator('.endless-primary.objective-action')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
})

test('endless cited-evidence workspace stays usable on a 1280x720 laptop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('?mode=endless&seed=6000')

  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await chooseEndlessFeatures(page, '发件人可信度', '正文重复度')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await citeEndlessRuns(page, 1, 2)

  const comparison = page.getByLabel('已引用实验对照')
  await expect(comparison).toBeVisible()
  await expect(comparison).toContainText('只换字段')
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('证据包就绪')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)

  await page.getByRole('button', { name: '定位下一步操作' }).click()
  await expect(page.locator('.endless-diagnosis')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
  await qaShot(page, '36-endless-cited-evidence-1280')
})

test('distribution-shift cases expose batch metadata as facts without naming the diagnosis', async ({ page }) => {
  await page.goto('?mode=endless&seed=6002')
  const metadata = page.getByLabel('历史与现场批次元数据')
  await expect(metadata).toBeVisible()
  await expect(metadata).toContainText('HISTORY BATCH')
  await expect(metadata).toContainText('FIELD BATCH')
  await expect(metadata).not.toContainText(/分布漂移/)
  await expect(page.locator('.endless-case-brief')).not.toContainText(/分布漂移/)
})

test('zero-background player can investigate the incident and reach CASE CLOSED', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('?seed=20260809')

  // Cold open: the player learns the goal and the visual language before seeing a dashboard.
  const titleAction = page.getByRole('button', { name: /查看事故录像/ })
  await expect(titleAction).toBeVisible()
  await expect(page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ })).toBeVisible()
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

  // Story checkpoints preserve revealed evidence and micro-beat progress without serializing private test IDs/flags.
  const storyKey = storySessionKey(20260809)
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storyKey)).not.toBeNull()
  const storyCheckpoint = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  expect(storyCheckpoint).not.toMatch(/test-(cat|bread)/)
  expect(storyCheckpoint).not.toContain('"flags"')
  const firstStorySession = JSON.parse(storyCheckpoint!) as StorySessionData
  expect(firstStorySession.behaviorLog?.events.length).toBeGreaterThan(8)
  const behaviorSessionId = firstStorySession.behaviorLog?.sessionId
  await page.reload()
  await waitForStage(page, 'inspect_errors')
  await expect(page.getByLabel('已恢复剧情案件进度')).toBeVisible()
  await expect(page.getByText(/已调查 2\/2/)).toBeVisible()
  await expect(page.getByText(/线索 02/)).toBeVisible()
  await expect(page.locator('.phase-transition')).toHaveCount(0)
  await qaShot(page, '22-story-session-restored')
  await page.getByLabel('已恢复剧情案件进度').getByRole('button', { name: '知道了' }).click()
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
  const overfitCheckpoint = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  expect(storyAuditCredits(JSON.parse(overfitCheckpoint!) as StorySessionData)).toBe(3)
  await page.reload()
  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByLabel('已恢复剧情案件进度')).toBeVisible()
  await expect(page.locator('.case-attempt')).toHaveCount(2)
  const restoredOverfitCheckpoint = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  const overfitStorySession = JSON.parse(restoredOverfitCheckpoint!) as StorySessionData
  expect(storyAuditCredits(overfitStorySession)).toBe(3)
  expect(overfitStorySession.behaviorLog?.sessionId).toBe(behaviorSessionId)
  expect(overfitStorySession.behaviorLog!.events.length).toBeGreaterThan(firstStorySession.behaviorLog!.events.length)
  await page.getByLabel('已恢复剧情案件进度').getByRole('button', { name: '知道了' }).click()
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

  const completedCheckpointRaw = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  expect(completedCheckpointRaw).not.toBeNull()
  expect(completedCheckpointRaw!.length).toBeLessThan(100_000)
  expect(completedCheckpointRaw).not.toMatch(/test-(cat|bread)/)
  expect(completedCheckpointRaw).not.toContain('"flags"')
  const completedCheckpoint = JSON.parse(completedCheckpointRaw!) as StorySessionData
  expect(completedCheckpoint.behaviorLog?.events.filter((event) => event.action === 'COMPLETE')).toHaveLength(1)

  await page.reload()
  await waitForStage(page, 'complete')
  await expect(page.getByLabel('已恢复剧情案件进度')).toBeVisible()
  await expect(page.getByText('CASE CLOSED', { exact: true })).toBeVisible()
  await expect(page.getByLabel('调查评级 A')).toBeVisible()
  await expect(page.locator('.phase-transition')).toHaveCount(0)
  const reopenedCompletedCheckpointRaw = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  const reopenedCompletedCheckpoint = JSON.parse(reopenedCompletedCheckpointRaw!) as StorySessionData
  expect(reopenedCompletedCheckpoint.behaviorLog?.sessionId).toBe(completedCheckpoint.behaviorLog?.sessionId)
  expect(reopenedCompletedCheckpoint.behaviorLog?.events.filter((event) => event.action === 'COMPLETE')).toHaveLength(1)
  await page.getByLabel('已恢复剧情案件进度').getByRole('button', { name: '知道了' }).click()

  // Explicit restart is the escape hatch from persistence: it must delete the checkpoint and return to a fresh title.
  await page.getByRole('button', { name: '重新调查一次' }).click()
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storyKey)).toBeNull()
})

test('endless supervised mode rewards evidence-led experiments over random clicking', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await qaShot(page, '30-endless-start')
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 5')

  // Baseline experiment: deliberately test the weak default sensors.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(1)
  await expect(page.getByLabel('指标读法')).toContainText('某一类真实样本中，被模型正确识别出来的比例')
  await expect(page.getByLabel('当前实验计划对照')).toContainText('复现实验')
  await qaShot(page, '31-endless-first-audit')
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')

  // Returned audit mistakes are investigation objects, not passive cards.
  const firstFieldError = page.getByRole('button', { name: /调查现场误判 field-/ }).first()
  await expect(firstFieldError).toBeVisible()
  const firstFieldErrorName = await firstFieldError.getAttribute('aria-label')
  await firstFieldError.click()
  await expect(page.locator('.endless-field-sample.selected')).toHaveCount(1)
  await expect(page.locator('.endless-field-error-selected')).toBeInViewport()
  await expect(page.getByLabel('现场误判调查记录')).toBeVisible()
  await expect(page.getByLabel('现场误判调查记录')).toContainText(/ACTUAL/)
  await expect(page.getByLabel('现场误判调查记录')).toContainText(/PREDICTED/)
  await expect(page.locator('.endless-lead-board')).toContainText('已检查现场误判')
  if (firstFieldErrorName) await expect(page.locator('.endless-lead-board')).toContainText(firstFieldErrorName.split(' ').at(-1)!.toUpperCase())
  await qaShot(page, '31b-endless-field-error')

  // Evidence-led repair: install the stable pair and keep the simple linear model.
  const features = page.locator('.endless-feature-list')
  await features.getByRole('button', { name: /发件人可信度/ }).click()
  await expect(page.getByLabel('现场误判调查记录')).toHaveCount(0)
  await expect(page.locator('.endless-lead-board')).toContainText('已检查现场误判')
  await features.getByRole('button', { name: /正文重复度/ }).click()
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换字段')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(2)
  await expect(page.locator('.endless-run-log article').nth(1)).toHaveAttribute('data-delta', 'fields-only')
  await expect(page.locator('.endless-run-log article').nth(1)).toContainText('只换字段')
  await qaShot(page, '32-endless-repair')
  await expect(page.getByText(/FIELD AUDIT/)).toBeVisible()

  // Diagnosis is not available merely because two configurations exist: the player must cite both records.
  await expect(page.getByLabel('当前调查目标')).toContainText('从实验记录引用两条证据')
  await expect(page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' })).toBeDisabled()
  await citeEndlessRuns(page, 1, 2)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('证据包就绪')
  const citedComparison = page.getByLabel('已引用实验对照')
  await expect(citedComparison).toContainText('只换字段')
  await expect(citedComparison).toContainText('FIELDS')
  await expect(citedComparison).toContainText('MODEL')
  await expect(citedComparison).toContainText('FIELD')
  await expect(citedComparison).not.toContainText('观察特征没有抓住真正差异')
  await expect(page.getByLabel('当前调查目标')).toContainText('证据包已就绪')
  await expect(page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' })).toBeEnabled()
  await qaShot(page, '32b-endless-cited-evidence')

  // A wrong diagnosis cannot be brute-forced into the next option without new evidence.
  await page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText(/刚提交：模型把训练噪声和偶然点记得太死/)).toBeVisible()
  await expect(page.getByText(/当前证据不支持这项病因判断/)).toBeVisible()
  await expect(page.getByText(/原样复现不会提供新的区分证据/)).toBeVisible()
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '提交诊断' })).toBeDisabled()

  // Repeating the exact same setup is useful for reproducibility, but it does not unlock a changed diagnosis.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(3)
  await expect(page.locator('.endless-run-log article').nth(2)).toHaveAttribute('data-delta', 'repeat')
  await expect(page.getByRole('button', { name: '提交诊断' })).toBeDisabled()

  // A controlled model-only comparison produces genuinely new evidence and reopens the report.
  await page.locator('.endless-model-list').getByRole('button', { name: /浅层决策树/ }).click()
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换模型')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(4)
  await expect(page.locator('.endless-run-log article').nth(3)).toHaveAttribute('data-delta', 'model-only')
  await expect(page.getByText(/已获得新的实验配置/)).toBeVisible()
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await citeEndlessRuns(page, 2, 4)
  await expect(page.getByLabel('已引用实验对照')).toContainText('只换模型')
  await expect(page.getByText(/新证据已经写入报告/)).toBeVisible()
  await page.getByRole('button', { name: '观察特征没有抓住真正差异' }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
  await expect(page.getByLabel('当前调查目标')).toHaveCount(0)
  await qaShot(page, '33-endless-solved')
  await expect(page.getByText(/观察特征没有抓住真正差异/)).toBeVisible()
  const closureReport = page.getByLabel('无尽案件结案报告')
  await expect(closureReport).toContainText('FINAL CONFIG')
  await expect(closureReport).toContainText(/单变量对照/)
  await expect(closureReport).toContainText('EVIDENCE CHAIN')
  await expect(closureReport).toContainText('E02 + E04')
  await expect(closureReport).toContainText('只换模型')
  await expect(closureReport).toContainText('FIELD INSPECTION')
  await expect(closureReport).toContainText('1 条误判复核')
  await expect(page.getByText(/实验设计：2 次单变量对照/)).toBeVisible()

  // A solved local session is explicit at the gateway and can reopen the same closure dossier.
  await page.getByRole('button', { name: '返回剧情案件' }).click()
  await page.getByRole('button', { name: /已熟悉流程？进入无尽调查/ }).click()
  const resolvedSavedCase = page.getByLabel('已保存无尽案件')
  await expect(resolvedSavedCase).toContainText('RESOLVED CASE SAVED')
  await expect(resolvedSavedCase).toContainText('CASE 6000')
  await page.getByRole('button', { name: /查看 CASE 6000 结案报告/ }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
  await expect(page.getByLabel('无尽案件结案报告')).toContainText('E02 + E04')

  // Endless still means the next case is generated without a backend.
  await page.getByRole('button', { name: '生成下一起案件' }).click()
  await expect(page.getByText(/CASE 6001/)).toBeVisible()
})

test('endless audit budget has a costly recovery path instead of a dead end', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')

  // Create two genuinely different configurations so a diagnosis is valid, then spend the remaining credits on replication.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await chooseEndlessFeatures(page, '发件人可信度', '正文重复度')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole('button', { name: '训练当前方案' }).click()
    await page.getByRole('button', { name: /≥85% 稳定/ }).click()
    await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  }
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 0')
  await citeEndlessRuns(page, 1, 2)
  await page.getByRole('button', { name: '模型把训练噪声和偶然点记得太死' }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText(/刚提交：模型把训练噪声和偶然点记得太死/)).toBeVisible()
  const diagnosisRecovery = page.locator('.endless-diagnosis').getByRole('button', { name: /申请 1 次补充审计/ })
  await expect(diagnosisRecovery).toBeVisible()
  await expect(page.getByLabel('当前调查目标')).toContainText(/诊断要改口，但审计额度已经耗尽/)
  await expect(page.getByRole('button', { name: '定位下一步操作' })).toContainText('定位：补充审计')
  await page.getByRole('button', { name: '定位下一步操作' }).click()
  await expect(diagnosisRecovery).toBeInViewport()
  await diagnosisRecovery.click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 1')
  await expect(page.getByRole('button', { name: '提交诊断' })).toBeDisabled()
  // Recovery must collect a genuinely new configuration; another replication would keep the report locked.
  await page.locator('.endless-model-list').getByRole('button', { name: /浅层决策树/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定|60–84% 勉强|<60% 翻车/ }).first().click()
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
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('故障日志召回 FAIL')
  await expect(page.locator('.endless-audit-result .metric-danger')).toHaveCount(1)
  await qaShot(page, '41-imbalance-deceptive-score')

  // A stable pair plus a simple linear rule recovers both classes.
  await chooseEndlessFeatures(page, '错误签名', '时序比例')
  await page.locator('.endless-model-list').getByRole('button', { name: /直线分类器/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('正常日志召回 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('故障日志召回 PASS')

  await citeEndlessRuns(page, 1, 2)
  await page.getByRole('button', { name: /多数类把总体准确率撑高/ }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
})
