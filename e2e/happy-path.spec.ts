import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { STORY_CASE_001, TRAINING_CASE_000 } from '../src/bureau/catalog'
import { BUREAU_PROGRESS_KEY, createBureauProgress, recordDutyResolution, recordFormalCaseResolution, recordTrainingCaseCompletion } from '../src/bureau/progress'
import { endlessSessionKey } from '../src/endless/session'
import { createStoryCheatSession } from '../src/game/cheats'
import type { BehaviorLog } from '../src/game/logging'
import { createInitialGameState } from '../src/game/reducer'
import { STORY_SESSION_VERSION, storyAuditCredits, storySessionKey, writeStorySession, type StorySessionData } from '../src/game/session'
import { QA_BACKUP_KEY } from '../src/qa/testBench'

function serializeStoryCheckpoint(checkpoint: StorySessionData) {
  let payload: string | undefined
  const storage = {
    getItem: () => null,
    setItem: (_key: string, value: string) => { payload = value },
    removeItem: () => {},
  }
  expect(writeStorySession(storage as unknown as Storage, checkpoint)).toBe(true)
  if (!payload) throw new Error('Story checkpoint writer produced no payload')
  return payload
}

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

function bureauDepartment(page: Page, name: RegExp) {
  return page.getByRole('navigation', { name: '调查局部门' }).getByRole('button', { name })
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

async function inspectCausalLead(page: Page, name: RegExp) {
  await page.getByLabel('因果线索来源').getByRole('button', { name }).click()
}

async function assertNoOverlap(page: Page, first: string, second: string) {
  const a = await page.locator(first).boundingBox()
  const b = await page.locator(second).boundingBox()
  if (!a || !b) return
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  expect(overlapX * overlapY).toBe(0)
}

test('cheat terminal jumps into a real Story checkpoint instead of a debug-only UI', async ({ page }) => {
  const seed = 20260809
  const storyKey = storySessionKey(seed)
  // Legacy ?debug=1 is intentionally inert: it must still show the formal Story entry.
  await page.goto(`?debug=1&seed=${seed}`)
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect(page.getByLabel('开发者测试模式')).toHaveCount(0)
  await page.keyboard.press('Backquote')
  const terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await expect(terminal).toBeVisible()
  await qaShot(page, '60-cheat-terminal')
  await terminal.getByLabel('ACCESS CODE').fill('CASE001 OVERFIT')
  await terminal.getByRole('button', { name: '执行' }).click()

  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByText('先从案件记录里指出异常')).toBeVisible()
  await expect(page.locator('.case-attempt')).toHaveCount(2)
  await expect(page.locator('.case-attempt').last()).toContainText('K近邻 · k=1')
  await expect(page.getByLabel('开发者测试模式')).toHaveCount(0)

  const checkpointRaw = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  expect(checkpointRaw).not.toBeNull()
  const checkpoint = JSON.parse(checkpointRaw!) as StorySessionData
  expect(checkpoint.state.stage).toBe('overfit_reveal')
  expect(checkpoint.experimentLog).toHaveLength(2)
  expect(checkpoint.state.hasSeenOverfit).toBe(true)
  expect(storyAuditCredits(checkpoint)).toBe(3)
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), QA_BACKUP_KEY)).not.toBeNull()
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toContainText('SAVE SAFE')

  // The cheat produced a normal persisted case: a refresh uses the ordinary resume gateway.
  await page.reload()
  const resume = page.getByLabel('已保存剧情案件')
  await expect(resume).toContainText('UNFINISHED CASE SAVED')
  await expect(resume.getByLabel('剧情案件存档摘要')).toContainText('发现陷阱')
})

test('cheat terminal opens Bureau, Training, and seeded Duty through official modes', async ({ page }) => {
  await page.goto('?seed=20260809')
  await page.keyboard.press('Control+Shift+K')
  let terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await terminal.getByLabel('ACCESS CODE').fill('BUREAU UNLOCK')
  await terminal.getByRole('button', { name: '执行' }).click()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  await expect(page.getByLabel('正式调查员权限已开放')).toHaveCount(0)
  await expect(page.getByText('A · 100/100')).toBeVisible()
  const closedStoryRaw = await page.evaluate((key) => window.localStorage.getItem(key), storySessionKey(20260809))
  expect(JSON.parse(closedStoryRaw!) as StorySessionData).toMatchObject({ state: { stage: 'complete' } })

  await page.keyboard.press('Backquote')
  terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await terminal.getByLabel('ACCESS CODE').fill('TRAINING')
  await terminal.getByRole('button', { name: '执行' }).click()
  await expect(page.getByRole('heading', { name: /训练案件 000/ })).toBeVisible()

  await page.keyboard.press('Backquote')
  terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await terminal.getByLabel('ACCESS CODE').fill('DUTY 6003')
  await terminal.getByRole('button', { name: '执行' }).click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await expect(page.getByLabel('待复核因果线索')).toContainText('3 SOURCES SEALED')
  await expect(page.locator('.endless-case-brief')).not.toContainText(/正常日志 40|故障日志 4/)
})

test('QA Test Bench protects normal saves across Story and Duty jumps, then restores them exactly', async ({ page }) => {
  const normalProgress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 100)
  normalProgress.inductionAcknowledged = true
  const normalStory = serializeStoryCheckpoint(createStoryCheatSession('closed', 20260809))
  await page.goto('?mode=hub&seed=20260809')
  await page.evaluate(([progressKey, progressValue, storyKey, storyValue]) => {
    window.localStorage.setItem(progressKey, progressValue)
    window.localStorage.setItem(storyKey, storyValue)
  }, [BUREAU_PROGRESS_KEY, JSON.stringify(normalProgress), storySessionKey(20260809), normalStory])
  await page.reload()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()

  const originalUrl = page.url()
  const originalStorage = await page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('aia.') && key !== 'aia.qa-backup.v1')
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ))
  expect(Object.keys(originalStorage)).toContain(BUREAU_PROGRESS_KEY)
  expect(Object.keys(originalStorage)).toContain(storySessionKey(20260809))

  await page.keyboard.press('Control+Shift+K')
  let terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await terminal.getByLabel('QA 测试工作台').getByRole('button', { name: /CASE 001 · 过拟合/ }).click()
  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toContainText('SAVE SAFE')
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), QA_BACKUP_KEY)).not.toBeNull()

  const qaStoryRaw = await page.evaluate((key) => window.localStorage.getItem(key), storySessionKey(20260809))
  expect((JSON.parse(qaStoryRaw!) as StorySessionData).state.stage).toBe('overfit_reveal')

  await page.getByRole('button', { name: '打开 QA 测试工作台' }).click()
  terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await terminal.getByLabel('QA 测试工作台').getByRole('button', { name: /DUTY · Shift/ }).click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await expect(page.getByText('SEED 6006')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toBeVisible()

  await page.getByRole('button', { name: '打开 QA 测试工作台' }).click()
  terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await expect(terminal.getByLabel('QA 测试工作台')).toContainText(/正式存档已备份/)
  await terminal.getByRole('button', { name: /恢复原存档并结束测试/ }).click()
  await expect(page).toHaveURL(originalUrl)
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()

  const restoredStorage = await page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('aia.') && key !== 'aia.qa-backup.v1')
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ))
  expect(restoredStorage).toEqual(originalStorage)
  expect(await page.evaluate((key) => window.localStorage.getItem(key), QA_BACKUP_KEY)).toBeNull()
  expect(await page.evaluate((key) => window.localStorage.getItem(key), endlessSessionKey(6006))).toBeNull()
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toHaveCount(0)
})

test('qa=1 exposes a visible Test Bench launcher while normal player URLs remain clean', async ({ page }) => {
  await page.goto('?seed=20260809')
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toHaveCount(0)

  await page.goto('?seed=20260809&qa=1')
  const launcher = page.getByRole('button', { name: '打开 QA 测试工作台' })
  await expect(launcher).toBeVisible()
  await expect(launcher).toContainText('QA BENCH')
  await expect(launcher).toContainText('OPEN')
  await launcher.click()
  const terminal = page.getByRole('dialog', { name: '作弊码终端' })
  await expect(terminal.getByLabel('QA 测试工作台')).toBeVisible()
  await expect(terminal).toContainText('一键跳转，不污染正常存档')
  await terminal.getByLabel('任意 DUTY SEED').fill('7421')
  await terminal.getByRole('button', { name: '打开指定 Duty' }).click()
  await expect(page).toHaveURL(/mode=endless&seed=7421/)
  await expect(page.getByText('SEED 7421')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 QA 测试工作台' })).toContainText('SAVE SAFE')
})

test('Bureau Hub turns solved content into one persistent investigation workspace', async ({ page }) => {
  let progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 91, new Date('2026-08-10T01:00:00Z'))
  progress = recordTrainingCaseCompletion(progress, TRAINING_CASE_000.id, new Date('2026-08-10T01:10:00Z'))
  progress = recordDutyResolution(progress, {
    seed: 6101,
    syndrome: 'overfit-noise',
    grade: 'A',
    score: 90,
    resolvedAt: '2026-08-10T01:20:00.000Z',
  })

  const closedStory = serializeStoryCheckpoint(createStoryCheatSession('closed', 6101))
  await page.goto('?mode=hub&seed=6101')
  await page.evaluate(([progressKey, progressValue, storyKey, storyValue]) => {
    window.localStorage.setItem(progressKey, progressValue)
    window.localStorage.setItem(storyKey, storyValue)
  }, [BUREAU_PROGRESS_KEY, JSON.stringify(progress), storySessionKey(6101), closedStory])
  await page.reload()

  const hub = page.getByLabel('AI异常调查局主页')
  await expect(hub).toBeVisible()
  await expect(page.getByLabel('正式调查员权限已开放')).toBeVisible()
  await qaShot(page, '49-bureau-induction')
  await page.getByRole('button', { name: '接收调查员证件' }).click()
  await expect(page.getByLabel('正式调查员权限已开放')).toHaveCount(0)
  await expect(page.getByLabel('调查员状态')).toContainText('正式调查员')
  await expect(hub).toContainText('1 CLOSED')
  await expect(page.getByText('失控的分类器')).toBeVisible()
  await expect(page.getByText('A · 91/100')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开结案案卷' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storySessionKey(6101))).not.toBeNull()
  const shiftPriority = page.getByLabel('当前值班优先级')
  await expect(shiftPriority).toContainText('陌生故障档案 1 / 4')
  await qaShot(page, '54-bureau-shift-priority')
  await shiftPriority.getByRole('button', { name: '查看值班报告' }).click()
  await expect(bureauDepartment(page, /值班室/)).toHaveAttribute('aria-pressed', 'true')
  await qaShot(page, '50-bureau-hub')

  await bureauDepartment(page, /调查档案/).click()
  await expect(page.getByText('训练集 / 未知样本')).toBeVisible()
  await expect(page.getByText('过拟合', { exact: true })).toBeVisible()
  await expect(page.getByText('????????').first()).toBeVisible()
  await qaShot(page, '51-bureau-archive')

  await bureauDepartment(page, /训练中心/).click()
  await expect(page.getByText('训练案件 000 · 对照实验')).toBeVisible()
  await expect(page.getByText('CLEARED')).toBeVisible()
  await page.getByRole('button', { name: '重新进行训练案件' }).click()
  await expect(page.getByRole('heading', { name: /训练案件 000/ })).toBeVisible()
  await page.getByRole('button', { name: '退出训练' }).click()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  await expect(bureauDepartment(page, /训练中心/)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('训练案件 000 · 对照实验')).toBeVisible()

  await bureauDepartment(page, /值班室/).click()
  await expect(page.getByText('监督学习 · 值班系统')).toBeVisible()
  await expect(page.getByText('CASE 6101 · A')).toBeVisible()
  await expect(page.getByLabel('待接异常报告')).not.toContainText('CASE 6101')
  await qaShot(page, '52-bureau-duty')
  await page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' }).first().click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回调查局' })).toBeVisible()
  await page.getByRole('button', { name: '返回调查局' }).click()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  await expect(bureauDepartment(page, /值班室/)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('监督学习 · 值班系统')).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storySessionKey(6101))).not.toBeNull()

  await bureauDepartment(page, /案件板/).click()
  await expect(page.getByRole('button', { name: '打开结案案卷' })).toBeVisible()
  await page.getByRole('button', { name: '打开结案案卷' }).click()
  await waitForStage(page, 'complete')
  await expect(page.getByText('CASE CLOSED', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回调查局', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回调查局', exact: true }).click()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
})

test('Bureau recovers valid legacy progress when the newer v2 payload is corrupted', async ({ page }) => {
  const legacyProgress = {
    version: 1,
    inductionAcknowledged: true,
    story001: { resolved: true, bestGrade: 'B', bestScore: 82, resolvedAt: '2026-08-10T01:00:00.000Z' },
    bootCase000: { completed: true, completedAt: '2026-08-10T01:10:00.000Z' },
    duty: { resolutions: [] },
  }

  await page.goto('?mode=hub&seed=6300')
  await page.evaluate(([v2Key, v1Value]) => {
    window.localStorage.setItem(v2Key, '{broken-v2-json')
    window.localStorage.setItem('aia.bureau-progress.v1', v1Value)
  }, [BUREAU_PROGRESS_KEY, JSON.stringify(legacyProgress)])
  await page.reload()

  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  await expect(page.getByLabel('调查员状态')).toContainText('正式调查员')
  await expect(page.getByText('B · 82/100')).toBeVisible()
  await bureauDepartment(page, /训练中心/).click()
  await expect(page.getByText('CLEARED')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('aia.bureau-progress.v1'))).toBeNull()
  const migratedRaw = await page.evaluate((key) => window.localStorage.getItem(key), BUREAU_PROGRESS_KEY)
  expect(JSON.parse(migratedRaw!)).toMatchObject({
    version: 2,
    formalCases: { [STORY_CASE_001.id]: { resolved: true, bestGrade: 'B', bestScore: 82 } },
    trainingCases: { [TRAINING_CASE_000.id]: { completed: true } },
  })
})

test('a first-time trainee still enters through Case 001 instead of an empty meta menu', async ({ page }) => {
  await page.goto('?seed=20260809')
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect(page.getByLabel('AI异常调查局主页')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /OFFICE \/ 返回调查局/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /进入无尽调查/ })).toHaveCount(0)
})

test('Bureau Hub remains operable on a 1280x720 laptop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
  progress.inductionAcknowledged = true
  await page.goto('?mode=hub&seed=6200')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [BUREAU_PROGRESS_KEY, JSON.stringify(progress)])
  await page.reload()

  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
  const priority = page.getByLabel('当前值班优先级')
  const departmentNav = page.getByRole('navigation', { name: '调查局部门' })
  await expect(priority).toContainText('训练中心有一份推荐练习')
  await priority.getByRole('button', { name: '前往训练中心' }).click()
  await expect(departmentNav.getByRole('button', { name: /训练中心/ })).toHaveAttribute('aria-pressed', 'true')
  for (const section of [/案件板/, /训练中心/, /调查档案/, /值班室/]) {
    await departmentNav.getByRole('button', { name: section }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
  }
  await expect(page.getByLabel('待接异常报告')).toBeVisible()
  await expect(page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' })).toHaveCount(3)
})

test('Story resume gateway preserves or explicitly discards a saved case', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const seed = 20260819
  const key = storySessionKey(seed)
  const checkpoint: StorySessionData = {
    version: STORY_SESSION_VERSION,
    seed,
    state: { ...createInitialGameState(seed, 1), stage: 'inspect_data' },
    entryPhase: 'game',
    sensorReads: [],
    repairSensorReads: [],
    modelConfirmed: false,
    experimentLog: [],
    emergencyAudits: 0,
    reasoningMisses: 0,
  }

  await page.goto(`?seed=${seed}`)
  await page.evaluate(([storageKey, payload]) => window.localStorage.setItem(storageKey, payload), [key, JSON.stringify(checkpoint)])
  await page.reload()

  const gateway = page.getByLabel('已保存剧情案件')
  await expect(gateway).toContainText('UNFINISHED CASE SAVED')
  await expect(gateway).toContainText('翻旧样本档案')
  await expect(gateway).toContainText('LOCAL ONLY')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
  await qaShot(page, '23-story-resume-gateway')

  // Duty access is a post-induction privilege; an unfinished trainee case cannot jump into Endless from this gateway.
  await expect(gateway.getByRole('button', { name: '暂不继续 · 进入无尽调查' })).toHaveCount(0)
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull()

  // Discard is intentionally two-step: the first click only arms the destructive action.
  await page.getByRole('button', { name: '放弃旧进度并重新开始 CASE 001' }).click()
  await expect(page.getByRole('button', { name: '再次点击：清除旧进度并重新开始' })).toBeVisible()
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull()
  await page.getByRole('button', { name: '再次点击：清除旧进度并重新开始' }).click()
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBeNull()

  // The in-game compact RESET uses the same safety principle: first click arms, second click clears.
  await page.evaluate(([storageKey, payload]) => window.localStorage.setItem(storageKey, payload), [key, JSON.stringify(checkpoint)])
  await page.reload()
  await page.getByRole('button', { name: '继续上次调查' }).click()
  await waitForStage(page, 'inspect_data')
  await page.getByRole('button', { name: '重新开始' }).click()
  await expect(page.getByRole('button', { name: '再次点击确认重新开始' })).toBeVisible()
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull()
  await page.getByRole('button', { name: '再次点击确认重新开始' }).click()
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBeNull()
})

test('Story warns when local checkpoint writes fail and clears the warning after recovery', async ({ page }) => {
  const seed = 20260829
  const key = storySessionKey(seed)
  const checkpoint: StorySessionData = {
    version: STORY_SESSION_VERSION,
    seed,
    state: { ...createInitialGameState(seed, 1), stage: 'inspect_data' },
    entryPhase: 'game',
    sensorReads: [],
    repairSensorReads: [],
    modelConfirmed: false,
    experimentLog: [],
    emergencyAudits: 0,
    reasoningMisses: 0,
  }

  await page.goto(`?seed=${seed}`)
  await page.evaluate(([storageKey, payload]) => window.localStorage.setItem(storageKey, payload), [key, JSON.stringify(checkpoint)])
  await page.reload()
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __storySetItem?: Storage['setItem'] }
    runtimeWindow.__storySetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function blockedStorySave(storageKey: string, value: string) {
      if (storageKey.startsWith('aia.story-session.')) throw new DOMException('blocked for test', 'QuotaExceededError')
      return runtimeWindow.__storySetItem!.call(this, storageKey, value)
    }
  })
  await page.getByRole('button', { name: '继续上次调查' }).click()
  await waitForStage(page, 'inspect_data')
  await expect(page.getByRole('alert')).toContainText('LOCAL SAVE FAILED')
  await expect(page.getByRole('alert')).toContainText('当前进度不会自动保存')
  await assertNoOverlap(page, '.story-session-save-warning', '.pixel-objective-strip')
  await assertNoOverlap(page, '.story-session-save-warning', '.beginner-guide.compact')
  await qaShot(page, '24-story-save-failed')
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull()

  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __storySetItem?: Storage['setItem'] }
    Storage.prototype.setItem = runtimeWindow.__storySetItem!
    delete runtimeWindow.__storySetItem
  })
  await page.getByRole('button', { name: '重试本地保存' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull()
})

test('endless mode introduces its loop before the player enters the sandbox', async ({ page }) => {
  const progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
  progress.inductionAcknowledged = true
  await page.goto('?mode=hub&seed=20260809')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [BUREAU_PROGRESS_KEY, JSON.stringify(progress)])
  await page.reload()
  await bureauDepartment(page, /值班室/).click()
  await page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' }).first().click()
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
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('aia.boot-case-000.v2'))).toBeNull()

  // Training knowledge persists, but normal Duty access still waits for formal induction through CASE 001.
  const bureauRaw = await page.evaluate((key) => window.localStorage.getItem(key), BUREAU_PROGRESS_KEY)
  expect(JSON.parse(bureauRaw!).trainingCases[TRAINING_CASE_000.id].completed).toBe(true)
  await page.goto('?seed=20260809')
  await expect(page.getByRole('button', { name: /进入无尽调查/ })).toHaveCount(0)
  await page.goto('?mode=hub&seed=20260809')
  await bureauDepartment(page, /训练中心/).click()
  await expect(page.getByText('CLEARED')).toBeVisible()
  await expect(bureauDepartment(page, /值班室/)).toBeDisabled()
})

test('formal endless mode seals cause fingerprints until the player reproduces the incident and opens a lead', async ({ page }) => {
  await page.goto('?mode=endless&seed=20260809')
  await expect(page.getByText(/温室最近出现大量病害误报/)).toBeVisible()
  await expect(page.getByText(/把几次脏镜头造成的异常当成了规律/)).toHaveCount(0)
  await expect(page.getByLabel('待复核因果线索')).toContainText('3 SOURCES SEALED')
  await expect(page.locator('.endless-case-brief')).not.toContainText(/4 条|镜头污染|HISTORY|FIELD BATCH/)
  await expect(page.locator('.endless-archive-anomaly-frame')).toHaveCount(0)
  const causalLeads = page.getByLabel('因果线索来源')
  await expect(causalLeads.getByRole('button')).toHaveCount(3)
  for (const button of await causalLeads.getByRole('button').all()) await expect(button).toBeDisabled()

  await expect(page.locator('.endless-console .objective-focus')).toHaveCount(0)
  await expect(page.locator('.endless-console .endless-primary.objective-action')).toHaveText('训练当前方案')
  await page.getByRole('button', { name: '定位下一步操作' }).click()
  await expect(page.locator('.endless-primary.objective-action')).toBeInViewport()
  // Formal mode exposes the raw matrix but does not pre-rank sensors for the player.
  await expect(page.locator('.endless-feature-list button small')).toHaveCount(0)
  await expect(page.locator('.endless-feature-list')).not.toContainText(/旧差异|现场变化|[0-5]\/5/)
  await expect(page.locator('.sensor-evidence-help')).toContainText(/不会预先替字段打分/)

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
  await expect(manualOpener).toBeFocused()
  await expect(page.getByText('先建立第一条基线记录')).toBeVisible()
  await qaShot(page, '54-endless-purpose')

  await page.getByRole('button', { name: '训练当前方案' }).click()
  await expect(page.getByText('先预测，再花审计额度验证')).toBeVisible()
  await qaShot(page, '55-endless-predict')
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.getByLabel('当前调查目标')).toContainText('先决定查哪一种原因')
  await expect(page.getByLabel('竞争假设')).toContainText('H-FIELDS')
  await expect(page.getByLabel('竞争假设')).toContainText('H-MODEL')
  await expect(page.getByLabel('竞争假设')).toContainText('OPEN')
  await expect(page.locator('.endless-lead-board')).toContainText('正式审计 #1')
  for (const button of await causalLeads.getByRole('button').all()) await expect(button).toBeEnabled()

  await inspectCausalLead(page, /历史质量记录/)
  await expect(causalLeads).toContainText('质量系统标出了 4 条需要人工复核的历史记录')
  await expect(page.getByLabel('当前调查目标')).toContainText('让两个解释真正分叉')
  await expect(page.locator('.endless-archive-anomaly-frame')).toHaveCount(4)
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
  await qaShot(page, '56-endless-compare')
})

test('formal endless case briefs expose symptoms without spelling out any diagnosis', async ({ page }) => {
  const cases = [
    { seed: 6000, diagnosis: '观察特征没有抓住真正差异', symptom: /报名邮件|垃圾箱/, shot: '55-feature-gap-brief' },
    { seed: 6001, diagnosis: '模型把训练噪声和偶然点记得太死', symptom: /芯片|缺陷|质检/, shot: '56-noise-brief' },
    { seed: 6002, diagnosis: '训练环境与现场环境发生了分布变化', symptom: /闸机|授权|异常通行/, shot: '57-shift-brief' },
    { seed: 6003, diagnosis: '多数类把总体准确率撑高，少数类却一直漏掉', symptom: /机房|故障|报警|漏掉/, shot: '58-imbalance-brief' },
  ]

  for (const item of cases) {
    await page.goto(`?mode=endless&seed=${item.seed}`)
    const brief = page.locator('.endless-case-brief')
    await expect(brief).toContainText(item.symptom)
    await expect(brief).not.toContainText(item.diagnosis)
    await expect(brief).toContainText('3 SOURCES SEALED')
    await expect(brief).not.toContainText(/40 条|4 条|HISTORY：|FIELD：|Camera-[AB]|质量系统标出了/)
    await expect(page.getByLabel('当前调查目标')).toContainText('基线')
    await expect(page.locator('.objective-action')).toHaveCount(1)
    await qaShot(page, item.shot)
  }
})

test('Duty experiments alone cannot reveal syndrome names until one causal source is actively reviewed', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()

  // Deliberately ignore the highlighted CAUSE SOURCES step and perform the
  // strong fields-only repair anyway. The model can become reliable, but the
  // report must still refuse to name a syndrome without a source review.
  await chooseEndlessFeatures(page, '发件人可信度', '正文重复度')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').last().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)
  await expect(page.getByLabel('当前调查目标')).toContainText('先决定查哪一种原因')
  await expect(page.getByText('观察特征没有抓住真正差异')).toHaveCount(0)

  await inspectCausalLead(page, /历史质量记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/没有标出需要人工复核/)
  await expect(page.locator('.endless-diagnosis')).toBeVisible()
  await expect(page.getByText('观察特征没有抓住真正差异')).toBeVisible()
})

test('overfit Duty separates hypothesis discovery from reliable repair before naming the syndrome', async ({ page }) => {
  await page.goto('?mode=endless&seed=6117')

  // The deployed k=1 system first reproduces the incident.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-audit-result')).toContainText('TRAIN')
  await expect(page.locator('.endless-audit-result')).toContainText('FIELD AUDIT')
  await expect(page.getByLabel('竞争假设')).toContainText('OPEN')
  await inspectCausalLead(page, /历史质量记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/4 条需要人工复核/)

  // Smoothing k=1 → k=5 while keeping fields fixed kills one plausible
  // explanation, but it does not yet produce a reliable system.
  await page.locator('.endless-model-list').getByRole('button', { name: /k=5/ }).click()
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换模型')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  const modelHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-MODEL' })
  const fieldHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-FIELDS' })
  await expect(modelHypothesis).toContainText('SUPPORTED')
  await expect(fieldHypothesis).toContainText('OPEN')
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 FAIL')
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)
  await expect(page.getByText('模型把训练噪声和偶然点记得太死')).toHaveCount(0)

  // A third controlled run repairs the system, but positive evidence alone is
  // still insufficient: quality flags + better metrics have not yet killed a
  // competing environmental explanation.
  await chooseEndlessFeatures(page, '引脚比例', '纹理波动')
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换字段')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)
  await expect(page.getByLabel('当前调查目标')).toContainText('还没有排除竞争解释')
  await expect(page.getByText('模型把训练噪声和偶然点记得太死')).toHaveCount(0)

  // A second cause-source check provides the missing falsification: the field
  // batch did not materially change, so the context-shift story loses support.
  await inspectCausalLead(page, /采集批次记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/没有设备、环境或采集规范的实质切换/)
  await expect(page.locator('.endless-diagnosis')).toBeVisible()
  await expect(page.getByText('模型把训练噪声和偶然点记得太死')).toBeVisible()
  await expect(page.getByLabel('当前调查目标')).toContainText('引用两条证据')
})

test('Duty can falsify a plausible model explanation before repairing the field sensors', async ({ page }) => {
  await page.goto('?mode=endless&seed=6026')

  // First reproduce the incident. At this point both intervention stories are
  // still reasonable because the player has only seen one failed deployment.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  const fieldHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-FIELDS' })
  const modelHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-MODEL' })
  await expect(fieldHypothesis).toContainText('OPEN')
  await expect(modelHypothesis).toContainText('OPEN')
  // Start with a plausible but wrong causal story: maybe bad historical capture.
  // A clean quality log removes that story without exposing the actual syndrome.
  await inspectCausalLead(page, /历史质量记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/没有标出需要人工复核/)

  // Hold fields fixed and change only the rule. The field result barely moves,
  // so the model-only prediction fails and H-MODEL is explicitly weakened.
  await page.locator('.endless-model-list').getByRole('button', { name: /k=5/ }).click()
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换模型')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(modelHypothesis).toContainText('WEAKENED')
  await expect(fieldHypothesis).toContainText('OPEN')
  await expect(page.getByLabel('竞争假设')).toContainText(/模型-only|H-MODEL.*削弱|H-MODEL 的单变量预测/)
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)

  await inspectCausalLead(page, /采集批次记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/HISTORY：.*FIELD：/)

  // Now keep k=5 fixed and change only the fields. The incident disappears,
  // supporting H-FIELDS and opening the diagnosis phase only after a reliable fix.
  await chooseEndlessFeatures(page, '拼片比例', '表面纹理')
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换字段')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(fieldHypothesis).toContainText('SUPPORTED')
  await expect(modelHypothesis).toContainText('WEAKENED')
  await expect(page.getByLabel('竞争假设')).toContainText(/字段实验产生了显著变化/)
  await expect(page.locator('.endless-diagnosis')).toBeVisible()
})

test('repeating the same endless configuration is replication, not new diagnostic evidence', async ({ page }) => {
  await page.goto('?mode=endless&seed=6000')

  for (let repeat = 0; repeat < 2; repeat += 1) {
    await page.getByRole('button', { name: '训练当前方案' }).click()
    await page.getByRole('button', { name: /<60% 翻车|60–84% 勉强|≥85% 稳定/ }).first().click()
    await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
    if (repeat === 0) await inspectCausalLead(page, /历史质量记录/)
  }

  await expect(page.locator('.endless-run-log article')).toHaveCount(2)
  await expect(page.locator('.endless-run-log article').nth(1)).toContainText('复现实验')
  await expect(page.getByLabel('当前调查目标')).toContainText('继续获取能区分解释的证据')
  await expect(page.locator('.endless-objective-stats')).toContainText('不同配置 1')
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)
  await expect(page.getByLabel('竞争假设')).toContainText('同配置复现')
  await expect(page.getByLabel('竞争假设')).toContainText('OPEN')

  await chooseEndlessFeatures(page, '正文重复度', '发件人可信度')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车|60–84% 勉强|≥85% 稳定/ }).first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-objective-stats')).toContainText('不同配置 2')
  await expect(page.locator('.endless-diagnosis')).toBeVisible()
  const fieldHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-FIELDS' })
  const modelHypothesis = page.getByLabel('竞争假设').locator('article').filter({ hasText: 'H-MODEL' })
  await expect(fieldHypothesis).toContainText('SUPPORTED')
  await expect(modelHypothesis).toContainText('OPEN')

  // Once a real discriminating experiment unlocks diagnosis, the two replication
  // runs are still invalid evidence by themselves.
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
  await inspectCausalLead(page, /历史档案构成/)
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

  // A genuinely new fields-only falsification reopens evidence collection. The
  // current reliable E02 is deliberately perturbed to a third field set; a large
  // performance drop is just as discriminating as an improvement.
  await chooseEndlessFeatures(page, '链接数量', '感叹号密度')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.getByLabel('竞争假设')).toContainText(/现场证据下降|SUPPORTED/)
  await citeEndlessRuns(page, 1, 2)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('必须包含上次诊断后新增的实验记录')
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await page.locator('.endless-run-log').getByRole('button', { name: /已引用 E01/ }).click()
  await citeEndlessRuns(page, 3)
  await expect(page.getByLabel('诊断证据引用状态')).toContainText('证据包就绪')
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeEnabled()
})

test('endless gateway explicitly resumes or abandons a saved investigation', async ({ page }) => {
  const seed = 6020
  let progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
  progress = recordTrainingCaseCompletion(progress, TRAINING_CASE_000.id)
  progress.inductionAcknowledged = true

  await page.goto(`?mode=hub&seed=${seed}`)
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [BUREAU_PROGRESS_KEY, JSON.stringify(progress)])
  await page.reload()
  await bureauDepartment(page, /值班室/).click()
  await page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' }).first().click()
  await page.getByRole('button', { name: /进入正式无尽调查/ }).click()
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')

  await page.getByRole('button', { name: '返回调查局' }).click()
  await bureauDepartment(page, /值班室/).click()
  await expect(page.getByRole('button', { name: '继续未结值班案件' })).toBeVisible()
  await page.getByRole('button', { name: '继续未结值班案件' }).click()
  const savedCase = page.getByLabel('已保存无尽案件')
  await expect(savedCase).toContainText('UNFINISHED CASE SAVED')
  await expect(savedCase).toContainText('CASE 6020')
  await expect(savedCase).toContainText('1 次正式审计 · 剩余审计额度 4')
  await expect(page.getByRole('button', { name: /继续 CASE 6020/ })).toBeVisible()
  await qaShot(page, '35-endless-gateway-resume')

  await page.getByRole('button', { name: /继续 CASE 6020/ }).click()
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 4')
  await expect(page.getByLabel('已恢复本案进度')).toBeVisible()

  await page.getByRole('button', { name: '返回调查局' }).click()
  await bureauDepartment(page, /值班室/).click()
  await page.getByRole('button', { name: '继续未结值班案件' }).click()
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
  const progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
  progress.inductionAcknowledged = true
  await page.goto('?mode=hub&seed=20260809')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [BUREAU_PROGRESS_KEY, JSON.stringify(progress)])
  await page.reload()
  await expect(page.getByLabel('AI异常调查局主页')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
  await bureauDepartment(page, /值班室/).click()
  await page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' }).first().click()
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
  await inspectCausalLead(page, /历史档案构成/)
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

test('distribution-shift batch metadata is a player-opened fact, not an opening syndrome fingerprint', async ({ page }) => {
  await page.goto('?mode=endless&seed=6002')
  await expect(page.locator('.endless-case-brief')).not.toContainText(/分布漂移|白天|夜间|Camera-[AB]/)
  await expect(page.getByLabel('因果线索来源')).toContainText('采集批次记录')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.locator('.endless-band-picks button').first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await inspectCausalLead(page, /采集批次记录/)
  const leads = page.getByLabel('因果线索来源')
  await expect(leads).toContainText('HISTORY：')
  await expect(leads).toContainText('FIELD：')
  await expect(leads).not.toContainText(/分布漂移/)
})

test('zero-background player can investigate the incident and reach CASE CLOSED', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('?seed=20260809')

  // Cold open: the player learns the goal and the visual language before seeing a dashboard.
  const titleAction = page.getByRole('button', { name: /查看事故录像/ })
  await expect(titleAction).toBeVisible()
  await expect(page.getByRole('button', { name: /进入无尽调查/ })).toHaveCount(0)
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
  const firstResumeGateway = page.getByLabel('已保存剧情案件')
  await expect(firstResumeGateway).toContainText('UNFINISHED CASE SAVED')
  await expect(firstResumeGateway.getByLabel('剧情案件存档摘要')).toContainText('建立错误证据链')
  await firstResumeGateway.getByRole('button', { name: '继续上次调查' }).click()
  await waitForStage(page, 'inspect_errors')
  await expect(page.getByLabel('已恢复剧情案件进度')).toBeVisible()
  await expect(page.getByText(/已调查 2\/2/)).toBeVisible()
  await expect(page.getByText(/线索 02/)).toBeVisible()
  await expect(page.locator('.phase-transition')).toHaveCount(0)
  await assertNoOverlap(page, '.story-session-restored', '.pixel-objective-strip')
  await assertNoOverlap(page, '.story-session-restored', '.beginner-guide.compact')
  await qaShot(page, '22-story-session-restored')
  await page.getByLabel('已恢复剧情案件进度').getByRole('button', { name: '知道了' }).click()

  // The small header reset is destructive, so the first click only arms it and keeps the checkpoint intact.
  await page.getByRole('button', { name: '重新开始' }).click()
  await expect(page.getByRole('button', { name: '再次点击确认重新开始' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storyKey)).not.toBeNull()
  await page.getByRole('button', { name: '帮助' }).click()
  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storyKey)).not.toBeNull()
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
  await expect(page.getByText('PREDICTION LOCKED // 现在去训练，再用未知样本验证。')).toBeVisible()
  await expect(page.getByText('正式审计额度：4')).toBeVisible()
  await qaShot(page, '15b-experiment-plan')

  // A refresh between preregistering the hypothesis and running the experiment must not erase the prediction.
  await page.reload()
  const preregisteredResumeGateway = page.getByLabel('已保存剧情案件')
  await expect(preregisteredResumeGateway.getByLabel('剧情案件存档摘要')).toContainText('设计并验证方案')
  await preregisteredResumeGateway.getByRole('button', { name: '继续上次调查' }).click()
  await waitForStage(page, 'iterate')
  await expect(page.getByLabel('已恢复剧情案件进度')).toBeVisible()
  await expect(page.locator('.pixel-model-card').filter({ hasText: 'k=1' })).toHaveClass(/selected/)
  await expect(page.getByText('PREDICTION LOCKED // 现在去训练，再用未知样本验证。')).toBeVisible()
  await expect(page.getByText('正式审计额度：4')).toBeVisible()
  await page.getByLabel('已恢复剧情案件进度').getByRole('button', { name: '知道了' }).click()
  await clickGuidePrimary(page)
  const auditButton = guideSecondary(page)
  await expect(auditButton).toBeEnabled()
  await auditButton.click()
  await waitForStage(page, 'overfit_reveal')
  await expect(page.getByText('先从案件记录里指出异常')).toBeVisible()
  const overfitCheckpoint = await page.evaluate((key) => window.localStorage.getItem(key), storyKey)
  expect(storyAuditCredits(JSON.parse(overfitCheckpoint!) as StorySessionData)).toBe(3)
  await page.reload()
  const overfitResumeGateway = page.getByLabel('已保存剧情案件')
  await expect(overfitResumeGateway).toContainText('UNFINISHED CASE SAVED')
  await expect(overfitResumeGateway.getByLabel('剧情案件存档摘要')).toContainText('发现陷阱')
  await expect(overfitResumeGateway.getByLabel('剧情案件存档摘要')).toContainText('3')
  await overfitResumeGateway.getByRole('button', { name: '继续上次调查' }).click()
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
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), BUREAU_PROGRESS_KEY)).not.toBeNull()
  const bureauProgressAfterClosure = JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), BUREAU_PROGRESS_KEY))!)
  expect(bureauProgressAfterClosure.formalCases[STORY_CASE_001.id]).toMatchObject({ resolved: true, bestGrade: 'A' })

  // Closing the first formal case unlocks the Bureau meta layer. Returning later starts at the office, not a raw save gateway.
  await page.reload()
  const bureau = page.getByLabel('AI异常调查局主页')
  await expect(bureau).toBeVisible()
  await expect(page.getByLabel('正式调查员权限已开放')).toBeVisible()
  await page.getByRole('button', { name: '接收调查员证件' }).click()
  await expect(bureau).toContainText('CASE 001')
  await expect(bureau).toContainText('CLOSED')
  await expect(page.getByRole('button', { name: '打开结案案卷' })).toBeVisible()
  await page.getByRole('button', { name: '打开结案案卷' }).click()
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

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出匿名调查记录/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^ai-anomaly-.*\.behavior-log\.json$/)
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const exportedLogText = await readFile(downloadPath!, 'utf8')
  expect(exportedLogText).not.toMatch(/test-(cat|bread)/)
  expect(exportedLogText).not.toContain('"flags"')
  const exportedLog = JSON.parse(exportedLogText) as BehaviorLog
  expect(exportedLog.sessionId).toBe(completedCheckpoint.behaviorLog?.sessionId)
  expect(exportedLog.events.filter((event) => event.action === 'COMPLETE')).toHaveLength(1)
  expect(exportedLog.events.filter((event) => event.action === 'SESSION_RESTORED')).toHaveLength(4)
  expect(exportedLog.events.some((event) => event.action === 'VIEW_MISTAKE')).toBe(true)
  expect(exportedLog.events.some((event) => event.action === 'RUN_AUDIT')).toBe(true)
  expect(exportedLog.events.at(-1)?.action).toBe('EXPORT_LOG')

  // Explicit restart is the escape hatch from persistence: it must delete the checkpoint and return to a fresh title.
  await page.getByRole('button', { name: '重新调查一次' }).click()
  await expect(page.getByRole('button', { name: /查看事故录像/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /OFFICE \/ 返回调查局/ })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storyKey)).toBeNull()
})

test('endless supervised mode rewards evidence-led experiments over random clicking', async ({ page }) => {
  let progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
  progress = recordTrainingCaseCompletion(progress, TRAINING_CASE_000.id)
  progress.inductionAcknowledged = true
  await page.goto('?mode=hub&seed=6000')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [BUREAU_PROGRESS_KEY, JSON.stringify(progress)])
  await page.reload()
  await bureauDepartment(page, /值班室/).click()
  await page.getByLabel('待接异常报告').getByRole('button', { name: '接收报告' }).first().click()
  await page.getByRole('button', { name: /进入正式无尽调查/ }).click()
  await expect(page.getByRole('heading', { name: '监督学习 · 无尽调查' })).toBeVisible()
  await qaShot(page, '30-endless-start')
  await expect(page.locator('.endless-objective b')).toHaveText('审计额度 5')

  // Baseline experiment: deliberately test the weak default sensors.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(1)
  await inspectCausalLead(page, /历史质量记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/没有标出需要人工复核/)
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

  // A new controlled falsification reopens the report. From the reliable E03
  // configuration, switch only the fields to a third observation set and watch
  // FIELD performance collapse; deterioration is information too.
  await chooseEndlessFeatures(page, '链接数量', '感叹号密度')
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换字段')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /<60% 翻车|60–84% 勉强|≥85% 稳定/ }).first().click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-run-log article')).toHaveCount(4)
  await expect(page.locator('.endless-run-log article').nth(3)).toHaveAttribute('data-delta', 'fields-only')
  await expect(page.getByLabel('竞争假设')).toContainText(/现场证据下降|SUPPORTED/)
  await expect(page.getByRole('button', { name: '观察特征没有抓住真正差异' })).toBeDisabled()
  await citeEndlessRuns(page, 2, 4)
  await expect(page.getByLabel('已引用实验对照')).toContainText('只换字段')
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
  await expect(closureReport).toContainText('只换字段')
  await expect(closureReport).toContainText('FIELD INSPECTION')
  await expect(closureReport).toContainText('1 条误判复核')
  await expect(closureReport).toContainText('CAUSE SOURCES')
  await expect(closureReport).toContainText('历史质量记录')
  await expect(page.getByText(/实验设计：2 次单变量对照/)).toBeVisible()

  // Resolution now flows back into the Bureau meta layer: this duty case becomes archive evidence rather than an isolated sandbox result.
  await page.getByRole('button', { name: '返回调查局' }).click()
  const bureau = page.getByLabel('AI异常调查局主页')
  await expect(bureau).toBeVisible()
  await expect(bureau).toContainText('值班结案')
  await expect(bureau).toContainText('1')
  await bureauDepartment(page, /调查档案/).click()
  await expect(page.getByText('观察信息不足')).toBeVisible()
  await bureauDepartment(page, /值班室/).click()
  await expect(page.getByText('CASE 6000 ·')).toBeVisible()
  await page.getByRole('button', { name: '打开值班结案' }).click()
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
  await inspectCausalLead(page, /历史档案构成/)
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
  await expect(page.locator('.endless-case-brief')).not.toContainText(/正常日志 40|故障日志 4/)
  await qaShot(page, '40-imbalance-start')

  // The deployed baseline already looks healthy by overall accuracy while still
  // missing half of the rare faults. The case must reproduce its own incident.
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('故障日志召回 FAIL')
  await expect(page.locator('.endless-audit-result .metric-danger')).toHaveCount(1)
  await inspectCausalLead(page, /历史档案构成/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/正常日志 40 条.*故障日志 4 条/)
  await qaShot(page, '41-imbalance-deceptive-score')

  // Keep the deployed model fixed and change only the observation fields. This
  // is a real fields-only hypothesis test, not a mixed search for a higher score.
  await chooseEndlessFeatures(page, '错误签名', '时序比例')
  await expect(page.getByLabel('当前实验计划对照')).toContainText('只换字段')
  await page.getByRole('button', { name: '训练当前方案' }).click()
  await page.getByRole('button', { name: /≥85% 稳定/ }).click()
  await page.getByRole('button', { name: /消耗 1 次额度/ }).click()
  await expect(page.locator('.endless-reliability-check')).toContainText('总体 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('正常日志召回 PASS')
  await expect(page.locator('.endless-reliability-check')).toContainText('故障日志召回 PASS')

  // A skewed archive is supporting evidence, not falsification. Before naming
  // the syndrome, rule out at least one competing causal story.
  await expect(page.locator('.endless-diagnosis')).toHaveCount(0)
  await expect(page.getByLabel('当前调查目标')).toContainText('还没有排除竞争解释')
  await inspectCausalLead(page, /历史质量记录/)
  await expect(page.getByLabel('因果线索来源')).toContainText(/没有标出需要人工复核/)
  await expect(page.locator('.endless-diagnosis')).toBeVisible()

  await citeEndlessRuns(page, 1, 2)
  await page.getByRole('button', { name: /多数类把总体准确率撑高/ }).click()
  await page.getByRole('button', { name: '提交诊断' }).click()
  await expect(page.getByText('CASE RESOLVED')).toBeVisible()
  const directQueryProgress = JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), BUREAU_PROGRESS_KEY))!)
  expect(directQueryProgress.formalCases[STORY_CASE_001.id]).toBeUndefined()
  expect(directQueryProgress.duty.resolutions).toEqual([])
})
