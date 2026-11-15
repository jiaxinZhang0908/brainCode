import { useCallback, useEffect, useState } from 'react'
import { answerCard, createCard, createKnowledge, deleteCard, getSchedule, listCards, listNotes, loadNote, resumeCard, suspendCard } from './api/reviewApi.js'
import PageHeader from '../../shared/components/PageHeader.jsx'
import Notice from '../../shared/components/Notice.jsx'
import ScheduleChart from './components/ScheduleChart.jsx'
import CardForecast from './components/CardForecast.jsx'

const ratings = [
  { key: 'AGAIN', label: '忘记了', helper: '再学一次', tone: 'rating-again' },
  { key: 'HARD', label: '很困难', helper: '想起来很吃力', tone: 'rating-hard' },
  { key: 'GOOD', label: '记得', helper: '稍微想了一下', tone: 'rating-good' },
  { key: 'EASY', label: '很轻松', helper: '马上就想起来', tone: 'rating-easy' },
]
const localDateTime = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const friendlyDue = value => {
  const date = new Date(value), now = new Date(), tomorrow = new Date()
  const key = d => d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' })
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = key(date) === key(now) ? '今天' : key(date) === key(tomorrow) ? '明天' : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
  return `${day} ${date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })}`
}
const cardInterval = card => card.last_reviewed_at ? Math.max(0, (new Date(card.due_at) - new Date(card.last_reviewed_at)) / 86400000) : 0
const cardStatus = card => card.suspended ? ['已暂停', 'paused'] : Number(card.review_count) === 0 ? ['新卡', 'new'] : cardInterval(card) < 7 ? ['学习中', 'learning'] : cardInterval(card) <= 21 ? ['巩固中', 'consolidating'] : ['已巩固', 'solidified']

export default function ReviewPage() {
  const [notes, setNotes] = useState([])
  const [cards, setCards] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [active, setActive] = useState(null)
  const [activeNote, setActiveNote] = useState(null)
  const [noteMode, setNoteMode] = useState('existing')
  const [noteId, setNoteId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [expandedCardId, setExpandedCardId] = useState('')
  const [firstReviewChoice, setFirstReviewChoice] = useState('now')
  const [customFirstReview, setCustomFirstReview] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const refresh = useCallback(async () => {
    const [noteRows, cardRows, calendar] = await Promise.all([listNotes(), listCards(true), getSchedule(90)])
    setNotes(noteRows); setCards(cardRows); setSchedule(calendar)
  }, [])
  useEffect(() => { refresh().catch(e => setError(e.message)) }, [refresh])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3000); return () => window.clearTimeout(timer) }, [message])
  useEffect(() => { if (!showAddModal) return; const closeOnEscape = event => { if (event.key === 'Escape') setShowAddModal(false) }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape) }, [showAddModal])

  const activeCards = cards.filter(card => !card.suspended)
  const sevenDayCount = (schedule?.days || []).slice(0, 7).reduce((sum, day) => sum + day.count, 0)
  const solidifiedCount = activeCards.filter(card => Number(card.review_count) > 0 && cardInterval(card) > 21).length

  const startReview = async card => {
    try { setActive(card); setActiveNote(await loadNote(card.note_id)); setError('') }
    catch (e) { setError(e.message) }
  }

  const submitRating = async rating => {
    if (!active) return
    setBusy(true); setError('')
    try {
      const result = await answerCard(active.id, rating)
      setMessage(`已记录「${ratings.find(r => r.key === rating)?.label}」，下次复习：${result.dueLocalDate}`)
      setActive(null); setActiveNote(null); await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const addCard = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (!prompt.trim()) throw new Error('请填写复习问题')
      let targetId = noteId
      if (noteMode === 'new') {
        if (!newTitle.trim()) throw new Error('请填写知识标题')
        const note = await createKnowledge({ title: newTitle.trim(), body: '' }); targetId = note.id
      }
      let firstReviewAt
      if (firstReviewChoice === 'today') { const d = new Date(); d.setHours(20, 0, 0, 0); firstReviewAt = d.toISOString() }
      if (firstReviewChoice === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); firstReviewAt = d.toISOString() }
      if (firstReviewChoice === 'custom') {
        if (!customFirstReview) throw new Error('请选择首次复习时间')
        const selected = new Date(customFirstReview)
        if (selected < new Date()) throw new Error('首次复习时间不能早于现在')
        firstReviewAt = selected.toISOString()
      }
      const created = await createCard({ noteId: targetId, prompt, hasStudied: noteMode === 'existing', firstReviewAt })
      setPrompt(''); setNewTitle(''); setFirstReviewChoice('now'); setCustomFirstReview(''); setShowAddModal(false); setMessage(`复习卡片已创建，首次复习：${friendlyDue(created.dueAt)}`); await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const removeCard = async id => {
    setBusy(true); setError('')
    try {
      await deleteCard(id)
      setConfirmDeleteId('')
      setMessage('复习卡片已删除。')
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const toggleSuspend = async card => {
    setBusy(true); setError('')
    try { if (card.suspended) await resumeCard(card.id); else await suspendCard(card.id); await refresh() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const beginCardReview = async card => { await startReview(card); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return <div className="page-content review-page">
    <PageHeader eyebrow="SPACED REPETITION" title="复习工具" subtitle="按记忆状态安排下一次见面，让知识留得更久。" action={<span className="local-badge"><i /> FSRS 本地调度</span>} />
    <Notice error={error}>{message}</Notice>
    <div className="review-columns">
      <ScheduleChart schedule={schedule} onStart={beginCardReview} onRequestDelete={id => setConfirmDeleteId(id)} onDelete={removeCard} deletingId={confirmDeleteId} onCancelDelete={() => setConfirmDeleteId('')} />
      <div className="review-main-column">
      <section className="review-overview">
        <article className="review-stat panel"><span className="section-kicker">TODAY</span><strong>{schedule?.days?.[0]?.count ?? 0}</strong><span>今日待复习</span></article>
        <article className="review-stat panel"><span className="section-kicker">NEXT 7 DAYS</span><strong>{sevenDayCount}</strong><span>7 天内到期</span></article>
        <article className="review-stat panel"><span className="section-kicker">IN YOUR DECK</span><strong>{cards.length}</strong><span>卡片总数</span></article>
        <article className="review-stat panel"><span className="section-kicker">MASTERED</span><strong>{solidifiedCount}</strong><span>已巩固 · 间隔超 21 天</span></article>
      </section>
      {active && <section className="panel review-session"><div className="review-session-heading"><div><span className="section-kicker">RECALL SESSION</span><h2>正在复习</h2></div><button className="icon-button" onClick={() => { setActive(null); setActiveNote(null) }}>×</button></div><div className="review-active"><div className="review-card-top"><span>{active.note_title}</span></div><h3>{active.prompt}</h3><div className="answer-content"><small>知识笔记</small><div className="answer-body">{activeNote?.body || '没有笔记正文'}</div></div><div className="rating-grid">{ratings.map(rating => <button key={rating.key} className={`rating-button ${rating.tone}`} disabled={busy} onClick={() => submitRating(rating.key)}><strong>{rating.label}</strong><small>{rating.helper}</small></button>)}</div></div></section>}
      {showAddModal && <div className="review-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAddModal(false) }}><section className="panel add-card-panel review-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-review-title"><button type="button" className="review-modal-close" onClick={() => setShowAddModal(false)} aria-label="关闭">×</button><div className="panel-heading"><div><span className="section-kicker">ADD A CARD</span><h2 id="add-review-title">安排一次复习</h2></div><span className="note-glyph">＋</span></div>
        <form onSubmit={addCard} className="review-form"><div className="segmented"><button type="button" className={noteMode === 'existing' ? 'chosen' : ''} onClick={() => setNoteMode('existing')}>已有知识</button><button type="button" className={noteMode === 'new' ? 'chosen' : ''} onClick={() => setNoteMode('new')}>新知识</button></div>
          {noteMode === 'existing' ? <label>选择知识<select value={noteId} onChange={e => setNoteId(e.target.value)}><option value="">选择一条知识</option>{notes.map(note => <option value={note.id} key={note.id}>{note.title}</option>)}</select></label>
            : <label>知识标题<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例如：什么是间隔重复？" /></label>}
          <label>复习问题<textarea rows="3" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="写一个能帮助你主动回忆的问题" /></label>
          <fieldset className="first-review-field"><legend>首次复习时间</legend><div className="first-review-options">{[['now', '立即'], ['today', '今天稍后 · 20:00'], ['tomorrow', '明天 · 09:00'], ['custom', '自选']].map(([value, label]) => <label key={value} className={firstReviewChoice === value ? 'selected' : ''}><input type="radio" name="firstReview" checked={firstReviewChoice === value} onChange={() => setFirstReviewChoice(value)} />{label}</label>)}</div>{firstReviewChoice === 'custom' && <input className="first-review-custom" type="datetime-local" min={localDateTime(new Date())} value={customFirstReview} onChange={e => setCustomFirstReview(e.target.value)} />}</fieldset>
          <button className="button button-dark full-button" disabled={busy}>{busy ? '正在安排…' : '创建复习卡片'} <span>↗</span></button>
        </form><p className="helper-text">复习状态保存在本地 SQLite，排期由 FSRS 在本机计算。</p></section></div>}
      <section className="panel upcoming-panel review-deck-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR DECK</span><h2>我的复习卡片</h2></div><button type="button" className="button button-dark add-review-trigger" onClick={() => setShowAddModal(true)}>＋ 添加复习</button></div><div className="review-deck-list">{cards.length ? cards.map(card => { const [status, statusClass] = cardStatus(card); const expanded = expandedCardId === card.id; return <article className={`review-deck-item ${expanded ? 'expanded' : ''}`} key={card.id}><button className="review-deck-summary" type="button" onClick={() => setExpandedCardId(expanded ? '' : card.id)} aria-expanded={expanded}><span className="review-deck-copy"><strong>{card.note_title}</strong><p>{card.prompt}</p><span className="review-deck-meta"><small className={`review-status ${statusClass}`}>{status}</small><small>下次复习：{friendlyDue(card.due_at)}</small></span></span><span className="row-chevron">{expanded ? '收起⌃' : '查看日程⌄'}</span></button>{expanded && <CardForecast card={card} onStart={beginCardReview} onRequestDelete={id => setConfirmDeleteId(id)} onDelete={removeCard} confirmDelete={confirmDeleteId === card.id} onCancelDelete={() => setConfirmDeleteId('')} onSuspend={() => toggleSuspend(card)} onResume={() => toggleSuspend(card)} busy={busy} />}</article> }) : <div className="queue-empty"><strong>还没有复习卡片</strong><small>安排首次复习后，卡片会显示在这里。</small></div>}</div></section>
      </div>
    </div>
  </div>
}
