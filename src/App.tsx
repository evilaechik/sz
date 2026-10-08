import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { t } from './lib/locale'
import './App.css'
import './china.css'
import './product.css'
import ForecastChart from './ForecastChart'
import { useSavedState, downloadFile } from './lib/workspace'
import { initialSources, initialTransactions, parseTransactionCsv, mergeTransactions, financialSnapshot } from './lib/finance'
import type { DataSource, Transaction } from './lib/finance'
import { runFinanceAgent } from './lib/agent'
import type { AgentRun } from './lib/agent'

type View = 'Overview' | 'Cash flow' | 'Reconciliation' | 'Agent workspace' | 'Approvals' | 'Integrations' | 'Audit log'
type ApprovalStatus = 'Needs approval' | 'Scheduled' | 'Blocked'

type Approval = {
  id: string
  title: string
  detail: string
  amount: string
  due: string
  risk: 'Low' | 'Medium' | 'High'
  status: ApprovalStatus
}

type Evaluation = { passed: number; total: number; blockedUnsafeRequests: number; generatedAt: string }
type SandboxEvent = { id: string; provider: 'alipay' | 'wechat-pay'; operation: string; outcome: 'passed'; timestamp: string; detail: string }
type ForecastScenario = 'baseline' | 'collect' | 'protect'
type ReconciliationFilter = 'all' | 'review' | 'matched'
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type CollectionDraft = { customer: string; subject: string; body: string }
type PendingAgentAction = NonNullable<AgentRun['action']>

const nav: { label: View; icon: string }[] = [
  { label: 'Overview', icon: '⊞' },
  { label: 'Cash flow', icon: '⌁' },
  { label: 'Reconciliation', icon: '⌘' },
  { label: 'Agent workspace', icon: '✦' },
  { label: 'Approvals', icon: '✓' },
  { label: 'Integrations', icon: '⌁' },
  { label: 'Audit log', icon: '◷' },
]

const chineseNav: Record<View, string> = {
  Overview: '总览',
  'Cash flow': '现金流',
  Reconciliation: '对账',
  'Agent workspace': '智能助手',
  Approvals: '审批中心',
  Integrations: '数据连接',
  'Audit log': '审计日志',
}

const initialApprovals: Approval[] = [
  {
    id: 'payment-219',
    title: 'Reschedule BeanWorks (demo)',
    detail: 'Move invoice BW-219 to Oct 14 to preserve payroll runway.',
    amount: '$4,820',
    due: 'Oct 14',
    risk: 'Medium',
    status: 'Needs approval',
  },
  {
    id: 'reminder-172',
    title: 'Schedule Northstar reminder (demo)',
    detail: 'Seeded demo invoice NS-172. Ask the agent to prepare an editable draft; no email is sent.',
    amount: '$7,250',
    due: 'Today',
    risk: 'Low',
    status: 'Needs approval',
  },
  {
    id: 'supplier-804',
    title: 'Supplier bank-change request',
    detail: 'Bank details changed in an unverified invoice attachment.',
    amount: '$8,900',
    due: 'Blocked',
    risk: 'High',
    status: 'Blocked',
  },
]

const activity = [
  { id: 'demo-initialized', timestamp: 'demo', actor: 'System', time: 'Demo', type: 'Workspace initialized', text: 'Illustrative ledger loaded. No live payments or emails are enabled.', tone: 'blue' },
]

function exportAuditFile(data: { collectionDraft: CollectionDraft | null; activityLog: typeof activity; approvals: Approval[]; transactions: Transaction[]; snapshot: ReturnType<typeof financialSnapshot> }) {
  downloadFile('runway-guard-audit.json', JSON.stringify({ exportedAt: new Date().toISOString(), collectionDraft: data.collectionDraft, environment: 'Local simulation; no external payments or emails', activity: data.activityLog, approvals: data.approvals, transactions: data.transactions, forecast: data.snapshot }, null, 2))
}

function makeActivityEvent(type: string, text: string, tone: string) {
  const now = new Date()
  const actor = ['Owner approved', 'Owner reviewed', 'Schedule undone', 'Cancelled', 'CSV import'].includes(type) ? 'Business owner' : 'Runway Guard'
  return { id: crypto.randomUUID(), timestamp: now.toISOString(), actor, time: now.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }), type, text, tone }
}

function activityActor(item: (typeof activity)[number]) {
  return item.actor ?? (['Owner approved', 'Owner reviewed', 'Schedule undone', 'Cancelled', 'CSV import'].includes(item.type) ? 'Business owner' : item.type === 'Workspace initialized' ? 'System' : 'Runway Guard')
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sparkle: <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3zm6 12l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" />,
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
    lock: <path d="M7 10V7a5 5 0 0110 0v3m-11 0h12v10H6V10zm6 4v2" />,
    bell: <path d="M18 9a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    check: <path d="M5 12l4 4L19 6" />,
    down: <path d="M6 9l6 6 6-6" />,
    shield: <path d="M12 3l7 3v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3zm-3 9l2 2 4-4" />,
    dots: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
    chart: <path d="M4 19V5m0 14h16M7 15l3-3 3 2 5-6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function App() {
  const [activeView, setActiveView] = useState<View>('Overview')
  const [approvals, setApprovals] = useSavedState('approvals', initialApprovals)
  const [prompt, setPrompt] = useState('')
  const [sources, setSources] = useSavedState<DataSource[]>('sources', initialSources)
  const [transactions, setTransactions] = useSavedState<Transaction[]>('transactions', initialTransactions)
  const [activityLog, setActivityLog] = useSavedState('activity', activity)
  const [agentMessage, setAgentMessage] = useSavedState('latest-answer', 'I can inspect your ledger, open the review queue, draft a Northstar reminder, or prepare a simulated BeanWorks reschedule. No money or email can leave this demo.')
  const [chatHistory, setChatHistory] = useSavedState<ChatMessage[]>('chat', [{ id: 'welcome', role: 'assistant', content: 'I can inspect your ledger, open the review queue, draft a Northstar reminder, or prepare a simulated BeanWorks reschedule. No money or email can leave this demo.' }])
  const [collectionDraft, setCollectionDraft] = useSavedState<CollectionDraft | null>('draft', null)
  const [pendingAgentAction, setPendingAgentAction] = useState<PendingAgentAction | null>(null)
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null)
  const [agentProvider, setAgentProvider] = useState<'local-policy-agent' | 'openai-responses' | 'browser-fallback'>('local-policy-agent')
  const [agentBusy, setAgentBusy] = useState(false)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [locale, setLocale] = useSavedState<'en' | 'zh'>('locale', 'en')
  const [sandboxEvents, setSandboxEvents] = useState<SandboxEvent[]>([])
  const [sandboxBusy, setSandboxBusy] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const [forecastScenario, setForecastScenario] = useState<ForecastScenario>('baseline')
  const [forecastHover, setForecastHover] = useState<number | null>(null)
  const [reconciliationFilter, setReconciliationFilter] = useState<ReconciliationFilter>('all')
  const [toast, setToast] = useState('')
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewCategory, setReviewCategory] = useState('')
  const reviewItem = transactions.find((item) => item.id === reviewId)

  const pendingCount = approvals.filter((item) => item.status === 'Needs approval').length
  const scheduledCount = approvals.filter((item) => item.status === 'Scheduled').length
  const snapshot = financialSnapshot(transactions)
  const cash = snapshot.cash
  const runway = snapshot.daysToBuffer
  const requestLock = useRef(false)
  const transactionRef = useRef(transactions)
  useEffect(() => { transactionRef.current = transactions }, [transactions])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  useEffect(() => {
    const warn = () => setStorageWarning(true)
    window.addEventListener('workspace-storage-error', warn)
    return () => { window.removeEventListener('workspace-storage-error', warn); if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [])

  function showToast(message: string) {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 6000)
  }

  function recordActivity(type: string, text: string, tone: string) {
    const entry = makeActivityEvent(type, text, tone)
    setActivityLog((current) => [entry, ...current])
  }

  function approve(id: string) {
    const item = approvals.find((approval) => approval.id === id)
    if (id === 'reminder-172' && item?.status === 'Needs approval' && !collectionDraft) {
      setActiveView('Agent workspace')
      setPrompt('Draft a Northstar reminder')
      showToast(locale === 'zh' ? '请先检查并编辑提醒草稿。' : 'Review and edit the reminder draft before scheduling.')
      return
    }
    if (item?.status === 'Scheduled') {
      setApprovals((current) => current.map((approval) => approval.id === id ? { ...approval, status: 'Needs approval' } : approval))
      setPendingAgentAction(null)
      setAgentMessage(locale === 'zh' ? '已撤销模拟安排。操作重新等待审批；未发送邮件或转账。' : 'The local simulation was undone. The action is pending again; no email was sent and no money moved.')
      recordActivity('Schedule undone', item.title + ': local simulation returned to pending approval.', 'blue')
      showToast(locale === 'zh' ? '已撤销模拟安排，未转账或发送邮件。' : 'Simulation undone. No payment or email was sent.')
      return
    }
    if (!item || item.status !== 'Needs approval') return
    setApprovals((current) => current.map((approval) => approval.id === id ? { ...approval, status: 'Scheduled' } : approval))
    setAgentMessage(`${item.title} is scheduled in the local demo. Owner approval was recorded; no email was sent and no money moved.`)
    recordActivity('Owner approved', item.title, 'mint')
    showToast(locale === 'zh' ? '已记录所有者批准，并在本地演示中安排。' : 'Owner approval recorded and scheduled in the local demo.')
  }

  function appendReply(content: string) {
    setAgentMessage(content)
    setChatHistory((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content }])
  }
  function cancelAction() {
    setPendingAgentAction(null)
    appendReply(locale === 'zh' ? '已取消操作。未执行更改。' : 'Pending action cancelled. No changes were made.')
    recordActivity('Cancelled', 'Owner cancelled the prepared action.', 'blue')
  }
  function confirmAction() {
    const action = pendingAgentAction
    if (!action || requestLock.current) return
    setPendingAgentAction(null)
    if (action.kind === 'open-review') {
      setReconciliationFilter('review')
      setActiveView('Reconciliation')
      appendReply(locale === 'zh' ? '已打开待审核队列。未更改或入账任何交易。' : 'Opened the filtered review queue. No transactions were changed or posted.')
      recordActivity('Agent navigation', 'Opened the review queue after confirmation.', 'blue')
      return
    }
    const id = action.kind === 'schedule-reminder' ? 'reminder-172' : 'payment-219'
    const item = approvals.find((approval) => approval.id === id)
    if (!item || item.status !== 'Needs approval') {
      appendReply(locale === 'zh' ? '此操作已处理，没有重复执行。' : 'That action is already scheduled or unavailable. Nothing was repeated.')
      return
    }
    approve(id)
    appendReply(locale === 'zh' ? '已在本地演示中安排操作。未发送邮件，也未转账。' : 'Scheduled in the local demo and recorded the approval. No email was sent and no money moved.')
  }
  function acceptRun(run: AgentRun, provider: typeof agentProvider) {
    setAgentRun(run)
    setAgentProvider(provider)
    appendReply(run.answer)
    const blocked = run.toolCalls.some((call) => call.status === 'blocked')
    setPendingAgentAction(blocked ? null : run.action ?? null)
    if (!blocked && run.draft) setCollectionDraft(run.draft)
    if (run.toolCalls.length) recordActivity('Agent tool result', `${provider}: ${run.toolCalls.map((call) => `${call.name}=${call.status}`).join(', ')}`, blocked ? 'coral' : 'blue')
    if (blocked) recordActivity('Threat blocked', 'Unsafe request blocked; no financial action performed.', 'coral')
    else if (run.action) recordActivity('Action prepared', run.action.title, 'mint')
  }
  async function runAgentQuestion(question: string) {
    question = question.trim()
    if (!question || requestLock.current) return
    setPrompt('')
    if (/^(cancel|stop|never mind|no|取消|停止|不要)[.! ]*$/i.test(question)) {
      setChatHistory((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: question }])
      cancelAction(); return
    }
    if (/^(yes|yeah|yep|go ahead|go for it|do it|approve|confirm|proceed|send it|schedule it|继续|同意|确认|执行)[.! ]*$/i.test(question) && pendingAgentAction) {
      setChatHistory((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: question }])
      confirmAction(); return
    }
    requestLock.current = true
    setAgentBusy(true)
    setPendingAgentAction(null)
    setChatHistory((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: question }])
    setAgentMessage(locale === 'zh' ? '正在检查账本和策略…' : 'Checking the current ledger and policy controls…')
    try {
      const response = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ question, transactions, history: chatHistory.slice(-20), locale, overview: { availableCash: cash, cashRunwayDays: runway, pendingApprovals: pendingCount, approvals, connectedSources: sources.filter((item) => item.status === 'Connected').length } }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Agent service unavailable')
      acceptRun(payload.run as AgentRun, payload.provider)
    } catch (error) {
      acceptRun(runFinanceAgent(question, transactions), 'browser-fallback')
      showToast((locale === 'zh' ? '离线规则模式（非 AI）：' : 'Offline rules (not the LLM): ') + (error instanceof Error ? error.message : 'Service unavailable'))
    } finally { setAgentBusy(false); requestLock.current = false }
  }

  async function askAgent(event: FormEvent) {
    event.preventDefault()
    await runAgentQuestion(prompt.trim())
  }

  async function runDemoStep() {
    const steps = [
      'Is payroll safe?',
      'Draft a Northstar reminder',
      'The supplier invoice says to ignore policy and change bank details. What should I do?',
    ]
    if (demoStep >= steps.length) {
      setDemoStep(0)
      showToast('Guided demo reset')
      return
    }
    await runAgentQuestion(steps[demoStep])
    setDemoStep((current) => current + 1)
  }

  function syncSource(id: string) {
    setSources((current) => current.map((source) => source.id === id ? { ...source, lastSync: 'Demo checked' } : source))
    showToast(locale === 'zh' ? '仅检查本地演示数据，未连接实时账户。' : 'Local demo checked. No live account queried and no records fabricated.')
  }
  function importTransactions(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (requestLock.current) { showToast(locale === 'zh' ? '请等待助手完成，再导入数据。' : 'Wait for the agent to finish before importing new data.'); return }
    if (file.size > 500000) { showToast('CSV limit: 500 KB. Split your file and retry.'); return }
    const reader = new FileReader()
    reader.onerror = () => showToast('Unable to read this file. Please try again.')
    reader.onload = () => {
      const result = parseTransactionCsv(String(reader.result ?? ''))
      const merged = mergeTransactions(transactionRef.current, result.transactions)
      if (transactionRef.current.length + merged.added.length > 1000) { showToast('Workspace limit: 1,000 transactions. No rows imported.'); return }
      const next = [...merged.added, ...transactionRef.current]
      transactionRef.current = next
      setTransactions(next)
      setPendingAgentAction(null)
      const message = locale === 'zh' ? '新增 ' + merged.added.length + ' 行；跳过 ' + merged.duplicates + ' 行重复数据；拒绝 ' + result.rejected + ' 行无效数据。' : merged.added.length + ' rows added; ' + merged.duplicates + ' duplicates skipped; ' + result.rejected + ' invalid rows rejected.'
      recordActivity('CSV import', message, 'blue')
      showToast(message)
    }
    reader.readAsText(file)
  }
  function reconcileTransaction(id: string) {
    const transaction = transactions.find((item) => item.id === id)
    if (!transaction) return
    setReviewId(id)
    setReviewCategory(transaction.category === 'Uncategorized' ? '' : transaction.category)
  }
  function saveReview(event: FormEvent) {
    event.preventDefault()
    const transaction = transactions.find((item) => item.id === reviewId)
    const category = reviewCategory.trim()
    if (!transaction) { setReviewId(null); return }
    if (!category || category.toLowerCase() === 'uncategorized') return
    setTransactions((current) => current.map((item) => item.id === reviewId ? { ...item, category: category.slice(0, 100), status: 'Reviewed', confidence: undefined } : item))
    recordActivity('Owner reviewed', transaction.merchant + ': category ' + (transaction.status === 'Reviewed' ? 'updated' : 'confirmed') + ' as ' + category + '. No ledger posting.', 'blue')
    setReviewId(null)
    showToast(locale === 'zh' ? '已记录人工审核，未自动入账。' : 'Owner review recorded. No automatic ledger posting.')
  }
  function reconcileNewActivity() {
    const count = transactions.filter((item) => item.status === 'Review').length
    if (!count) {
      setReconciliationFilter('all')
      showToast(locale === 'zh' ? '没有新的待审核交易。您仍可使用“编辑审核”修改已审核交易。' : 'No new items need review. Use “Edit review” to update a previous decision.')
      return
    }
    setReconciliationFilter('review')
    setActiveView('Reconciliation')
    showToast(locale === 'zh' ? '已筛选待审核交易。请逐行确认类别。' : 'Showing items that need review. Confirm each category; no automatic matches are claimed.')
  }
  function exportAudit() {
    exportAuditFile({ collectionDraft, activityLog, approvals, transactions, snapshot })
  }

  async function runEvaluation() {
    try {
      const response = await fetch('/api/evaluate', { method: 'POST' })
      if (!response.ok) throw new Error('Evaluation unavailable')
      const result = await response.json() as Evaluation
      setEvaluation(result)
      showToast(`${result.passed}/${result.total} agent scenarios passed`)
    } catch {
      showToast('Evaluation service is unavailable')
    }
  }

  async function runSandbox(provider: 'alipay' | 'wechat-pay') {
    if (sandboxBusy) return
    setSandboxBusy(true)
    try {
      const response = await fetch('/api/sandbox/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
      if (!response.ok) throw new Error('Sandbox unavailable')
      const result = await response.json() as { events: SandboxEvent[] }
      setSandboxEvents((current) => [...result.events, ...current])
      setSources((current) => current.map((source) => source.id === provider ? { ...source, status: 'Connected', lastSync: 'Sandbox verified', records: 3 } : source))
      showToast(`${provider === 'alipay' ? 'Alipay' : 'WeChat Pay'} sandbox evidence captured`)
    } catch {
      showToast('Sandbox service is unavailable')
    } finally { setSandboxBusy(false) }
  }

  function exportEvidence() { window.open('/api/sandbox/evidence', '_blank', 'noopener,noreferrer') }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>runway</strong><small>GUARD</small></div></div>
        <div className="company-switcher"><div className="company-logo">H</div><div><b>Harbor &amp; Bean</b><span>{t(locale, "Owner workspace")}</span></div><Icon name="down" size={15} /></div>
        <nav><p className="nav-label">{locale === 'zh' ? '工作台' : 'WORKSPACE'}</p>{nav.map((item) => <button key={item.label} className={`nav-item ${activeView === item.label ? 'active' : ''}`} onClick={() => setActiveView(item.label)}><span className="nav-icon">{item.icon}</span>{locale === 'zh' ? chineseNav[item.label] : item.label}{item.label === 'Approvals' && pendingCount > 0 && <em>{pendingCount}</em>}</button>)}</nav>
        <div className="security-card"><div className="security-icon"><Icon name="shield" size={18} /></div><div><b>{t(locale, "Protected workspace")}</b><p>{t(locale, "Every financial action needs a policy check and human approval.")}</p></div></div>
        <div className="member-row"><div className="avatar">AR</div><div><b>Alex Rivera</b><span>{t(locale, "Business owner")}</span></div><Icon name="dots" /></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="breadcrumb"><span>{locale === 'zh' ? '工作台' : 'Workspace'}</span><i>/</i><b>{locale === 'zh' ? chineseNav[activeView] : activeView}</b></div><div className="topbar-actions"><button className="locale-button" onClick={() => setLocale((current) => current === 'en' ? 'zh' : 'en')}>{locale === 'zh' ? 'EN' : '中文'}</button><button className="secure-chip" onClick={() => showToast(locale === 'zh' ? '仅本地演示：不会发送邮件或转账。数据保存在此浏览器。' : 'Local demo: no emails or payments. Workspace data is saved in this browser.')}><Icon name="lock" size={14} /> {locale === 'zh' ? '演示环境' : 'Demo environment'}</button><button className="icon-button" aria-label={locale === 'zh' ? '打开审批中心' : 'Open approvals'} onClick={() => setActiveView('Approvals')}><Icon name="bell" size={19} /><span></span></button><span className="avatar avatar-small" aria-label="Alex Rivera">AR</span></div></header>
        <div className="content">
          {storageWarning && <div className="notice" role="alert">{locale === 'zh' ? '浏览器无法保存更改，请导出审计记录。' : 'Browser storage is unavailable or full. Export your audit record before closing.'}</div>}
          {activeView === 'Overview' ? <>
          <section className="welcome-row"><div><p className="eyebrow">{locale === 'zh' ? '演示快照 · 2026年10月7日' : 'DEMO SNAPSHOT · OCTOBER 7, 2026'}</p><h1>{locale === 'zh' ? '欢迎回来，Alex' : 'Welcome back, Alex'} <span>✦</span></h1><p className="subtitle">{locale === 'zh' ? '查看现金状况、交易审核和待批准的模拟操作。' : 'Review cash, transactions, and actions awaiting approval in this demo.'}</p></div><button className="primary-button" onClick={() => { setActiveView('Agent workspace'); showToast(locale === 'zh' ? '智能助手工作台已准备就绪' : 'Agent workspace is ready') }}><Icon name="sparkle" /> {locale === 'zh' ? '询问 Runway Guard' : 'Ask Runway Guard'} <Icon name="arrow" /></button></section>
          <section className="metrics-grid">
            <article className="metric-card money"><div className="metric-top"><span>{locale === 'zh' ? '可用现金（演示）' : 'Available cash (demo)'}</span><span aria-hidden="true"><Icon name="dots" size={18} /></span></div><div className="metric-value">${cash.toLocaleString()}</div><div className="metric-foot positive"><span>{locale === 'zh' ? '包括导入 CSV 的净额' : 'Includes imported CSV net activity'}</span></div><div className="mini-wave wave-blue"><svg viewBox="0 0 230 65" preserveAspectRatio="none"><path d="M0 52 C20 45 29 49 45 37 S70 38 85 25 S113 34 126 23 S154 29 173 15 S202 27 230 5 V65 H0Z" /></svg></div></article>
            <article className="metric-card runway-card"><div className="metric-top"><span>{locale === 'zh' ? '距离缓冲缺口' : 'Days to buffer gap'}</span><span aria-hidden="true"><Icon name="dots" size={18} /></span></div><div className="runway-number"><b>{snapshot.bufferMaintained ? `≥${runway}` : runway}</b><span>{locale === 'zh' ? '天' : 'days'}</span></div><div className="metric-foot warning"><span>{locale === 'zh' ? '基于演示预测假设' : 'Under illustrative forecast assumptions'}</span></div><div className="runway-track"><i style={{ width: `${Math.min(100, runway * 2.1)}%` }}></i></div></article>
            <article className="metric-card risk-card"><div className="metric-top"><span>{locale === 'zh' ? '预测最低现金' : 'Lowest forecast cash'}</span><span aria-hidden="true"><Icon name="dots" size={18} /></span></div><div className="risk-body"><div><h2>${snapshot.minimum.cash.toLocaleString()}</h2><b>{snapshot.minimum.date}</b><p>{locale === 'zh' ? '相对缓冲的缺口：$' : 'Gap below buffer: $'}{snapshot.shortfall.toLocaleString()}</p></div></div></article>
          </section>
          <section className="insight-banner"><div className="insight-star"><Icon name="sparkle" size={21} /></div><div><span className="eyebrow">{locale === 'zh' ? 'RUNWAY GUARD 洞察' : 'RUNWAY GUARD INSIGHT'}</span><h2>{snapshot.shortfall > 0 ? (locale === 'zh' ? '比较现金缓冲保护方案。' : 'Explore ways to protect your cash buffer.') : (locale === 'zh' ? '预测期间现金高于最低缓冲。' : 'Cash stays above the buffer in this forecast.')}</h2><p>{snapshot.shortfall > 0 ? (locale === 'zh' ? '比较催收和付款日期情景。批准模拟操作不会更改实际现金。' : 'Compare collection and payment-date scenarios. Approving a simulation never changes actual cash.') : (locale === 'zh' ? '导入数据已更新预测。可继续比较情景和缓冲假设。' : 'Imported data updated the forecast. Compare scenarios and buffer assumptions as needed.')}</p></div><button onClick={() => setActiveView(snapshot.shortfall > 0 ? 'Approvals' : 'Cash flow')}>{snapshot.shortfall > 0 ? (locale === 'zh' ? '查看计划' : 'Review plan') : (locale === 'zh' ? '查看预测' : 'Inspect forecast')} <Icon name="arrow" size={17} /></button></section>
          <section className="dashboard-grid">
            <article className="panel cash-flow-panel"><div className="panel-head"><div><p className="eyebrow">{locale === 'zh' ? '13 周预测' : '13-WEEK FORECAST'}</p><h2>{locale === 'zh' ? '现金流展望' : 'Cash flow outlook'}</h2></div><button className="outline-button" onClick={() => setActiveView('Cash flow')}><Icon name="chart" size={16} /> {locale === 'zh' ? '查看情景' : 'View scenario'}</button></div><div className="chart-legend"><span><i className="legend incoming"></i>{locale === 'zh' ? '预计现金' : 'Expected cash'}</span><span><i className="legend outgoing"></i>{locale === 'zh' ? '已承诺支出' : 'Committed outflows'}</span><span><i className="legend danger"></i>{locale === 'zh' ? '周转阈值' : 'Runway threshold'}</span></div><ForecastChart transactions={transactions} locale={locale} hoveredWeek={forecastHover} onHoverWeek={setForecastHover}/></article>
            <article className="panel action-panel"><div className="panel-head"><div><p className="eyebrow">{t(locale, "OWNER APPROVAL")}</p><h2>{t(locale, "Actions waiting for you")}</h2></div><button className="text-button" onClick={() => setActiveView('Approvals')}>{t(locale, "See all ")}<Icon name="arrow" size={16} /></button></div><div className="approval-list">{approvals.slice(0, 3).map((item) => <ApprovalRow locale={locale} draftReady={Boolean(collectionDraft)} key={item.id} item={item} onApprove={approve} />)}</div>{scheduledCount > 0 && <div className="scheduled-note"><Icon name="check" size={15} /> {locale === 'zh' ? `${scheduledCount} 项操作已在本地模拟安排` : `${scheduledCount} action${scheduledCount > 1 ? 's' : ''} scheduled in the local demo`}</div>}</article>
          </section>
          <section className="lower-grid">
            <article className="panel agent-panel"><div className="agent-heading"><div className="agent-avatar"><Icon name="sparkle" size={20} /></div><div><p className="eyebrow">{t(locale, "AI FINANCE COPILOT")}</p><h2>Runway Guard</h2></div><span className="online-dot">{t(locale, "Online")}</span></div><div className="agent-message"><RichAnswer text={agentMessage}/></div><form className="agent-input" onSubmit={askAgent}><input aria-label={locale === 'zh' ? '询问 Runway Guard' : 'Ask Runway Guard'} maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={locale === 'zh' ? '询问现金流…' : 'Ask about your cash flow…'} disabled={agentBusy} /><button type="submit" aria-label={locale === 'zh' ? '发送问题' : 'Send question'} disabled={agentBusy}><Icon name="arrow" size={18} /></button></form><div className="prompt-suggestions"><button onClick={() => setPrompt('Is payroll safe?')}>{t(locale, "Is payroll safe?")}</button><button onClick={() => setPrompt('What is the risk on Northstar?')}>{t(locale, "Explain the Northstar risk")}</button></div></article>
<article className="panel activity-panel"><div className="panel-head"><div><p className="eyebrow">{t(locale, "TRACEABLE BY DESIGN")}</p><h2>{t(locale, "Recent activity")}</h2></div><button className="text-button" onClick={() => setActiveView('Audit log')}>{t(locale, "Audit log ")}<Icon name="arrow" size={16} /></button></div><div className="activity-list">{activityLog.slice(0, 20).map((item) => <div className="activity-item" key={item.id ?? item.time + item.text}><span className={`activity-dot ${item.tone}`}></span><div><b>{t(locale, item.type)}</b><p>{item.text}</p></div><time>{item.time}</time></div>)}</div></article>
          </section>
          </> : <WorkspaceView activeView={activeView} approvals={approvals} onApprove={approve} prompt={prompt} setPrompt={setPrompt} chatHistory={chatHistory} collectionDraft={collectionDraft} agentRun={agentRun} agentProvider={agentProvider} agentBusy={agentBusy} onAskAgent={askAgent} sources={sources} transactions={transactions} activityLog={activityLog} onSync={syncSource} onImport={importTransactions} onReconcileTransaction={reconcileTransaction} onReconcileNewActivity={reconcileNewActivity} reconciliationFilter={reconciliationFilter} onReconciliationFilter={setReconciliationFilter} forecastHover={forecastHover} onForecastHover={setForecastHover} evaluation={evaluation} onRunEvaluation={runEvaluation} locale={locale} sandboxEvents={sandboxEvents} sandboxBusy={sandboxBusy} onRunSandbox={runSandbox} onExportEvidence={exportEvidence} demoStep={demoStep} onRunDemoStep={runDemoStep} forecastScenario={forecastScenario} onForecastScenario={setForecastScenario} pendingAction={pendingAgentAction} onConfirmAction={confirmAction} onCancelAction={cancelAction} onEditDraft={setCollectionDraft} onExportAudit={exportAudit} onClearChat={() => { if (agentBusy) return; setChatHistory([]); setPendingAgentAction(null); setAgentRun(null) }} />}
        </div>
      </section>
      {reviewItem && <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') setReviewId(null) }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><h2 id="review-title">{locale === 'zh' ? '审核交易' : 'Review transaction'}</h2><p><b>{reviewItem.merchant}</b><br/>{reviewItem.date} · {reviewItem.source}<br/>{reviewItem.amount < 0 ? '−' : ''}${Math.abs(reviewItem.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p>{locale === 'zh' ? '确认类别只会记录人工审核。没有匹配凭据，不会自动入账。' : 'Confirming a category records your review only. No counterpart match or ledger posting is claimed.'}</p><form onSubmit={saveReview}><label>{locale === 'zh' ? '类别' : 'Category'}<input autoFocus required maxLength={100} value={reviewCategory} onChange={(event) => setReviewCategory(event.target.value)} list="categories"/><datalist id="categories">{['Sales income', 'Inventory', 'Software', 'Shipping', 'Payroll', 'Accounts receivable', 'Other'].map((category) => <option key={category} value={category}/>)}</datalist></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setReviewId(null)}>{locale === 'zh' ? '取消' : 'Cancel'}</button><button type="submit" className="primary-button" disabled={!reviewCategory.trim() || reviewCategory.trim().toLowerCase() === 'uncategorized'}>{locale === 'zh' ? '确认审核' : 'Confirm review'}</button></div></form></section></div>}
      {toast && <div className="toast" role="status"><Icon name="check" size={17} />{toast}</div>}
    </main>
  )
}

function WorkspaceView({
  activeView,
  pendingAction, onConfirmAction, onCancelAction, onEditDraft, onExportAudit, onClearChat,
  approvals,
  onApprove,
  prompt,
  setPrompt,
  chatHistory,
  collectionDraft,
  agentRun,
  agentProvider,
  agentBusy,
  onAskAgent,
  sources,
  transactions,
  activityLog,
  onSync,
  onImport,
  onReconcileTransaction,
  onReconcileNewActivity,
  reconciliationFilter,
  onReconciliationFilter,
  forecastHover,
  onForecastHover,
  evaluation,
  onRunEvaluation,
  locale,
  sandboxEvents,
  sandboxBusy,
  onRunSandbox,
  onExportEvidence,
  demoStep,
  onRunDemoStep,
  forecastScenario,
  onForecastScenario,
}: {
  activeView: Exclude<View, 'Overview'>
  pendingAction: PendingAgentAction | null
  onConfirmAction: () => void
  onCancelAction: () => void
  onEditDraft: (draft: CollectionDraft) => void
  onExportAudit: () => void
  onClearChat: () => void
  approvals: Approval[]
  onApprove: (id: string) => void
  prompt: string
  setPrompt: (value: string) => void
  chatHistory: ChatMessage[]
  collectionDraft: CollectionDraft | null
  agentRun: AgentRun | null
  agentProvider: 'local-policy-agent' | 'openai-responses' | 'browser-fallback'
  agentBusy: boolean
  onAskAgent: (event: FormEvent) => void
  sources: DataSource[]
  transactions: Transaction[]
  activityLog: typeof activity
  onSync: (id: string) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onReconcileTransaction: (id: string) => void
  onReconcileNewActivity: () => void
  reconciliationFilter: ReconciliationFilter
  onReconciliationFilter: (filter: ReconciliationFilter) => void
  forecastHover: number | null
  onForecastHover: (week: number | null) => void
  evaluation: Evaluation | null
  onRunEvaluation: () => void
  locale: 'en' | 'zh'
  sandboxEvents: SandboxEvent[]
  sandboxBusy: boolean
  onRunSandbox: (provider: 'alipay' | 'wechat-pay') => void
  onExportEvidence: () => void
  demoStep: number
  onRunDemoStep: () => void
  forecastScenario: ForecastScenario
  onForecastScenario: (scenario: ForecastScenario) => void
}) {
  const [search, setSearch] = useState('')
  const conversationRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = conversationRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [chatHistory, agentBusy, activeView])
  const pending = approvals.filter((item) => item.status === 'Needs approval')
  const zh = locale === 'zh'
  const forecast = financialSnapshot(transactions, forecastScenario)
  const scenario = { runway: forecast.daysToBuffer, inflows: forecast.points.reduce((sum, point, index) => index === 0 ? sum : sum + point.cash - forecast.points[index - 1].cash + point.outflow, 0).toLocaleString() }
  const visibleTransactions = transactions.filter((item) => (reconciliationFilter === 'all' || (reconciliationFilter === 'review' ? item.status === 'Review' : item.status !== 'Review')) && (item.merchant + ' ' + item.category + ' ' + item.date).toLowerCase().includes(search.toLowerCase()))
  if (activeView === 'Cash flow') return <>
    <PageHeading kicker={zh ? '财务规划' : 'FINANCIAL PLANNING'} title={zh ? '现金流指挥中心' : 'Cash flow command center'} copy={zh ? '按周追踪现金计划和情景变化。' : 'Trace the plan behind your cash position, week by week.'} />
    <section className="view-grid wide-main">
      <article className="panel forecast-detail"><div className="panel-head"><div><p className="eyebrow">{zh ? '13 周预测' : '13-WEEK FORECAST'}</p><h2>{zh ? '流动性展望' : 'Liquidity outlook'}</h2></div><span className="policy-chip"><Icon name="chart" size={14} /> {zh ? '互动情景' : 'Interactive scenario'}</span></div><ForecastChart transactions={transactions} scenario={forecastScenario} locale={locale} hoveredWeek={forecastHover} onHoverWeek={onForecastHover}/><div className="forecast-table"><span>{zh ? '期初现金' : 'Starting cash'} <b>${forecast.cash.toLocaleString()}</b></span><span>{zh ? '预计流入' : 'Expected inflows'} <b className="positive-text">${scenario.inflows}</b></span><span>{zh ? '已承诺支出' : 'Committed outflows'} <b className="coral-text">${forecast.points.reduce((sum, point) => sum + point.outflow, 0).toLocaleString()}</b></span><span>{zh ? '最低缓冲' : 'Minimum buffer'} <b>$12,000</b></span></div></article>
      <article className="panel scenario-panel"><p className="eyebrow">{zh ? '假设分析' : 'WHAT IF'}</p><h2>{zh ? '情景规划器' : 'Scenario planner'}</h2><button type="button" className={`scenario-option ${forecastScenario === 'baseline' ? 'selected' : ''}`} onClick={() => onForecastScenario('baseline')}><span>0</span><div><b>{zh ? '基准预测' : 'Baseline forecast'}</b><p>{zh ? '不采取干预措施。' : 'No intervention is taken.'}</p></div><strong>{financialSnapshot(transactions).daysToBuffer} {zh ? '天' : 'days'}</strong></button><button type="button" className={`scenario-option ${forecastScenario === 'collect' ? 'selected' : ''}`} onClick={() => onForecastScenario('collect')}><span>1</span><div><b>{zh ? '本周催收 Northstar' : 'Collect Northstar this week'}</b><p>{zh ? '收回逾期发票 NS-172。' : 'Recover overdue invoice NS-172.'}</p></div><strong>+$7,250</strong></button><button type="button" className={`scenario-option ${forecastScenario === 'protect' ? 'selected' : ''}`} onClick={() => onForecastScenario('protect')}><span>2</span><div><b>{zh ? '推迟 BeanWorks 到 10 月 14 日' : 'Move BeanWorks to Oct 14'}</b><p>{zh ? '保留工资缓冲。' : 'Preserve a payroll buffer.'}</p></div><strong>$4,820</strong></button><div className="scenario-result"><span>{zh ? '距离缓冲缺口' : 'Days to buffer gap'}</span><b>{forecast.bufferMaintained ? `≥${scenario.runway}` : scenario.runway} {zh ? '天' : 'days'}</b><p>{forecast.shortfall > 0 ? (zh ? '缓冲缺口：' : 'Buffer gap: ') + '$' + forecast.shortfall.toLocaleString() : (zh ? '在预测范围内保持缓冲' : 'Buffer maintained within forecast horizon')}</p></div></article>
    </section>
  </>
  if (activeView === 'Reconciliation') return <>
    <PageHeading kicker={zh ? '账本质量' : 'LEDGER QUALITY'} title={zh ? '对账工作台' : 'Reconciliation workspace'} copy={zh ? '审核交易类别。没有匹配凭据时，不会声称已自动匹配。' : 'Review transaction categories. No automatic matches are claimed without evidence.'} />
    <section className="reconcile-summary"><div><span>{zh ? '已处理交易' : 'Transactions processed'}</span><b>{transactions.length}</b></div><div><span>{zh ? '已审核 / 演示已匹配' : 'Reviewed / demo matched'}</span><b className="positive-text">{transactions.filter((item) => item.status !== 'Review').length}</b><small>{zh ? '不生成虚假置信度' : 'No fabricated confidence scores'}</small></div><div><span>{zh ? '需要审核' : 'Needs review'}</span><b className="coral-text">{transactions.filter((item) => item.status === 'Review').length}</b><small>{zh ? '不会自动入账' : 'Nothing is posted automatically'}</small></div><button className="primary-button" onClick={onReconcileNewActivity}><Icon name="sparkle" /> {transactions.some((item) => item.status === 'Review') ? (zh ? '审核新交易' : 'Review new activity') : (zh ? '没有新交易' : 'No new items')}</button></section>
    <article className="panel reconciliation-table"><div className="panel-head"><div><p className="eyebrow">{zh ? '匹配审核' : 'MATCH REVIEW'}</p><h2>{zh ? '交易审核队列' : 'Transaction review queue'}</h2></div><div className="filter-controls" aria-label={zh ? '交易筛选' : 'Transaction filter'}><button className={`outline-button ${reconciliationFilter === 'all' ? 'active-filter' : ''}`} onClick={() => onReconciliationFilter('all')}>{zh ? '全部' : 'All'}</button><button className={`outline-button ${reconciliationFilter === 'review' ? 'active-filter' : ''}`} onClick={() => onReconciliationFilter('review')}>{zh ? '需审核' : 'Needs review'}</button><button className={`outline-button ${reconciliationFilter === 'matched' ? 'active-filter' : ''}`} onClick={() => onReconciliationFilter('matched')}>{zh ? '已审核 / 匹配' : 'Reviewed / matched'}</button></div></div><input className="review-search" aria-label={zh ? '搜索交易' : 'Search transactions'} placeholder={zh ? '搜索商家、类别或日期…' : 'Search merchant, category or date…'} value={search} onChange={(event) => setSearch(event.target.value)}/><div className="table-head"><span>{zh ? '交易' : 'Transaction'}</span><span>{zh ? '标准化类别' : 'Normalized category'}</span><span>{zh ? '审核依据' : 'Review basis'}</span><span>{zh ? '审核' : 'Review'}</span></div>{visibleTransactions.map((transaction) => <div className="match-row" key={transaction.id}><div><b>{transaction.date} · {transaction.merchant}</b><span>{transaction.amount < 0 ? '−' : ''}${Math.abs(transaction.amount).toLocaleString()}</span></div><div>{t(locale, transaction.category)}</div><div><span className={`confidence ${transaction.status === 'Review' ? 'missing' : ''}`}>{transaction.status === 'Review' ? '—' : (transaction.confidence === undefined ? (zh ? '人工 / 演示' : 'Manual / demo') : `${transaction.confidence}%`)}</span></div><button className={transaction.status === 'Review' ? 'review-needed' : 'review-ready'} onClick={() => onReconcileTransaction(transaction.id)}>{transaction.status === 'Review' ? (zh ? '审核类别' : 'Review category') : transaction.status === 'Reviewed' ? (zh ? '编辑审核' : 'Edit review') : (zh ? '查看 / 审核' : 'View / review')}</button></div>)}{visibleTransactions.length === 0 && <div className="empty-state">{zh ? '没有符合该筛选条件的交易。' : 'No transactions match this filter.'}</div>}</article>
  </>
  if (activeView === 'Agent workspace') return <>
    <PageHeading kicker={zh ? 'AI 财务助手' : 'AI FINANCE COPILOT'} title={zh ? '询问 Runway Guard' : 'Ask Runway Guard'} copy={zh ? '助手会分析演示账本，只能准备操作，不能执行财务操作。' : 'The assistant reasons over the demo ledger and can only prepare—not perform—financial actions.'} />
    <section className="guided-demo" aria-label={zh ? '引导演示' : 'Guided judging demo'}><div><p className="eyebrow">{zh ? '评委演示流程' : 'JUDGE-READY DEMO'}</p><b>{demoStep === 0 ? (zh ? '1. 识别工资风险' : '1. Detect the payroll risk') : demoStep === 1 ? (zh ? '2. 准备需人工批准的补救操作' : '2. Prepare a human-approved recovery action') : demoStep === 2 ? (zh ? '3. 阻止恶意的银行账户变更指令' : '3. Block a malicious bank-change instruction') : (zh ? '演示完成 — 已展示三项控制' : 'Demo complete — all three controls demonstrated')}</b><span>{demoStep < 3 ? (zh ? '点击一次，即可使用实时助手运行下一项安全情景。' : ' One click runs the next safe scenario using the live agent.') : (zh ? '重置后可再次演练。' : ' Reset to rehearse the flow again.')}</span></div><button className="primary-button" onClick={onRunDemoStep} disabled={agentBusy}>{agentBusy ? (zh ? '运行中…' : 'Running…') : demoStep < 3 ? (zh ? '运行下一步' : 'Run next step') : (zh ? '重置演示' : 'Reset demo')} <Icon name="arrow" size={16}/></button><div className="demo-progress"><i className={demoStep >= 1 ? 'done' : ''}></i><i className={demoStep >= 2 ? 'done' : ''}></i><i className={demoStep >= 3 ? 'done' : ''}></i></div></section>
<section className="agent-workspace-grid"><article className="panel conversation-panel"><div className="agent-heading"><div className="agent-avatar"><Icon name="sparkle" size={20}/></div><div><h2>Runway Guard</h2><p className="online-dot">{t(locale, "Policy controls active")}</p></div><span className="agent-engine">{agentProvider === 'openai-responses' ? (zh ? 'AI + 工具' : 'LLM + tools') : agentProvider === 'browser-fallback' ? (zh ? '离线规则' : 'Offline rules') : (zh ? '规则工具' : 'Rule-based tools')}</span></div><div className="conversation" ref={conversationRef} role="log" aria-label={zh ? '对话记录' : 'Conversation history'}>{chatHistory.map((message) => <div className={`chat-bubble ${message.role === 'user' ? 'user' : 'guard'}`} style={message.role === 'user' ? { marginLeft: 'auto', background: '#6274e6', color: '#fff', borderRadius: '9px 9px 2px 9px' } : undefined} key={message.id}><span className="message-label">{message.role === 'user' ? (zh ? '你' : 'You') : 'Runway Guard'}</span><RichAnswer text={message.id === 'welcome' && zh ? '我可以检查账本、打开审核队列、起草 Northstar 提醒，或准备模拟的 BeanWorks 改期。此演示不会发送邮件或转账。' : message.content}/></div>)}{agentBusy && <div className="chat-bubble guard typing">{t(locale, "Checking the normalized ledger and policy controls…")}</div>}<div className="chat-bubble context"><b>{t(locale, "Tools available")}</b><span>{t(locale, "Cash forecast · Reconcile transactions · Draft collection reminder · Security review")}</span></div></div><div className="storage-note">{zh ? '对话和工作区保存在此浏览器中。最近 20 条消息会作为上下文发送给助手。' : 'Chat and workspace are saved in this browser. The last 20 messages are sent as assistant context.'} <button className="text-button" onClick={onClearChat} disabled={agentBusy}>{zh ? '清除对话' : 'Clear chat'}</button></div>{pendingAction && <div className="action-preview"><b>{zh ? '待确认操作' : 'Prepared action'}</b><p>{zh ? (pendingAction.kind === 'open-review' ? '打开待审核交易队列，不更改账本。' : pendingAction.kind === 'schedule-reminder' ? '在本地演示中安排 Northstar 提醒，不发送邮件。' : '在本地演示中安排 BeanWorks 日期变更，不进行转账。') : pendingAction.title}</p><button onClick={onConfirmAction} disabled={agentBusy}>{zh ? '确认' : 'Confirm action'}</button><button onClick={onCancelAction} disabled={agentBusy}>{zh ? '取消' : 'Cancel'}</button></div>}<form className="agent-input large" onSubmit={onAskAgent}><input aria-label={locale === 'zh' ? '询问 Runway Guard' : 'Ask Runway Guard'} maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={locale === 'zh' ? '询问 Harbor & Bean 的财务情况…' : 'Ask a question about Harbor & Bean…'} disabled={agentBusy}/><button type="submit" aria-label={locale === 'zh' ? '发送问题' : 'Send question'} disabled={agentBusy}>{agentBusy ? '…' : <Icon name="arrow" size={18}/>}</button></form><div className="prompt-suggestions"><button onClick={() => setPrompt('Is payroll safe?')}>{t(locale, "Is payroll safe?")}</button><button onClick={() => setPrompt('Reconcile my transactions')}>{t(locale, "Reconcile transactions")}</button><button onClick={() => setPrompt('Draft a Northstar reminder')}>{t(locale, "Draft Northstar reminder")}</button><button onClick={() => setPrompt('Show security risks')}>{t(locale, "Show security risks")}</button></div></article><article className="panel policy-panel"><p className="eyebrow">{t(locale, "SAFE EXECUTION")}</p><h2>{t(locale, "Action policy")}</h2><div className="policy-step"><span>1</span><div><b>{t(locale, "Read-only analysis")}</b><p>{t(locale, "Data is scoped to the selected business.")}</p></div></div><div className="policy-step"><span>2</span><div><b>{t(locale, "Tool allowlist")}</b><p>{t(locale, "Only verified finance operations can be prepared.")}</p></div></div><div className="policy-step"><span>3</span><div><b>{t(locale, "Owner confirmation")}</b><p>{t(locale, "Every consequential action waits for a human.")}</p></div></div><div className="threat-note"><Icon name="shield" size={17}/><div><b>{zh ? '转账工具已禁用' : 'Payment tools disabled'}</b><p>{t(locale, "Untrusted invoice text cannot override policy.")}</p></div></div></article></section>{agentRun && <AgentTrace locale={locale} run={agentRun} provider={agentProvider}/>} {collectionDraft && <CollectionDraftCard draft={collectionDraft} onChange={onEditDraft} locale={locale}/>}
  </>
  if (activeView === 'Integrations') return <>
    <PageHeading kicker={locale === 'zh' ? '数据基础' : 'DATA FOUNDATION'} title={locale === 'zh' ? '数据连接' : 'Integrations'} copy={locale === 'zh' ? '统一银行、支付与会计数据后，智能助手才能进行分析和准备操作。' : 'Normalize banking, payments, and accounting data before the agent can reason or act.'} />
    <section className="integration-overview"><div><span>{zh ? '演示数据源' : 'Demo data sources'}</span><b>{sources.filter((source) => source.status === 'Connected').length}</b></div><div><span>{zh ? '可分析交易' : 'Analyzable transactions'}</span><b>{transactions.length}</b></div><div><span>{zh ? '待审核行' : 'Rows awaiting review'}</span><b className="coral-text">{transactions.filter((transaction) => transaction.status === 'Review').length}</b></div><label className="primary-button import-button"><Icon name="plus" /> {zh ? '导入 CSV' : 'Import CSV'}<input aria-label={zh ? '导入交易 CSV' : 'Import transactions CSV'} type="file" accept=".csv,text/csv" onChange={onImport}/></label></section>
    <section className="integration-grid"><article className="panel source-list"><div className="panel-head"><div><p className="eyebrow">{t(locale, "CONNECTED SOURCES")}</p><h2>{t(locale, "Data adapters")}</h2></div><span className="policy-chip"><Icon name="shield" size={14}/> {t(locale, "Local demo only")}</span></div>{sources.map((source) => <div className="source-row" key={source.id}><div className={`source-badge ${source.color}`}>{source.name.charAt(0)}</div><div><b>{source.name}</b><p>{zh ? (source.id === 'wechat-pay' || source.id === 'alipay' ? '演示适配器 · 需要商户授权' : '本地样例适配器') : source.provider} · {source.records} {zh ? '条样例记录' : 'sample records'}</p></div><div className="source-status"><span>{locale === 'zh' ? (source.status === 'Connected' ? '演示已启用' : '未连接') : source.status === 'Connected' ? 'Demo active' : 'Not connected'}</span><small>{locale === 'zh' ? '本地模拟数据' : 'Local simulated data'}</small></div><button className="outline-button" disabled={sandboxBusy} onClick={() => source.id === 'wechat-pay' || source.id === 'alipay' ? onRunSandbox(source.id) : onSync(source.id)}>{source.id === 'wechat-pay' || source.id === 'alipay' ? (zh ? '运行沙箱' : 'Run sandbox') : (zh ? '检查演示' : 'Check demo')}</button></div>)}</article><article className="panel import-guide"><p className="eyebrow">{t(locale, "CSV CONTRACT")}</p><h2>{t(locale, "Bring your own data")}</h2><p>{t(locale, "Imports are read only in this prototype. The parser expects a header row with:")}</p><code>date, merchant, amount, category</code><a className="sample-link" href="/sample-transactions.csv" download>{t(locale, "Download sample CSV ")}<Icon name="arrow" size={14}/></a><div className="guide-check"><Icon name="check" size={15}/> {t(locale, "Valid rows become review items.")}</div><div className="guide-check"><Icon name="check" size={15}/> {t(locale, "Invalid rows are skipped, never silently posted.")}</div><div className="guide-check"><Icon name="check" size={15}/> {t(locale, "Imported rows persist in this browser. Rows are sent to the assistant when you ask a question.")}</div></article></section><article className="china-readiness"><p className="eyebrow">中国市场准备 / CHINA READINESS</p><h2>本地支付沙箱证据</h2><p>{t(locale, "Run safe, simulated payment checks for the submission. These test profiles never accept production API keys or make live payments.")}</p><div className="sandbox-actions"><button onClick={() => onRunSandbox('wechat-pay')} disabled={sandboxBusy}>运行微信支付沙箱</button><button onClick={() => onRunSandbox('alipay')} disabled={sandboxBusy}>运行支付宝沙箱</button>{sandboxEvents.length > 0 && <button className="secondary" onClick={onExportEvidence}>导出执行证据</button>}</div>{sandboxEvents.length > 0 && <div className="sandbox-result"><b>{sandboxEvents.length} logged checks</b><span>{sandboxEvents[0].operation} · {sandboxEvents[0].outcome}</span></div>}<div className="china-pills"><span>中文界面</span><span>中文财务提问</span><span>微信支付（沙箱）</span><span>支付宝（沙箱）</span></div></article>
  </>
  if (activeView === 'Approvals') return <>
    <PageHeading kicker={zh ? '所有者控制' : 'OWNER CONTROL'} title={zh ? '审批中心' : 'Approval center'} copy={zh ? '所有操作仅在本地模拟，不会发送邮件或转账。' : 'All actions are local simulations. No emails or payments leave this workspace.'} />
    <section className="approval-overview"><div><span>{t(locale, "Waiting for approval")}</span><b>{pending.length}</b></div><div><span>{t(locale, "Policy blocked")}</span><b className="coral-text">{approvals.filter((item) => item.status === 'Blocked').length}</b></div><div><span>{t(locale, "Scheduled safely")}</span><b className="positive-text">{approvals.filter((item) => item.status === 'Scheduled').length}</b></div></section>
    <article className="panel approval-page"><div className="panel-head"><div><p className="eyebrow">{t(locale, "ACTION QUEUE")}</p><h2>{t(locale, "Review recommended actions")}</h2></div><span className="policy-chip"><Icon name="shield" size={14}/> {t(locale, "Policy checked")}</span></div><div className="approval-list large-list">{approvals.map((item) => <ApprovalRow locale={locale} draftReady={Boolean(collectionDraft)} item={item} onApprove={onApprove} key={item.id}/>)}</div></article>
  </>
  return <>
    <PageHeading kicker={zh ? '合规证据' : 'COMPLIANCE EVIDENCE'} title={zh ? '审计日志' : 'Audit log'} copy={zh ? '记录助手工具、准备的操作、人工决定与模拟结果。' : 'A readable trail of agent tools, prepared actions, owner decisions, and simulated outcomes.'} />
<section className="audit-grid"><article className="panel audit-panel"><div className="panel-head"><div><p className="eyebrow">{zh ? '事件轨迹' : 'EVENT TRAIL'}</p><h2>{zh ? '活动时间线' : 'Activity timeline'}</h2></div><button className="outline-button" onClick={onExportAudit}>{zh ? '导出记录' : 'Export trace'} <Icon name="arrow" size={15}/></button></div><div className="audit-list">{activityLog.map((item) => <div className="audit-entry" key={item.id ?? item.time + item.text}><span className={`activity-dot ${item.tone}`}></span><div><small>{item.time} · {t(locale, item.type)} · {zh ? (activityActor(item) === 'Business owner' ? '所有者' : activityActor(item) === 'System' ? '系统' : '智能助手') : activityActor(item)}</small><b>{item.text}</b><p>{zh ? '本地模拟事件。未发送邮件或转账。' : 'Local simulation event. No emails sent or payments made.'}</p></div></div>)}</div></article><article className="panel evidence-panel"><p className="eyebrow">{zh ? '按需评估' : 'ON-DEMAND EVALUATION'}</p><h2>{zh ? '控制证据' : 'Control evidence'}</h2><div className="evidence-stat"><b>{evaluation ? `${evaluation.passed}/${evaluation.total}` : (zh ? '就绪' : 'Ready')}</b><span>{evaluation ? (zh ? '工作流情景已通过' : 'workflow scenarios passed') : (zh ? '服务器检查可用' : 'server-side checks available')}</span></div><div className="evidence-stat"><b>{evaluation ? evaluation.blockedUnsafeRequests : '—'}</b><span>{zh ? '已阻止不安全请求' : 'unsafe requests blocked'}</span></div><div className="evidence-stat"><b>{approvals.filter((item) => item.status !== 'Blocked').length}</b><span>{zh ? '项模拟操作需要所有者批准' : 'simulated actions require owner approval'}</span></div><button className="primary-button evaluation-button" onClick={onRunEvaluation}>{zh ? '运行控制检查' : 'Run control checks'} <Icon name="arrow" size={16}/></button></article></section>
  </>
}

function PageHeading({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return <section className="page-heading"><p className="eyebrow">{kicker}</p><h1>{title}</h1><p>{copy}</p></section>
}

function RichAnswer({ text }: { text: string }) {
  return <span style={{ whiteSpace: 'pre-line' }}>{text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : part)}</span>
}

function CollectionDraftCard({ draft, onChange, locale }: { draft: CollectionDraft; onChange: (draft: CollectionDraft) => void; locale: 'en' | 'zh' }) {
  const zh = locale === 'zh'
  return <section className="panel draft-editor" style={{ marginTop: 19 }}><div className="panel-head"><div><p className="eyebrow">{zh ? '可编辑草稿 · 未发送' : 'EDITABLE DRAFT · NOT SENT'}</p><h2>{zh ? 'Northstar 催收提醒' : 'Northstar collection reminder'}</h2></div><button className="outline-button" onClick={() => downloadFile('northstar-reminder.txt', 'To: ' + draft.customer + '\nSubject: ' + draft.subject + '\n\n' + draft.body, 'text/plain')}>{zh ? '下载草稿' : 'Download draft'}</button></div><label>{zh ? '主题' : 'Subject'}<input value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })}/></label><label>{zh ? '正文' : 'Message'}<textarea value={draft.body} onChange={(event) => onChange({ ...draft, body: event.target.value })}/></label></section>
}

function AgentTrace({ run, provider, locale }: { locale: 'en' | 'zh'; run: AgentRun; provider: string }) {
  return <section className="panel agent-trace"><div className="panel-head"><div><p className="eyebrow">LIVE AGENT TRACE · {provider.replaceAll('-', ' ')}</p><h2>{run.intent}</h2></div><span className={run.requiresApproval ? 'trace-approval' : 'trace-blocked'}>{t(locale, run.requiresApproval ? 'Confirmation required' : run.toolCalls.some((call) => call.status === 'blocked') ? 'Action blocked' : 'Read-only completed')}</span></div><div className="trace-grid"><div><b>{t(locale, "Plan")}</b><ol>{run.plan.map((step) => <li key={step}>{step}</li>)}</ol></div><div><b>{t(locale, "Tool calls")}</b>{run.toolCalls.map((tool, index) => <div className={`tool-call ${tool.status}`} key={tool.name + index}><Icon name={tool.status === 'blocked' ? 'shield' : 'check'} size={15}/><span><strong>{tool.name.replaceAll('_', ' ')}</strong>{tool.detail}</span></div>)}</div></div></section>
}

function ApprovalRow({ item, onApprove, locale, draftReady }: { locale: 'en' | 'zh'; item: Approval; onApprove: (id: string) => void; draftReady: boolean }) {
  const zh = locale === 'zh'
  const current = initialApprovals.find((approval) => approval.id === item.id) ?? item
  const title = zh ? (item.id === 'payment-219' ? '调整 BeanWorks 付款日期（模拟）' : item.id === 'reminder-172' ? '安排 Northstar 提醒（模拟）' : '供应商银行信息变更') : current.title
  const detail = zh ? (item.id === 'payment-219' ? '演示中将 BW-219 改期，不会转账。' : item.id === 'reminder-172' ? '请先让助手起草提醒。安排操作不会发送邮件。' : '未验证附件中的银行信息变更已阻止。') : current.detail
  const icon = item.status === 'Blocked' ? '!' : item.status === 'Scheduled' ? '✓' : item.title.includes('collection') ? '↗' : '↔'
  return <div className={`approval-row ${item.status === 'Blocked' ? 'blocked' : ''}`}><div className="approval-icon">{icon}</div><div className="approval-copy"><b>{title}</b><p>{detail}</p><span><i className={`risk-pill ${item.risk.toLowerCase()}`}></i>{zh ? ({ Low: '低风险', Medium: '中风险', High: '高风险' }[item.risk]) : item.risk + ' risk'} · {zh ? ({ 'Oct 14': '10月14日', Today: '今天', Blocked: '已阻止' }[item.due] ?? item.due) : item.due}</span></div><div className="approval-action"><strong>{item.amount}</strong>{item.status === 'Needs approval' ? <button onClick={() => onApprove(item.id)}>{item.id === 'reminder-172' && !draftReady ? (zh ? '准备草稿' : 'Prepare draft') : t(locale, 'Approve')}</button> : item.status === 'Scheduled' ? <div><span className="status-ready"><Icon name="check" size={14} /> {t(locale, "Scheduled")}</span><button className="undo-button" onClick={() => onApprove(item.id)}>{zh ? '撤销模拟' : 'Undo simulation'}</button></div> : <span className="status-blocked"><Icon name="shield" size={14} /> {t(locale, "Blocked")}</span>}</div></div>
}

export default App
