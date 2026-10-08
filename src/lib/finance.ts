export type DataSource = {
  id: string
  name: string
  provider: string
  kind: 'Banking' | 'Payments' | 'Accounting'
  status: 'Connected' | 'Needs attention'
  lastSync: string
  records: number
  color: 'indigo' | 'mint' | 'orange' | 'violet' | 'blue'
}

export type Transaction = {
  id: string
  date: string
  source: string
  merchant: string
  amount: number
  category: string
  status: 'Matched' | 'Review' | 'Reviewed'
  confidence?: number
}

export const initialSources: DataSource[] = [
  { id: 'harbor-bank', name: 'Harbor Bank', provider: 'Open Banking adapter', kind: 'Banking', status: 'Connected', lastSync: 'Just now', records: 78, color: 'indigo' },
  { id: 'stripe', name: 'Stripe', provider: 'Payments adapter', kind: 'Payments', status: 'Connected', lastSync: '4 min ago', records: 31, color: 'mint' },
  { id: 'ledgerly', name: 'Ledgerly', provider: 'Accounting adapter', kind: 'Accounting', status: 'Connected', lastSync: '12 min ago', records: 42, color: 'orange' },
  { id: 'wechat-pay', name: '微信支付 / WeChat Pay', provider: 'Demo adapter · merchant consent required', kind: 'Payments', status: 'Needs attention', lastSync: 'Not connected', records: 0, color: 'violet' },
  { id: 'alipay', name: '支付宝 / Alipay', provider: 'Demo adapter · merchant consent required', kind: 'Payments', status: 'Needs attention', lastSync: 'Not connected', records: 0, color: 'blue' },
]

export const initialTransactions: Transaction[] = [
  { id: 'tx-1', date: '2026-10-05', source: 'Stripe', merchant: 'Stripe payout', amount: 3425.4, category: 'Sales income', status: 'Matched' },
  { id: 'tx-2', date: '2026-10-05', source: 'Harbor Bank', merchant: 'Harbor Roasters', amount: -891.2, category: 'Inventory', status: 'Matched' },
  { id: 'tx-3', date: '2026-10-04', source: 'Harbor Bank', merchant: 'Greenline Market', amount: -1283.6, category: 'Uncategorized', status: 'Review' },
  { id: 'tx-4', date: '2026-10-03', source: 'Ledgerly', merchant: 'Northstar Studio', amount: 7250, category: 'Accounts receivable', status: 'Matched' },
]

export function parseTransactionCsv(csv: string): { transactions: Transaction[]; rejected: number } {
  // Parse quoted fields, escaped quotes, CRLF and a spreadsheet BOM.
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  const input = csv.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(field.trim()); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index++
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += char
  }
  if (quoted) return { transactions: [], rejected: 1 }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2) return { transactions: [], rejected: 0 }
  const headers = rows[0].map((value) => value.toLowerCase())
  const dateIndex = headers.indexOf('date')
  const merchantIndex = headers.findIndex((header) => ['merchant', 'description', 'payee'].includes(header))
  const amountIndex = headers.indexOf('amount')
  const categoryIndex = headers.indexOf('category')
  let rejected = 0
  const transactions = rows.slice(1).flatMap((values) => {
    const amount = Number(values[amountIndex])
    const date = values[dateIndex] ?? ''
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    if (dateIndex < 0 || merchantIndex < 0 || amountIndex < 0 || !validDate || !values[merchantIndex] || !/^-?\d+(\.\d{1,2})?$/.test(values[amountIndex] ?? '') || !Number.isFinite(amount) || Math.abs(amount) > 1e9 || values.length !== headers.length) {
      rejected += 1
      return []
    }
    return [{
      id: `csv-${crypto.randomUUID()}`,
      date: values[dateIndex],
      source: 'CSV import',
      merchant: values[merchantIndex],
      amount,
      category: categoryIndex >= 0 && values[categoryIndex] ? values[categoryIndex] : 'Uncategorized',
      status: 'Review' as const,
    }]
  })
  return { transactions, rejected }
}

export function mergeTransactions(existing: Transaction[], incoming: Transaction[]) {
  const key = (item: Transaction) => JSON.stringify([item.date, item.merchant.trim().toLowerCase(), item.amount])
  const seen = new Set(existing.map(key))
  const added = incoming.filter((item) => {
    if (seen.has(key(item))) return false
    seen.add(key(item)); return true
  })
  return { added, duplicates: incoming.length - added.length }
}

export type ForecastScenario = 'baseline' | 'collect' | 'protect'
export function isCashTransaction(item: Transaction) {
  // An invoice/receivable is a claim on cash, not evidence that cash settled.
  return !['accounts receivable', 'accounts payable', 'invoice'].includes(item.category.trim().toLowerCase())
}
export function financialSnapshot(transactions: Transaction[], scenario: ForecastScenario = 'baseline') {
  const importedCents = transactions.filter((item) => item.source === 'CSV import' && isCashTransaction(item)).reduce((sum, item) => sum + Math.round(item.amount * 100), 0)
  const adjustment = importedCents / 100
  // Explicit illustrative weekly assumptions, shared by charts and agent tools.
  const balances = [42860, 26200, 8160, 11000, 15000, 19800, 24200, 20500, 17700, 22200, 27100, 24300, 29300]
  const spending = [0, 21660, 23040, 5160, 8000, 6200, 5400, 9100, 8000, 5000, 6700, 8200, 5800]
  const points = balances.map((balance, index) => ({
    date: new Date(Date.UTC(2026, 9, 7 + index * 7)).toISOString().slice(0, 10),
    cash: balance + adjustment + (scenario !== 'baseline' && index >= 1 ? 7250 : 0) + (scenario === 'protect' && index === 2 ? 4820 : 0),
    outflow: spending[index] + (scenario === 'protect' && index === 2 ? -4820 : scenario === 'protect' && index === 3 ? 4820 : 0),
  }))
  const minimum = points.reduce((lowest, point) => point.cash < lowest.cash ? point : lowest)
  const breach = points.findIndex((point) => point.cash < 12000)
  return { cash: 42860 + adjustment, threshold: 12000, points, minimum, shortfall: Math.max(0, 12000 - minimum.cash), bufferMaintained: breach < 0, daysToBuffer: breach < 0 ? 84 : breach * 7, assumptions: 'Illustrative demo forecast. Imported CSV amounts adjust opening cash; scheduled actions are simulations and do not change balances.' }
}

export function runLocalAgent(question: string, transactions: Transaction[]): string {
  const lower = question.toLowerCase()
  const reviewCount = transactions.filter((transaction) => transaction.status === 'Review').length
  const incoming = transactions.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0)
  const outgoing = Math.abs(transactions.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + transaction.amount, 0))
  if (lower.includes('reconcile') || lower.includes('match') || question.includes('对账') || question.includes('匹配')) return `${reviewCount} transactions need review. I can propose ledger matches, but will not post any entry without approval.`
  if (lower.includes('import') || lower.includes('source') || lower.includes('integration')) return `Three demo sources are connected and contributing ${transactions.length} normalized records. New CSV rows are held as review items until their schema and amounts pass validation.`
  if (lower.includes('cash') || lower.includes('payroll') || lower.includes('shortfall') || question.includes('现金') || question.includes('工资')) return `Imported activity totals $${incoming.toLocaleString()} in inflows and $${outgoing.toLocaleString()} in outflows. Payroll is covered this week; the modeled risk remains week 43 if Northstar stays overdue.`
  if (lower.includes('security') || lower.includes('risk') || question.includes('安全') || question.includes('风险')) return 'The supplier bank-change request remains blocked because it changed settlement details in an unverified document. The agent treats document text as untrusted and cannot override its action policy.'
  return `I can work with ${transactions.length} normalized records across banking, payments, and accounting sources. Ask me to reconcile items, explain the cash forecast, or prepare a safe action.`
}
