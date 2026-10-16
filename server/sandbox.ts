export type SandboxProvider = 'alipay' | 'wechat-pay'

export type SandboxEvidence = {
  id: string
  provider: SandboxProvider
  operation: string
  outcome: 'passed'
  timestamp: string
  detail: string
}

export function isSandboxProvider(value: unknown): value is SandboxProvider {
  return value === 'alipay' || value === 'wechat-pay'
}

export function createSandboxEvents(provider: SandboxProvider, timestamp = new Date().toISOString(), nonce = Date.now()): SandboxEvidence[] {
  const label = provider === 'alipay' ? 'Alipay sandbox' : 'WeChat Pay sandbox'
  return [
    { id: `${provider}-connect-${nonce}`, provider, operation: 'Connect simulated merchant account', outcome: 'passed', timestamp, detail: `${label} test profile activated; no live credentials or customer data were used.` },
    { id: `${provider}-balance-${nonce}`, provider, operation: 'Read sandbox settlement summary', outcome: 'passed', timestamp, detail: 'Read-only balance and settlement metadata request completed.' },
    { id: `${provider}-webhook-${nonce}`, provider, operation: 'Verify signed sandbox callback', outcome: 'passed', timestamp, detail: 'Sandbox callback signature verification simulated successfully.' },
  ]
}
