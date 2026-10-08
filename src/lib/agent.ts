import type { Transaction } from './finance'

export type ToolCall = {
  name: 'get_cash_position' | 'find_unreconciled_transactions' | 'draft_collection_reminder' | 'prepare_payment_schedule' | 'security_review'
  status: 'completed' | 'blocked'
  detail: string
}

export type AgentRun = {
  answer: string
  intent: string
  plan: string[]
  toolCalls: ToolCall[]
  requiresApproval: boolean
  action?: { kind: 'schedule-reminder' | 'open-review' | 'schedule-beanworks'; title: string }
  draft?: { customer: string; subject: string; body: string }
}

import { financialSnapshot } from './finance'

/** Offline mode is deliberately deterministic; it never claims to be an LLM. */
export function runFinanceAgent(question: string, transactions: Transaction[]): AgentRun {
  const base = { plan: ['Read current workspace data', 'Prepare only allowlisted local actions', 'Require a separate owner confirmation'], requiresApproval: false }
  if (/bank.?change|bank details|ignore.*policy|override|security|银行信息|安全/i.test(question)) return { ...base, intent: 'Safety review', answer: 'Unverified settlement changes are blocked. No payment or bank-detail change was made.', toolCalls: [{ name: 'security_review', status: 'blocked', detail: 'No settlement capability is available.' }] }
  if (/do not|don.t|never|不要|取消/i.test(question)) return { ...base, intent: 'No action prepared', answer: 'No action was prepared or performed.', toolCalls: [] }
  if (/reconcile|unreconciled|transactions|对账|交易/i.test(question)) {
    const count = transactions.filter((item) => item.status === 'Review').length
    return { ...base, intent: 'Review transactions', answer: 'Found ' + count + ' rows requiring review. Confirm below to open the filtered review queue. This does not match or post entries.', toolCalls: [{ name: 'find_unreconciled_transactions', status: 'completed', detail: count + ' rows need owner review; matching confidence is not available.' }], requiresApproval: true, action: { kind: 'open-review', title: 'Open the review queue without changing transactions.' } }
  }
  if (/draft|prepare|起草|准备/i.test(question) && /northstar|reminder|催收|提醒/i.test(question)) return { ...base, intent: 'Prepare collection reminder', requiresApproval: true, answer: 'The editable Northstar draft is ready below. Confirm to schedule it in the local demo; no email will be sent.', toolCalls: [{ name: 'draft_collection_reminder', status: 'completed', detail: 'Prepared an editable draft for demo invoice NS-172.' }], action: { kind: 'schedule-reminder', title: 'Schedule the Northstar reminder locally. No email will be sent.' }, draft: { customer: 'Northstar Studio', subject: 'Payment status: invoice NS-172', body: 'Hello Northstar team,\n\nCould you confirm the payment status of invoice NS-172 for $7,250? If already paid, please share the payment reference so we can reconcile it.\n\nThank you,\nHarbor & Bean' } }
  if (/beanworks/i.test(question) && /schedule|move|prepare|推迟|准备/i.test(question)) return { ...base, intent: 'Prepare payment schedule', requiresApproval: true, answer: 'Prepared a simulated BW-219 reschedule to October 14. Confirm below; no money will move.', toolCalls: [{ name: 'prepare_payment_schedule', status: 'completed', detail: 'Simulated date change only.' }], action: { kind: 'schedule-beanworks', title: 'Schedule the BeanWorks date change locally. No payment will be made.' } }
  const snapshot = financialSnapshot(transactions)
  return { ...base, intent: 'Read cash forecast', answer: 'Available demo cash: $' + snapshot.cash.toLocaleString() + '. Lowest projected cash: $' + snapshot.minimum.cash.toLocaleString() + ' on ' + snapshot.minimum.date + '. Gap below the $12,000 buffer: $' + snapshot.shortfall.toLocaleString() + '. This is an illustrative forecast, not a guarantee that payroll is covered.', toolCalls: [{ name: 'get_cash_position', status: 'completed', detail: 'Calculated from the current ledger and shared demo forecast assumptions.' }] }
}
