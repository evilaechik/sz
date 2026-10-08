import { financialSnapshot } from './lib/finance'
import type { ForecastScenario, Transaction } from './lib/finance'

export default function ForecastChart({ locale, hoveredWeek, onHoverWeek, transactions, scenario = 'baseline' }: {
  locale: 'en' | 'zh'; hoveredWeek: number | null; onHoverWeek: (index: number | null) => void
  transactions: Transaction[]; scenario?: ForecastScenario
}) {
  const zh = locale === 'zh'
  const data = financialSnapshot(transactions, scenario)
  const money = (value: number) => new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
  const label = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const min = Math.min(0, ...data.points.map((point) => point.cash))
  const max = Math.max(data.threshold * 1.5, ...data.points.map((point) => Math.max(point.cash, point.outflow))) * 1.12
  const x = (index: number) => 10 + index / 12 * 680
  const y = (value: number) => 200 - (value - min) / (max - min) * 180
  const path = (field: 'cash' | 'outflow') => data.points.map((point, index) => (index ? 'L' : 'M') + x(index) + ' ' + y(point[field])).join(' ')
  const selected = hoveredWeek === null ? null : data.points[hoveredWeek]
  return <div className="forecast-widget">
    <div className="forecast-summary"><span>{zh ? '最低预计现金' : 'Lowest projected cash'} <b>{money(data.minimum.cash)}</b> · {label(data.minimum.date)}</span><strong className={data.shortfall ? 'coral-text' : 'positive-text'}>{data.shortfall ? (zh ? '缓冲缺口 ' : 'Buffer gap ') + money(data.shortfall) : (zh ? '高于最低缓冲' : 'Above minimum buffer')}</strong></div>
    <div className="live-chart" tabIndex={0} role="group" aria-label={zh ? '现金预测，使用左右箭头查看各周' : 'Cash forecast. Use left and right arrows to explore weeks.'}
      onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onHoverWeek(Math.max(0, Math.min(12, Math.round(((event.clientX - rect.left) / rect.width * 700 - 10) / 680 * 12)))) }}
      onPointerLeave={() => onHoverWeek(null)} onFocus={() => onHoverWeek(0)} onBlur={() => onHoverWeek(null)}
      onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); onHoverWeek(event.key === 'Home' ? 0 : event.key === 'End' ? 12 : Math.max(0, Math.min(12, (hoveredWeek ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)))) } }}>
      <svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1="10" x2="690" y1={20 + ratio * 180} y2={20 + ratio * 180} stroke="#e9edf6" />)}
        <path d={path('cash') + ' L690 200 L10 200 Z'} fill="#e9edff" />
        <line x1="10" x2="690" y1={y(data.threshold)} y2={y(data.threshold)} stroke="#e89080" strokeDasharray="5 5" />
        <path d={path('outflow')} fill="none" stroke="#93bdb6" strokeWidth="2" strokeDasharray="5 3" />
        <path d={path('cash')} fill="none" stroke="#6877e8" strokeWidth="3" />
        {selected && hoveredWeek !== null && <><line x1={x(hoveredWeek)} x2={x(hoveredWeek)} y1="10" y2="200" stroke="#9aa9d2" strokeDasharray="4 3"/><circle cx={x(hoveredWeek)} cy={y(selected.cash)} r="5" fill="white" stroke="#6877e8" strokeWidth="3"/></>}
      </svg>
      {selected && <div className="forecast-tooltip" style={{ left: (hoveredWeek ?? 0) > 7 ? 'auto' : '10px', right: (hoveredWeek ?? 0) > 7 ? '10px' : 'auto' }} role="status"><b>{label(selected.date)}</b><span>{zh ? '预计现金' : 'Expected cash'}: {money(selected.cash)}</span><span>{zh ? '每周支出' : 'Weekly outflows'}: {money(selected.outflow)}</span><span>{zh ? '缓冲阈值' : 'Buffer threshold'}: {money(data.threshold)}</span></div>}
    </div>
    <div className="forecast-dates">{data.points.map((point, index) => <span key={point.date}>{index % 2 === 0 ? label(point.date) : ''}</span>)}</div>
    <p className="forecast-assumptions">{zh ? '演示假设 · CSV 净额调整期初现金 · 紫色：现金，绿色虚线：每周支出，红色虚线：缓冲阈值。使用鼠标、触摸或方向键查看。' : 'Demo assumptions · CSV net amounts adjust opening cash · Purple: cash; green: weekly outflows; red: buffer. Hover, touch or use arrow keys.'}</p>
  </div>
}
