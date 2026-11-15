import { useState } from 'react'

const dateParts = value => {
  const date = new Date(`${value}T12:00:00+08:00`)
  return { weekday: date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'short' }), monthDay: date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }) }
}
const clock = value => new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })
const pressure = count => count >= 6 ? 'high' : count >= 3 ? 'medium' : count ? 'low' : 'empty'

export default function ScheduleChart({ schedule, onStart, onDelete, onRequestDelete, deletingId, onCancelDelete }) {
  const days = schedule?.days || []
  const [selected, setSelected] = useState('')
  const selectedDate = selected || schedule?.today
  return <aside className="schedule-rail" aria-label="未来90天复习时间线">
    <div className="schedule-rail-heading"><span className="section-kicker">NEXT 90 DAYS</span><h2>复习时间线</h2></div>
    <div className="schedule-timeline" onWheel={event => { event.preventDefault(); event.currentTarget.scrollTop += event.deltaY }}>
      {days.map((day, index) => {
        const parts = dateParts(day.date), isSelected = selectedDate === day.date
        const taskCount = day.cards.length
        return <article key={day.date} className={`schedule-timeline-day ${isSelected ? 'selected' : ''} pressure-${pressure(taskCount)}`}>
          <button type="button" className="schedule-timeline-date" onClick={() => setSelected(isSelected ? '' : day.date)} aria-expanded={isSelected}>
            <span className="timeline-marker"><i /></span><span className="timeline-date-copy"><strong>{index === 0 ? '今天' : index === 1 ? '明天' : parts.weekday}</strong><small>{parts.monthDay}</small></span><span className="timeline-load">{taskCount} 张</span><span className="timeline-chevron">{isSelected ? '⌃' : '⌄'}</span>
          </button>
          {isSelected && <div className="schedule-day-cards">
            {day.cards.length ? day.cards.map((card, index) => <article className={`schedule-card-row ${card.predicted ? 'is-predicted' : ''}`} key={`${card.id}-${card.due_date || card.due_at}-${index}`}><div><strong>{card.note_title}</strong><p>{card.prompt}</p><small>{card.predicted ? '预计复习' : '到期复习'} · {clock(card.due_local || card.due_at)}</small></div><div className="schedule-card-actions"><button type="button" onClick={() => onStart(card)}>开始复习</button>{deletingId === card.id ? <><button type="button" className="danger-action" onClick={() => onDelete(card.id)}>确认删除</button><button type="button" onClick={onCancelDelete}>取消</button></> : <button type="button" className="danger-action" onClick={() => onRequestDelete(card.id)}>删除</button>}</div></article>) : <p className="schedule-empty">这天没有到期卡片。</p>}
          </div>}
        </article>
      })}
    </div>
  </aside>
}
