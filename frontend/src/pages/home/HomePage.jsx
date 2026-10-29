import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { completeLearningTask, loadDashboard, saveDailyRecord } from './api/homeApi.js'
import { API_BASE_URL } from '../../shared/api/client.js'
import PageHeader from '../../shared/components/PageHeader.jsx'
import Notice from '../../shared/components/Notice.jsx'

function Ring({ value, label, caption, color = '#477b63' }) {
  const percent = Math.max(0, Math.min(100, value))
  return <div className="ring-wrap"><div className="progress-ring" style={{ '--value': `${percent}%`, '--ring-color': color }}><div><strong>{percent}%</strong><span>{label}</span></div></div><small>{caption}</small></div>
}

function Calendar({ entries = [] }) {
  const counts = useMemo(() => new Map(entries.map(e => [e.date, Number(e.learning || 0) + Number(e.reviews || 0)])), [entries])
  const today = new Date()
  const days = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - (83 - index))
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, count: counts.get(key) || 0 }
  })
  return <div className="calendar-grid" aria-label="最近十二周学习记录">{days.map(day => <span key={day.key} className={`heat-cell heat-${Math.min(day.count, 4)}`} title={`${day.key} · ${day.count} 项`} />)}</div>
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [record, setRecord] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try { setData(await loadDashboard()); setError('') }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const addRecord = async event => {
    event.preventDefault()
    if (!record.trim()) return
    try { await saveDailyRecord(record); setRecord(''); await refresh() }
    catch (e) { setError(e.message) }
  }

  const finishTask = async id => {
    try { await completeLearningTask(id); await refresh() }
    catch (e) { setError(e.message) }
  }

  const total = (data?.learningTasks?.length || 0) + (data?.reviewTasks?.length || 0)
  const done = Number(data?.stats?.learningDone || 0) + Number(data?.stats?.reviewsToday || 0)
  const learningTotal = data?.learningTasks?.length || 0
  const reviewTotal = data?.reviewTasks?.length || 0
  const learningPercent = learningTotal + Number(data?.stats?.learningDone || 0)
    ? Math.round(Number(data?.stats?.learningDone || 0) / (learningTotal + Number(data?.stats?.learningDone || 0)) * 100) : 0
  const reviewPercent = reviewTotal + Number(data?.stats?.reviewsToday || 0)
    ? Math.round(Number(data?.stats?.reviewsToday || 0) / (reviewTotal + Number(data?.stats?.reviewsToday || 0)) * 100) : 0
  const dateLabel = data?.date ? new Date(`${data.date}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) : '今天'

  return <div className="page-content">
    <PageHeader eyebrow="YOUR DAILY GARDEN" title="早上好，今天也为自己留一点时间。" subtitle={dateLabel} action={<div className="home-actions"><a className="export-link" href={`${API_BASE_URL}/calendar/export.ics`}>导出日历 ↗</a><span className="local-badge"><i /> 本地空间</span></div>} />
    <Notice error={error} />
    {loading ? <div className="loading-card">正在整理今天的学习节奏…</div> : <>
      <section className="home-top-grid">
        <article className="panel task-panel">
          <div className="panel-heading"><div><span className="section-kicker">TODAY</span><h2>今天的安排</h2></div><span className="count-pill">{total} 项待完成</span></div>
          <div className="task-columns">
            <div className="task-group"><h3><span className="tiny-icon leaf">✳</span> 学习任务 <small>{data?.learningTasks?.length || 0}</small></h3>
              {data?.learningTasks?.length ? data.learningTasks.map(task => <div className="task-row" key={task.id}><button className="task-check task-check-button" title="标记完成" onClick={() => finishTask(task.id)} /><div><strong>{task.plan_title || '学习计划'}</strong><p>{task.content}</p><small>{task.minutes} 分钟 · 第 {task.day_number} 天 · {task.task_date}</small></div></div>) : <p className="empty-line">今天还没有学习任务，给新知识安排一个起点吧。</p>}
            </div>
            <div className="task-group"><h3><span className="tiny-icon amber">↻</span> 复习任务 <small>{data?.reviewTasks?.length || 0}</small></h3>
              {data?.reviewTasks?.length ? data.reviewTasks.map(task => <Link className="task-row task-link" to="/review" key={task.id}><span className="task-check" /><div><strong>{task.note_title}</strong><p>{task.prompt}</p><small>到期复习</small></div><span className="row-chevron">↗</span></Link>) : <p className="empty-line">目前没有到期复习，享受一下清爽的间隙。</p>}
            </div>
          </div>
        </article>
        <article className="panel progress-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR RHYTHM</span><h2>今天的节奏</h2></div><span className="sparkle">✳</span></div>
          <div className="rings"><Ring value={learningPercent} label="学习" caption="今日进度" /><Ring value={reviewPercent} label="复习" caption="今日进度" color="#d19b4d" /></div>
          <div className="progress-foot"><span>已完成学习 <b>{data?.stats?.learningDone || 0}</b></span><span>今日复习 <b>{data?.stats?.reviewsToday || 0}</b></span></div>
        </article>
      </section>
      <section className="home-bottom-grid">
        <article className="panel calendar-panel"><div className="panel-heading"><div><span className="section-kicker">SHOWING UP</span><h2>持续的痕迹</h2></div><span className="muted-label">近 12 周</span></div><Calendar entries={data?.calendar} /><div className="calendar-legend"><span>少</span>{[0, 1, 2, 3, 4].map(i => <i key={i} className={`heat-cell heat-${i}`} />)}<span>多</span></div><div className="calendar-note">每一小格，都是认真生活过的证据。</div></article>
        <article className="panel record-panel"><div className="panel-heading"><div><span className="section-kicker">A SMALL NOTE</span><h2>给今天留句话</h2></div><span className="note-glyph">✎</span></div>
          <form onSubmit={addRecord}><textarea value={record} onChange={e => setRecord(e.target.value)} placeholder="今天有什么值得记下？一个想法、一点进步，或者一个问题……" rows="4" /><div className="form-foot"><span>只保存在你的本地空间</span><button className="button button-dark" disabled={!record.trim()}>保存记录 <span>↗</span></button></div></form>
          {data?.records?.length > 0 && <div className="record-latest"><span className="record-dot" /><p>{data.records[0].body}</p></div>}
        </article>
      </section>
    </>}
  </div>
}
