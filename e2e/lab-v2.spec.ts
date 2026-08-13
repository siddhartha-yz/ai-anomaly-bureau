import { expect, test } from '@playwright/test'
import { LAB_V2_SESSION_KEY } from '../src/lab/v2Session'

test('V2 default route is a build-run-fix workbench, not an authored option flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('AI系统实验室 V2')).toBeVisible()
  await expect(page.getByLabel('AI实验工作台')).toBeVisible()
  await expect(page.locator('.puzzle-option-grid')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '训练集不是世界' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)
})

test('V2 vertical slice grows three reusable primitives through direct manipulation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?v2=1')
  await page.evaluate((key) => window.localStorage.removeItem(key), LAB_V2_SESSION_KEY)
  await page.reload()

  // LEVEL 01: the failure releases TEST PROBE. The player installs it and changes the signal path.
  await page.getByRole('button', { name: /SHIP \/ RUN FIELD GATE/ }).click()
  await expect(page.getByLabel('最近一次运行结果')).toContainText('FIELD GATE 拒绝部署')
  await expect(page.getByRole('button', { name: /TEST PROBE/ })).toBeVisible()
  await page.getByRole('button', { name: /TEST PROBE/ }).click()
  await expect(page.getByLabel('实验工具安装槽')).toContainText('TEST PROBE')
  await page.getByLabel('特征总线').getByRole('button', { name: '纹理 + 比例' }).click()
  await page.getByRole('button', { name: /SHIP \/ RUN FIELD GATE/ }).click()
  await expect(page.getByLabel('LEVEL 01 已通过')).toContainText('独立测试集 / 泛化')
  await page.getByRole('button', { name: /NEXT LEVEL/ }).click()

  // LEVEL 02: TEST PROBE is inherited; CLASS PROBE is earned after the average score hides misses.
  await expect(page.getByRole('heading', { name: '平均数会藏人' })).toBeVisible()
  await expect(page.getByLabel('实验工具安装槽')).toContainText('TEST PROBE')
  await page.getByRole('button', { name: 'RUN TESTS' }).last().click()
  await expect(page.getByLabel('最近一次运行结果')).toContainText('总体分数绿灯')
  await expect(page.getByRole('button', { name: /CLASS PROBE/ })).toBeVisible()
  await page.getByRole('button', { name: /CLASS PROBE/ }).click()
  const threshold = page.getByLabel('风险阈值')
  await threshold.press('Home')
  for (let step = 0; step < 25; step += 1) await threshold.press('ArrowRight')
  await page.getByRole('button', { name: 'RUN TESTS' }).last().click()
  await expect(page.getByLabel('LEVEL 02 已通过')).toContainText('分类别召回 / 阈值取舍')
  await page.getByRole('button', { name: /NEXT LEVEL/ }).click()

  // LEVEL 03: old probes remain installed. ENV SWITCH lets the same feature be tested in both worlds.
  await expect(page.getByRole('heading', { name: '只在白天正确' })).toBeVisible()
  await expect(page.getByLabel('实验工具安装槽')).toContainText('TEST PROBE')
  await expect(page.getByLabel('实验工具安装槽')).toContainText('CLASS PROBE')
  await page.getByRole('button', { name: 'RUN TESTS' }).last().click()
  await expect(page.getByLabel('最近一次运行结果')).toContainText('夜班部署失败')
  await page.getByRole('button', { name: /ENV SWITCH/ }).click()
  await page.getByLabel('观察通道').getByRole('button', { name: '局部纹理' }).click()
  await page.getByRole('button', { name: 'RUN TESTS' }).last().click()
  await expect(page.getByLabel('跨环境记录')).toContainText('DAY ✓ 局部纹理')
  await page.getByLabel('环境输入').getByRole('button', { name: 'NIGHT' }).click()
  await page.getByRole('button', { name: 'RUN TESTS' }).last().click()
  await expect(page.getByLabel('LEVEL 03 已通过')).toContainText('分布变化 / 稳定特征')
  await expect(page.getByText('VERTICAL SLICE COMPLETE')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true)

  // The prototype is a real persistent progression, not a one-off demo state.
  await page.reload()
  await expect(page.getByRole('heading', { name: '只在白天正确' })).toBeVisible()
  await expect(page.getByText('VERTICAL SLICE COMPLETE')).toBeVisible()
  await expect(page.getByLabel('实验工具安装槽')).toContainText('ENV SWITCH')
})
