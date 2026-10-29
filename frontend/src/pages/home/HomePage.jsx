import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { completeLearningTask, deleteDailyRecord, listDailyRecords, loadDashboard, saveDailyRecord } from './api/homeApi.js'
import { API_BASE_URL } from '../../shared/api/client.js'

function mondayIso(date = new Date()) {
  const monday = new Date(date)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function shiftWeek(iso, delta) {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + delta * 7)
  return mondayIso(date)
}

function WeekCalendar({ weekStart, tasks = [], onWeekChange, onToday, today }) {
  const start = new Date(`${weekStart}T12:00:00`)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, date, tasks: tasks.filter(task => task.date === key) }
  })
  const monthLabel = start.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
  const sameWeek = mondayIso() === weekStart
  return <section className="learning-page-card week-calendar-card">
    <div className="week-calendar-toolbar"><div className="week-calendar-controls"><button onClick={onToday} disabled={sameWeek}>今天</button><button onClick={() => onWeekChange(-1)} aria-label="上一周">‹</button><button onClick={() => onWeekChange(1)} aria-label="下一周">›</button><h3>{monthLabel}</h3></div><span className="week-view-label">周视图 ▾</span></div>
    <div className="week-calendar-grid">
      {days.map((day, index) => {
        const isToday = day.key === today
        return <div className={`week-day-column ${isToday ? 'is-today' : ''}`} key={day.key}>
          <header><span>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index]}</span><b>{day.date.getDate()}</b></header>
          <div className="week-day-events">{day.tasks.length ? day.tasks.map(task => <article className={`week-event ${task.type === 'review' ? 'review-event' : 'study-event'} ${task.done ? 'event-done' : ''}`} key={`${task.type}-${task.id}`}>
            <small>{task.type === 'review' ? '复习' : `${task.minutes || 0} 分钟`}</small><strong>{task.title}</strong><p>{task.content}</p>{Boolean(task.done) && <span className="event-done-mark">已完成</span>}
          </article>) : <div className="week-day-empty">空闲</div>}</div>
        </div>
      })}
    </div>
    <div className="week-calendar-legend"><span><i className="study-legend" />学习计划</span><span><i className="review-legend" />复习任务</span><small>按计划日期排列；任务暂未设置具体时段</small></div>
  </section>
}

function Ring({ value, label, color = '#d9f2ef' }) {
  const percent = Math.max(0, Math.min(100, value))
  return <div className="scene-ring-wrap"><div className="scene-ring" style={{ '--value': `${percent}%`, '--ring-color': color }}><div><strong>{percent}%</strong><span>{label}</span></div></div></div>
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => mondayIso())
  const [panel, setPanel] = useState('')
  const [record, setRecord] = useState('')
  const [image, setImage] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [saving, setSaving] = useState(false)
  const [ripples, setRipples] = useState([])
  const sceneRef = useRef(null)
  const rippleId = useRef(0)
  const lastRipplePoint = useRef(null)

  const refresh = async () => {
    setLoading(true)
    try { setData(await loadDashboard(weekStart)); setError('') }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [weekStart])

  const openPanel = async name => {
    setPanel(name)
    setError('')
    if (name === 'record') {
      try { setHistory(await listDailyRecords()) } catch (e) { setError(e.message) }
    }
  }

  useEffect(() => {
    if (!panel) return
    const closeOnEscape = e => { if (e.key === 'Escape') setPanel('') }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [panel])

  const handlePointerMove = event => {
    const bounds = sceneRef.current?.getBoundingClientRect()
    if (!bounds) return
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    sceneRef.current.style.setProperty('--pointer-x', `${x}px`)
    sceneRef.current.style.setProperty('--pointer-y', `${y}px`)
    if (event.target.closest('button, a, input, textarea, label')) return
    const previous = lastRipplePoint.current
    if (!previous || Math.hypot(x - previous.x, y - previous.y) > 58) {
      lastRipplePoint.current = { x, y }
      const id = ++rippleId.current
      setRipples(items => [...items.slice(-9), { id, x, y, kind: 'trail' }])
      window.setTimeout(() => setRipples(items => items.filter(item => item.id !== id)), 1250)
    }
  }

  const handleRipple = event => {
    if (event.target.closest('button, a, input, textarea, label')) return
    const bounds = sceneRef.current?.getBoundingClientRect()
    if (!bounds) return
    const id = ++rippleId.current
    setRipples(items => [...items.slice(-9), { id, x: event.clientX - bounds.left, y: event.clientY - bounds.top, kind: 'click' }])
    window.setTimeout(() => setRipples(items => items.filter(item => item.id !== id)), 1900)
  }

  const chooseImage = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (file.size > 4 * 1024 * 1024) { setError('图片请控制在 4 MB 以内'); return }
    const reader = new FileReader()
    reader.onload = () => { setImage(String(reader.result || '')); setError('') }
    reader.onerror = () => setError('图片读取失败，请重试')
    reader.readAsDataURL(file)
  }

  const addRecord = async event => {
    event.preventDefault()
    if (!record.trim() && !image) return
    setSaving(true)
    try {
      await saveDailyRecord(record, image)
      setRecord(''); setImage(''); setShowHistory(true)
      setHistory(await listDailyRecords())
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const finishTask = async id => {
    try { await completeLearningTask(id); await refresh() }
    catch (e) { setError(e.message) }
  }

  const removeRecord = async id => {
    try {
      await deleteDailyRecord(id)
      setHistory(items => items.filter(item => item.id !== id))
      setConfirmDeleteId('')
      await refresh()
    } catch (e) { setError(e.message) }
  }

  const learningTasks = data?.learningTasks || []
  const reviewTasks = data?.reviewTasks || []
  const learningDone = Number(data?.stats?.learningDone || 0)
  const reviewsDone = Number(data?.stats?.reviewsToday || 0)
  const learningPercent = learningTasks.length + learningDone ? Math.round(learningDone / (learningTasks.length + learningDone) * 100) : 0
  const reviewPercent = reviewTasks.length + reviewsDone ? Math.round(reviewsDone / (reviewTasks.length + reviewsDone) * 100) : 0
  const dateLabel = data?.date ? new Date(`${data.date}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) : '今天'

  return <div ref={sceneRef} className="home-scene-content" onPointerMove={handlePointerMove} onPointerDown={handleRipple}>
    <div className="scene-cursor-glow" aria-hidden="true" />
    {ripples.map(ripple => <span key={ripple.id} className={`scene-ripple ripple-${ripple.kind}`} style={{ left: ripple.x, top: ripple.y }} />)}
    <div className="scene-tint" />
    <section className="scene-welcome">
      <div className="scene-date">{dateLabel} <span>✦</span> YOUR QUIET SPACE</div>
      <h1>把日子过成<br /><em>自己的节奏。</em></h1>
      <p>学一点，记一点，让每个念头都有地方安放。</p>
      <div className="scene-quick-stats"><span><b>{learningTasks.length + reviewTasks.length}</b> 项今日待办</span><i /><span><b>{learningDone + reviewsDone}</b> 项已经完成</span></div>
      <a className="scene-export" href={`${API_BASE_URL}/calendar/export.ics`}>导出日历 <span>↗</span></a>
    </section>

    <div className="scene-caption"><span className="caption-line" />RAINY DAY, SOFT THOUGHTS</div>
    <aside className="scene-rail" aria-label="快捷功能">
      <button onClick={() => openPanel('record')} aria-label="记录"><span>✎</span><small>记录</small></button>
      <button onClick={() => openPanel('learning')} aria-label="学习"><span>◷</span><small>学习</small></button>
    </aside>

    {panel === 'learning' && <div className="learning-page-overlay" role="dialog" aria-modal="true" aria-labelledby="learning-page-title">
      <div className="learning-page-shell">
        <header className="learning-page-header"><div><div className="modal-eyebrow">TODAY, AT YOUR OWN PACE</div><h2 id="learning-page-title">今天的学习</h2><p>{dateLabel} · 每一点投入都算数</p></div><span className="learning-esc-hint">按 <kbd>Esc</kbd> 返回主页</span></header>
        {error && <div className="scene-error">{error}</div>}
        {loading ? <div className="learning-empty">正在整理今天的学习节奏…</div> : <>
          <section className="learning-overview-row">
            <article className="learning-page-card overview-stat"><span className="modal-eyebrow">TODAY'S LEARNING</span><div><Ring value={learningPercent} label="学习" /><p>已完成 <b>{learningDone}</b> 项学习</p></div></article>
            <article className="learning-page-card overview-stat"><span className="modal-eyebrow">TODAY'S REVIEW</span><div><Ring value={reviewPercent} label="复习" color="#f4dfbe" /><p>已完成 <b>{reviewsDone}</b> 项复习</p></div></article>
            <article className="learning-page-card overview-stat overview-total"><span className="modal-eyebrow">YOUR DAILY PLAN</span><strong>{learningTasks.length + reviewTasks.length}</strong><p>今日待完成任务</p><Link to="/brain" onClick={() => setPanel('')}>去安排新的学习计划 ↗</Link></article>
          </section>
          <div className="learning-page-grid">
            <WeekCalendar weekStart={data?.weekStart || weekStart} tasks={data?.weekTasks || []} onWeekChange={delta => { setLoading(true); setWeekStart(current => shiftWeek(current, delta)) }} onToday={() => { setLoading(true); setWeekStart(mondayIso()) }} today={data?.date} />
            <section className="learning-page-card learning-agenda"><div className="learning-card-heading"><div><span className="modal-eyebrow">TODAY'S TASKS</span><h3>今日任务</h3></div><span className="learning-count">{learningTasks.length + reviewTasks.length} 项</span></div>
              <div className="agenda-summary"><span><b>{learningTasks.length}</b> 项学习</span><i /><span><b>{reviewTasks.length}</b> 项复习</span></div>
              {learningTasks.length + reviewTasks.length === 0 && <p className="learning-empty">今天没有待完成任务，给自己留一点自由时间。</p>}
              <div className="learning-task-list full-task-list">
                {learningTasks.map(task => <div className="scene-task-row" key={task.id}><button className="scene-task-check" onClick={() => finishTask(task.id)} aria-label="完成任务" /><div><strong>{task.plan_title || '学习计划'}</strong><p>{task.content}</p><small>{task.minutes} 分钟 · 第 {task.day_number} 天</small></div></div>)}
                {reviewTasks.map(task => <Link className="scene-task-row" to="/review" onClick={() => setPanel('')} key={task.id}><span className="scene-task-check" /><div><strong>{task.note_title}</strong><p>{task.prompt}</p><small>到期复习 · 点击开始</small></div><span className="task-arrow">↗</span></Link>)}
              </div>
            </section>
          </div>
        </>}
      </div>
    </div>}

    {panel === 'record' && <div className="scene-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPanel('') }}>
      <section className="scene-modal glass-surface record-modal" role="dialog" aria-modal="true" aria-labelledby="scene-modal-title">
        <button className="scene-modal-close" onClick={() => setPanel('')} aria-label="关闭">×</button>
        <>
          <div className="modal-eyebrow">A MOMENT TO KEEP</div><h2 id="scene-modal-title">留住这一刻</h2><p className="modal-intro">写下今天的想法，也可以附上一张照片。</p>
          {error && <div className="scene-error">{error}</div>}
          <form className="scene-record-form" onSubmit={addRecord}>
            <textarea value={record} onChange={e => setRecord(e.target.value)} placeholder="今天发生了什么？此刻的心情、一个小发现……" rows="4" />
            {image && <div className="image-preview"><img src={image} alt="记录图片预览" /><button type="button" onClick={() => setImage('')}>移除图片 ×</button></div>}
            <div className="modal-form-actions"><label className="image-picker">＋ 添加图片<input type="file" accept="image/*" onChange={chooseImage} /></label><button className="scene-save-button" disabled={saving || (!record.trim() && !image)}>{saving ? '正在保存…' : '发布记录'} <span>↗</span></button></div>
          </form>
          <button className="history-toggle" onClick={() => setShowHistory(value => !value)}>{showHistory ? '收起历史记录' : `查看历史记录${history.length ? ` · ${history.length}` : ''}`} <span>{showHistory ? '⌃' : '⌄'}</span></button>
          {showHistory && <div className="scene-history">{history.length ? history.map(item => <article className="history-entry" key={item.id}><time>{new Date(item.created_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</time><p>{item.body || '（图片记录）'}</p>{item.image_data && <img src={item.image_data} alt="记录附件" />}<div className="history-entry-actions">{confirmDeleteId === item.id ? <><span>确认删除这条记录？</span><button onClick={() => removeRecord(item.id)}>确认删除</button><button onClick={() => setConfirmDeleteId('')}>取消</button></> : <button onClick={() => setConfirmDeleteId(item.id)}>删除记录</button>}</div></article>) : <div className="history-empty">还没有记录，留下一点今天的痕迹吧。</div>}</div>}
        </>
      </section>
    </div>}
  </div>
}
