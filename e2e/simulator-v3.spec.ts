import { expect, test } from '@playwright/test'

const BOARD_KEY = 'aia.simulator-v3.board.v1'
const BLUEPRINT_KEY = 'aia.simulator-v3.blueprints.v1'
const COMPONENT_KEY = 'aia.simulator-v3.components.v1'

test('default route is an empty construction simulator, not a scripted level', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()
  await expect(page.getByLabel('AI系统模拟器 V3')).toBeVisible()
  await expect(page.getByLabel('构造画布')).toContainText('EMPTY CONSTRUCTION BOARD')
  await expect(page.getByLabel('元件库').getByRole('button')).toHaveCount(13)
  await expect(page.getByLabel('元件库').getByRole('button', { name: /ACCURACY/i })).toHaveCount(0)
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

  // A breakpoint must stop PLAY before the selected node executes. STEP then
  // advances exactly that node from the frozen runtime state.
  await page.getByRole('button', { name: '设置断点 greater_than_1' }).click()
  await page.getByLabel('播放速度').selectOption('70')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('BREAKPOINT · greater_than_1')
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(2)
  await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('GREATER THAN')
  await page.getByRole('button', { name: '取消断点 greater_than_1' }).click()
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')
  await page.getByRole('button', { name: 'RESET SIGNAL' }).click()

  // Keep an unfinished scratch component on the board: it must not poison a
  // separate completed output circuit. Construction sandboxes need room for
  // work-in-progress fragments.
  await page.getByRole('button', { name: '添加 GREATER THAN' }).click()
  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 3 WIRES')

  await page.getByLabel('播放速度').selectOption('800')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('NODE 1/4')
  await page.getByRole('button', { name: 'Ⅱ PAUSE' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('PAUSED')
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(1)
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')
  await expect(page.getByLabel('模拟器状态')).toContainText('PLAY COMPLETE · 4 个节点已求值')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(3)

  // A construction sandbox must support repair without deleting a whole node.
  await page.locator('.sim-wire-layer g').first().locator('.sim-wire-hit').click()
  await expect(page.getByLabel('模拟器状态')).toContainText('已选中连线')
  await page.getByRole('button', { name: 'DELETE WIRE' }).click()
  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 2 WIRES')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('GREATER THAN.a 尚未接线')
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 a number' }).click()
  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 3 WIRES')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')

  await page.getByRole('button', { name: 'RESET SIGNAL' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
  await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('NODE 1/4')
  await expect(page.locator('.sim-trace-row.done')).toHaveCount(1)
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(1)

  await page.reload()
  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 3 WIRES')
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('—')
})

test('number score streams can flow through a threshold primitive into boolean stream logic', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()

  await page.getByRole('button', { name: '添加 NUMBER STREAM' }).click()
  await page.getByRole('button', { name: '添加 CONSTANT' }).click()
  await page.getByRole('button', { name: '添加 STREAM >' }).click()
  await page.getByRole('button', { name: '添加 COUNT TRUE' }).click()
  await page.getByRole('button', { name: '添加 NUMBER OUTPUT' }).click()

  await page.getByLabel('number_stream_input_1 stream').fill('0.72, 0.31, 0.88, 0.54')
  await page.getByLabel('constant_1 数值').fill('0.60')

  const connect = async (from: string, to: string) => {
    await page.getByRole('button', { name: from }).click()
    await page.getByRole('button', { name: to }).click()
  }
  await connect('number_stream_input_1 输出 stream number-stream', 'stream_greater_than_1 输入 stream number-stream')
  await connect('constant_1 输出 value number', 'stream_greater_than_1 输入 threshold number')
  await connect('stream_greater_than_1 输出 result boolean-stream', 'count_true_1 输入 stream boolean-stream')
  await connect('count_true_1 输出 count number', 'number_output_1 输入 value number')

  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 4 WIRES · CLOCK 0/4')
  await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('SAMPLE 1/4 · NODE 1/5')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(1)
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('—')

  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('2')
  await expect(page.getByLabel('模拟器状态')).toContainText('PLAY COMPLETE · 4 个样本时钟已执行')
  await expect(page.locator('.sim-wire-layer')).toContainText('[0.72 0.31 0.88 0.54]')
  await expect(page.locator('.sim-wire-layer')).toContainText('[T F T F]')
})

test('player can compose a recall-like conditional metric from generic stream primitives', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()

  await page.getByRole('button', { name: '添加 BOOLEAN STREAM' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN STREAM' }).click()
  await page.getByRole('button', { name: '添加 STREAM AND' }).click()
  await page.getByRole('button', { name: '添加 COUNT TRUE' }).click()
  await page.getByRole('button', { name: '添加 COUNT TRUE' }).click()
  await page.getByRole('button', { name: '添加 DIVIDE' }).click()
  await page.getByRole('button', { name: '添加 NUMBER OUTPUT' }).click()

  await page.getByLabel('boolean_stream_input_1 stream').fill('1,0,1,1')
  await page.getByLabel('boolean_stream_input_2 stream').fill('1,1,0,1')

  const connect = async (from: string, to: string) => {
    await page.getByRole('button', { name: from }).click()
    await page.getByRole('button', { name: to }).click()
  }
  await connect('boolean_stream_input_1 输出 stream boolean-stream', 'stream_and_1 输入 a boolean-stream')
  await connect('boolean_stream_input_2 输出 stream boolean-stream', 'stream_and_1 输入 b boolean-stream')
  await connect('stream_and_1 输出 result boolean-stream', 'count_true_1 输入 stream boolean-stream')
  await connect('boolean_stream_input_2 输出 stream boolean-stream', 'count_true_2 输入 stream boolean-stream')
  await connect('count_true_1 输出 count number', 'divide_1 输入 a number')
  await connect('count_true_2 输出 count number', 'divide_1 输入 b number')
  await connect('divide_1 输出 result number', 'number_output_1 输入 value number')

  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('0.67')
  await expect(page.getByLabel('模拟器状态')).toContainText('PLAY COMPLETE · 4 个样本时钟已执行')
  await expect(page.getByLabel('元件库').getByRole('button', { name: /RECALL/i })).toHaveCount(0)
})

test('player can compose a generic match ratio from stream primitives', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate((key) => window.localStorage.removeItem(key), BOARD_KEY)
  await page.reload()

  await page.getByRole('button', { name: '添加 BOOLEAN STREAM' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN STREAM' }).click()
  await page.getByRole('button', { name: '添加 STREAM EQUAL' }).click()
  await page.getByRole('button', { name: '添加 COUNT TRUE' }).click()
  await page.getByRole('button', { name: '添加 STREAM LENGTH' }).click()
  await page.getByRole('button', { name: '添加 DIVIDE' }).click()
  await page.getByRole('button', { name: '添加 NUMBER OUTPUT' }).click()

  await page.getByLabel('boolean_stream_input_1 stream').fill('1,0,1,1')
  await page.getByLabel('boolean_stream_input_2 stream').fill('1,1,0,1')

  const connect = async (from: string, to: string) => {
    await page.getByRole('button', { name: from }).click()
    await page.getByRole('button', { name: to }).click()
  }
  await connect('boolean_stream_input_1 输出 stream boolean-stream', 'stream_equal_1 输入 a boolean-stream')
  await connect('boolean_stream_input_2 输出 stream boolean-stream', 'stream_equal_1 输入 b boolean-stream')
  await connect('stream_equal_1 输出 match boolean-stream', 'count_true_1 输入 stream boolean-stream')
  await connect('stream_equal_1 输出 match boolean-stream', 'stream_length_1 输入 stream boolean-stream')
  await connect('count_true_1 输出 count number', 'divide_1 输入 a number')
  await connect('stream_length_1 输出 length number', 'divide_1 输入 b number')
  await connect('divide_1 输出 result number', 'number_output_1 输入 value number')

  await expect(page.getByLabel('构造画布')).toContainText('7 NODES · 7 WIRES')
  await expect(page.getByLabel('构造画布')).toContainText('CLOCK 0/4')
  await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('SAMPLE 1/4 · NODE 1/7 · BOOLEAN STREAM')
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('—')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(1)
  for (let index = 0; index < 6; index += 1) await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('模拟器状态')).toContainText('SAMPLE 1/4 · NODE 7/7 · NUMBER OUTPUT · SAMPLE COMPLETE')
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('1')
  await expect(page.getByLabel('模拟器状态')).toContainText('1 / 4')
  for (let index = 0; index < 7; index += 1) await page.getByRole('button', { name: 'STEP' }).click()
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('0.50')
  await expect(page.getByLabel('构造画布')).toContainText('CLOCK 2/4')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('number_output_1 输出值')).toHaveText('0.50')
  await expect(page.getByLabel('模拟器状态')).toContainText('PLAY COMPLETE · 4 个样本时钟已执行')
  await expect(page.locator('.sim-wire-layer g.hot')).toHaveCount(7)
})


test('player can save a working fragment as a reusable blueprint and place another copy', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate(([boardKey, blueprintKey]) => { localStorage.removeItem(boardKey); localStorage.removeItem(blueprintKey) }, [BOARD_KEY, BLUEPRINT_KEY])
  await page.reload()

  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 CONSTANT' }).click()
  await page.getByRole('button', { name: '添加 GREATER THAN' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 a number' }).click()
  await page.getByRole('button', { name: 'constant_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 b number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输出 result boolean' }).click()
  await page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }).click()

  await page.getByRole('button', { name: '选择 greater_than_1' }).click()
  await page.getByRole('button', { name: '选择 boolean_output_1' }).click()
  await expect(page.getByLabel('蓝图工具')).toContainText('2 UNITS SELECTED')
  await page.getByLabel('蓝图名称').fill('MY GATE')
  await page.getByRole('button', { name: 'SAVE BLUEPRINT' }).click()
  await expect(page.getByLabel('我的蓝图')).toContainText('MY GATE')
  await expect(page.getByLabel('模拟器状态')).toContainText('BLUEPRINT SAVED')

  await page.getByLabel('我的蓝图').getByRole('button', { name: /MY GATE/ }).click()
  await expect(page.getByLabel('构造画布')).toContainText('6 NODES · 4 WIRES')
  await expect(page.getByLabel('构造画布')).toContainText('greater_than_1_copy')
  await expect(page.getByLabel('构造画布')).toContainText('boolean_output_1_copy')
  await expect(page.getByLabel('模拟器状态')).toContainText('BLUEPRINT PLACED · MY GATE')

  await page.reload()
  await expect(page.getByLabel('我的蓝图')).toContainText('MY GATE')
})


test('player can encapsulate a primitive circuit as a typed component and reuse it', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate(([boardKey, componentKey]) => { localStorage.removeItem(boardKey); localStorage.removeItem(componentKey) }, [BOARD_KEY, COMPONENT_KEY])
  await page.reload()

  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 CONSTANT' }).click()
  await page.getByRole('button', { name: '添加 GREATER THAN' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 a number' }).click()
  await page.getByRole('button', { name: 'constant_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 b number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输出 result boolean' }).click()
  await page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }).click()

  // Encapsulate a real two-node construction: the 0.6 constant becomes an
  // internal implementation detail, so the reusable component exposes only
  // score -> boolean instead of merely repainting one primitive as a black box.
  await page.getByRole('button', { name: '选择 constant_1' }).click()
  await page.getByRole('button', { name: '选择 greater_than_1' }).click()
  await page.getByLabel('蓝图名称').fill('MY THRESHOLD')
  await page.getByRole('button', { name: 'SAVE COMPONENT' }).click()
  await expect(page.getByLabel('我的组件')).toContainText('MY THRESHOLD')
  await expect(page.getByLabel('模拟器状态')).toContainText('COMPONENT SAVED · MY THRESHOLD · 1 IN / 1 OUT')

  await page.getByLabel('我的组件').getByRole('button', { name: /MY THRESHOLD/ }).click()
  const component = page.locator('.sim-component-instance').filter({ hasText: 'MY THRESHOLD' }).first()
  await expect(component).toBeVisible()
  await expect(component).toContainText('BLACK BOX')
  await expect(page.getByLabel('构造画布')).toContainText('5 NODES · 3 WIRES')
  await expect(page.getByLabel('构造画布')).not.toContainText('constant_1_unit')
  await expect(page.getByLabel('构造画布')).not.toContainText('greater_than_1_unit')

  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await component.getByRole('button', { name: /输入 a number/ }).click()
  await component.getByRole('button', { name: /输出 result boolean/ }).click()
  await page.getByRole('button', { name: 'boolean_output_2 输入 value boolean' }).click()

  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_2 输出值')).toHaveText('TRUE')
  await expect(component).toContainText('result: TRUE')

  // A player-built black box can itself become a building block in a larger
  // custom component. This is the construction hierarchy the simulator needs:
  // build -> encapsulate -> reuse -> encapsulate again.
  await component.getByRole('button', { name: /选择组件/ }).click()
  await page.getByRole('button', { name: '选择 boolean_output_2' }).click()
  await expect(page.getByLabel('蓝图工具')).toContainText('2 UNITS SELECTED')
  await page.getByLabel('蓝图名称').fill('MY DEPLOY GATE')
  await page.getByRole('button', { name: 'SAVE COMPONENT' }).click()
  await expect(page.getByLabel('我的组件')).toContainText('MY DEPLOY GATE')
  await expect(page.getByLabel('模拟器状态')).toContainText('COMPONENT SAVED · MY DEPLOY GATE · 1 IN / 1 OUT')

  await page.getByRole('button', { name: 'CLEAR BOARD' }).click()
  await page.getByLabel('我的组件').getByRole('button', { name: /MY DEPLOY GATE/ }).click()
  const higher = page.locator('.sim-component-instance').filter({ hasText: 'MY DEPLOY GATE' }).first()
  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByLabel('number_input_1 数值').fill('0.72')
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await higher.getByRole('button', { name: /输入 a number/ }).click()
  await higher.getByRole('button', { name: /输出 value boolean/ }).click()
  await page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }).click()
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')

  await page.reload()
  await expect(page.getByLabel('我的组件')).toContainText('MY THRESHOLD')
  await expect(page.getByLabel('我的组件')).toContainText('MY DEPLOY GATE')
  await expect(page.locator('.sim-component-instance').filter({ hasText: 'MY DEPLOY GATE' }).first()).toBeVisible()
})

test('player can open a black box, edit its primitives, and keep external wiring intact', async ({ page }) => {
  await page.goto('/?sim=1')
  await page.evaluate(([boardKey, componentKey]) => { localStorage.removeItem(boardKey); localStorage.removeItem(componentKey) }, [BOARD_KEY, COMPONENT_KEY])
  await page.reload()

  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 CONSTANT' }).click()
  await page.getByRole('button', { name: '添加 GREATER THAN' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByLabel('number_input_1 数值').fill('0.72')
  await page.getByLabel('constant_1 数值').fill('0.60')
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 a number' }).click()
  await page.getByRole('button', { name: 'constant_1 输出 value number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输入 b number' }).click()
  await page.getByRole('button', { name: 'greater_than_1 输出 result boolean' }).click()
  await page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }).click()

  await page.getByRole('button', { name: '选择 constant_1' }).click()
  await page.getByRole('button', { name: '选择 greater_than_1' }).click()
  await page.getByLabel('蓝图名称').fill('OPENABLE THRESHOLD')
  await page.getByRole('button', { name: 'SAVE COMPONENT' }).click()
  await page.getByRole('button', { name: 'CLEAR BOARD' }).click()

  await page.getByLabel('我的组件').getByRole('button', { name: /OPENABLE THRESHOLD/ }).click()
  const component = page.locator('.sim-component-instance').filter({ hasText: 'OPENABLE THRESHOLD' }).first()
  await page.getByRole('button', { name: '添加 NUMBER INPUT' }).click()
  await page.getByRole('button', { name: '添加 BOOLEAN OUTPUT' }).click()
  await page.getByLabel('number_input_1 数值').fill('0.72')
  await page.getByRole('button', { name: 'number_input_1 输出 value number' }).click()
  await component.getByRole('button', { name: /输入 a number/ }).click()
  await component.getByRole('button', { name: /输出 result boolean/ }).click()
  await page.getByRole('button', { name: 'boolean_output_1 输入 value boolean' }).click()
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('TRUE')

  const wireCountBefore = await page.locator('.sim-wire-layer g').count()
  await component.getByRole('button', { name: /打开组件/ }).click()
  await expect(component).toHaveCount(0)
  await expect(page.getByLabel('模拟器状态')).toContainText('BLACK BOX OPENED · OPENABLE THRESHOLD')
  await expect(page.getByLabel('构造画布')).toContainText('constant_1_unit')
  await expect(page.getByLabel('构造画布')).toContainText('greater_than_1_unit')
  await expect(page.locator('.sim-wire-layer g')).toHaveCount(wireCountBefore + 1)

  await page.getByLabel('constant_1_unit 数值').fill('0.80')
  await page.getByRole('button', { name: '▶ PLAY' }).click()
  await expect(page.getByLabel('boolean_output_1 输出值')).toHaveText('FALSE')

  await page.reload()
  await expect(page.locator('.sim-component-instance').filter({ hasText: 'OPENABLE THRESHOLD' })).toHaveCount(0)
  await expect(page.getByLabel('构造画布')).toContainText('constant_1_unit')
  await expect(page.getByLabel('constant_1_unit 数值')).toHaveValue('0.8')
})
