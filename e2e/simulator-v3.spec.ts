import { expect, test } from '@playwright/test'

const BOARD_KEY = 'aia.simulator-v3.board.v1'

test('default route is an empty construction simulator, not a scripted level', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()
  await expect(page.getByLabel('AI系统模拟器 V3')).toBeVisible()
  await expect(page.getByLabel('构造画布')).toContainText('EMPTY CONSTRUCTION BOARD')
  await expect(page.getByLabel('元件库').getByRole('button')).toHaveCount(4)
  await expect(page.getByText(/OBJECTIVE|PASS LINE|LEVEL 01/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
})

test('player can construct, wire, run and step-debug a threshold machine', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()

  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 CONSTANT' }).click()
  await page.getByRole('button', { name: '添加 GREATER THAN' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await expect(page.getByLabel('构造画布')).toContainText('4 NODES · 0 WIRES')

  await page.getByLabel('number_input_1 数值').fill('0.72')
  await page.getByLabel('constant_1 数值').fill('0.60')

  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).dragTo(page.getByRole('button', { name: 'greater_than_1 输入 a number' }))
  await page.getByRole('button', { name: 'constant_1 输出 value number' }).dragTo(page.getByRole('button', { name: 'greater_than_1 输入 b number' }))
  await page.getByRole('button', { name: 'greater_than_1 输出 result boolean' }).dragTo(page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }))
  await expect(page.getByLabel('构造画布')).toContainText('4 NODES · 3 WIRES')

  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')
  await expect(page.getByLabel('模拟器状态')).toContainText('运行完成：4 个节点已求值')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(3)

  await page.getByRole('button', { name: 'RESET SIGNAL' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
  await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('STEP 1/4')
  await expect(page.locator('.sim-trace-row.done')).toHaveCount(1)
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(1)

  await page.reload()
  await expect(page.getByLabel('构造画布')).toContainText('4 NODES · 3 WIRES')
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
})
