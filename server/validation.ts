import type { Transaction } from '../src/lib/finance.js'

export function validateTransactions(value: unknown): Transaction[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Provide at most 1,000 transactions. Nothing was analyzed.')
  const ids = new Set<string>()
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid transaction.')
    const item = entry as Transaction
    if (![item.id, item.merchant, item.date, item.source, item.category].every((field) => typeof field === 'string' && field.length > 0 && field.length <= 500) || !Number.isFinite(item.amount) || Math.abs(item.amount) > 1e9 || !['Matched', 'Review', 'Reviewed'].includes(item.status) || ids.has(item.id) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date) throw new Error('Invalid or duplicate transaction. Nothing was analyzed.')
    ids.add(item.id)
    return { id: item.id, date: item.date, source: item.source, merchant: item.merchant, amount: item.amount, category: item.category, status: item.status }
  })
}

export function sanitizeHistory(value: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-20).map((item) => ({ role: item.role, content: item.content.slice(0, 6000) }))
}
