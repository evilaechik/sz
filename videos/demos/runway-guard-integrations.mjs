import { resolve } from 'node:path'

export const url = 'http://127.0.0.1:5173/'

export async function prepare(page) {
  await page.goto(url)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

export async function ready(t) {
  await t.frame.locator('button.nav-item').filter({ hasText: 'Integrations' }).waitFor()
  await t.page.waitForTimeout(800)
}

async function openIntegrations(t) {
  await t.frame.locator('button.nav-item').filter({ hasText: 'Integrations' }).click()
  await t.frame.getByText('Bring your own data', { exact: true }).waitFor()
  await t.page.waitForTimeout(700)
}

export async function still(t) {
  await openIntegrations(t)
}

export default async function take(t) {
  await t.hold(700)
  await t.clickOn(
    t.frame.locator('button.nav-item').filter({ hasText: 'Integrations' }),
    { settle: 900 },
  )
  await t.hold(1200)

  const stripe = t.frame.getByText('Stripe', { exact: true })
  await stripe.waitFor()
  await t.hover(stripe, { fx: 0.55, fy: 0.5, dwell: 650 })
  await t.hold(900)

  const importInput = t.frame.getByLabel('Import transactions CSV')
  await importInput.setInputFiles(resolve('public/runway-guard-test-import.csv'))
  await t.hold(2800)

  const transactions = t.frame.locator('.integration-overview').getByText('14', { exact: true })
  await transactions.waitFor()
  await t.hover(transactions, { fx: 0.5, fy: 0.5, dwell: 650 })

  await t.clickOn(
    t.frame.getByRole('button', { name: '中文', exact: true }),
    { settle: 850 },
  )
  await t.hold(900)

  const wechat = t.frame.getByRole('button', { name: '运行微信支付沙箱', exact: true })
  await wechat.scrollIntoViewIfNeeded()
  await t.hold(650)
  await t.clickOn(wechat, { settle: 500 })
  await wechat.waitFor({ state: 'visible' })
  await t.hold(1500)

  const alipay = t.frame.getByRole('button', { name: '运行支付宝沙箱', exact: true })
  await t.clickOn(alipay, { settle: 500 })
  await t.hold(1500)

  const result = t.frame.getByText('已记录 6 项检查', { exact: true })
  await result.waitFor()
  await t.hover(result, { fx: 0.5, fy: 0.5, dwell: 650 })
  t.poster()
  await t.moveTo(t.width * 0.84, t.height * 0.78, { ms: 650 })
  await t.hold(2200)
}
