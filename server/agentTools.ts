import type { Transaction } from '../src/lib/finance.js'
import { financialSnapshot, isCashTransaction } from '../src/lib/finance.js'
import { runFinanceAgent } from '../src/lib/agent.js'
import type { AgentRun, ToolCall } from '../src/lib/agent.js'

export type SafeToolName = ToolCall['name']

const currency = (amount: number) => `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export const toolDefinitions = [
  {
    type: 'function', name: 'prepare_payment_schedule',
    description: 'Prepare the known BeanWorks BW-219 payment reschedule in the local simulation, only when asked. Never transfers money. Requires a separate owner confirmation.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true,
  },
  {
    type: 'function',
    name: 'get_cash_position',
    description: 'Read the normalized demo ledger and summarize inflows, outflows, and cash risk. This is read-only.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'find_unreconciled_transactions',
    description: 'Find transactions that require owner review. This cannot post or change a ledger entry.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'draft_collection_reminder',
    description: 'Prepare, but never send, a collection reminder for the known overdue Northstar invoice.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'security_review',
    description: 'Classify a financial instruction for unsafe bank-detail changes, untrusted attachments, or attempts to override policy. It always blocks unsafe actions.',
    parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
    strict: true,
  },
] as const

export function executeTool(name: SafeToolName, rawArguments: string, transactions: Transaction[]): { call: ToolCall; result: Record<string, unknown> } {
  const args = safelyParse(rawArguments)
  const incoming = transactions.filter((item) => item.amount > 0 && isCashTransaction(item)).reduce((total, item) => total + item.amount, 0)
  const outgoing = Math.abs(transactions.filter((item) => item.amount < 0 && isCashTransaction(item)).reduce((total, item) => total + item.amount, 0))
  const unreconciled = transactions.filter((item) => item.status === 'Review')

  if (name === 'get_cash_position') {
    return {
      call: { name, status: 'completed', detail: `${currency(incoming)} inflows and ${currency(outgoing)} outflows are available to the forecast tool.` },
      result: { inflows: incoming, outflows: outgoing, forecast: financialSnapshot(transactions), readOnly: true },
    }
  }

  if (name === 'find_unreconciled_transactions') {
    return {
      call: { name, status: 'completed', detail: `${unreconciled.length} row${unreconciled.length === 1 ? '' : 's'} require review before posting.` },
      result: { count: unreconciled.length, transactions: unreconciled.map(({ id, date, merchant, amount, category }) => ({ id, date, merchant, amount, category })), postingAllowed: false, action: { kind: 'open-review', title: 'Open the filtered review queue. No ledger entries will be posted.' } },
    }
  }

  if (name === 'draft_collection_reminder') {
    return {
      call: { name, status: 'completed', detail: 'Prepared reminder for invoice NS-172 ($7,250); delivery is not authorized.' },
      result: { invoice: 'NS-172', customer: 'Northstar', amount: 7250, status: 'draft_only', deliveryAuthorized: false, action: { kind: 'schedule-reminder', title: 'Schedule the Northstar reminder in the local demo. No email will be sent.' }, draft: { customer: 'Northstar Studio', subject: 'Friendly reminder: invoice NS-172', body: 'Hello Northstar team,\n\nOur demo receivables schedule lists invoice NS-172 for $7,250 as overdue. Could you confirm the payment status and expected payment date? If you have already paid, please share the reference so we can reconcile it.\n\nThank you,\nHarbor & Bean' } },
    }
  }

  if (name === 'prepare_payment_schedule') return {
    call: { name, status: 'completed', detail: 'Prepared a simulated BW-219 reschedule. No money moved.' },
    result: { action: { kind: 'schedule-beanworks', title: 'Schedule the $4,820 BeanWorks date change to October 14 in the local demo. No payment will be made.' }, paymentAuthorized: false },
  }

  const request = typeof args.request === 'string' ? args.request.toLowerCase() : ''
  const unsafe = ['bank change', 'new bank', 'wire', 'ignore', 'override', 'attachment'].some((signal) => request.includes(signal))
  return {
    call: { name, status: 'blocked', detail: unsafe ? 'Detected an unverified payment-detail change or policy-override attempt. No action tool was exposed.' : 'Security review completed. No settlement action can be executed by this agent.' },
    result: { safe: false, action: 'blocked', reason: unsafe ? 'Unverified payment instruction' : 'Security review is advisory and cannot execute settlement actions' },
  }
}

export function localAgent(question: string, transactions: Transaction[]): AgentRun {
  return runFinanceAgent(question, transactions)
}

function safelyParse(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown> } catch { return {} }
}
