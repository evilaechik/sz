export const url = 'http://127.0.0.1:5173/'

export async function prepare(page) {
  await page.goto(url)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

export async function ready(t) {
  await t.frame.getByRole('button', { name: 'Ask Runway Guard', exact: true }).waitFor()
  await t.page.waitForTimeout(800)
}

export async function still(t) {
  await t.frame.getByRole('button', { name: 'Ask Runway Guard', exact: true }).click()
  await t.frame.getByRole('button', { name: 'Run next step', exact: true }).waitFor()
  await t.page.waitForTimeout(800)
}

async function waitForAgent(t) {
  await t.app.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Run next step'))
    return button && !button.disabled
  }, null, { timeout: 180000 })
}

export default async function take(t) {
  await t.hold(800)

  await t.hover(t.frame.locator('.risk-card'), { fx: 0.48, fy: 0.52, dwell: 700 })
  await t.clickOn(
    t.frame.getByRole('button', { name: 'Ask Runway Guard', exact: true }),
    { settle: 650 },
  )

  const runNext = t.frame.getByRole('button', { name: 'Run next step', exact: true })
  await runNext.waitFor()
  await t.hold(500)

  await t.clickOn(runNext, { settle: 220 })
  await t.hold(2300)
  await waitForAgent(t)

  await t.clickOn(runNext, { settle: 220 })
  await t.hold(3200)
  await waitForAgent(t)

  const confirm = t.frame.getByRole('button', { name: 'Confirm action', exact: true })
  await confirm.waitFor({ state: 'attached' })
  await confirm.scrollIntoViewIfNeeded()
  await t.hold(650)
  t.poster()
  await t.clickOn(confirm, { settle: 800 })
  await t.hold(1700)
  await t.moveTo(t.width * 0.82, t.height * 0.78, { ms: 650 })
  await t.hold(1000)
}
