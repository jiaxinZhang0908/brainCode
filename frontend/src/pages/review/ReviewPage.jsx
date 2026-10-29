import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { answerCard, createCard, createKnowledge, listCards, listNotes, loadNote } from './api/reviewApi.js'
import PageHeader from '../../shared/components/PageHeader.jsx'
import Notice from '../../shared/components/Notice.jsx'

const ratings = [
  { key: 'AGAIN', label: '忘记了', helper: '再学一次', tone: 'rating-again' },
  { key: 'HARD', label: '很困难', helper: '想起来很吃力', tone: 'rating-hard' },
  { key: 'GOOD', label: '记得', helper: '稍微想了一下', tone: 'rating-good' },
  { key: 'EASY', label: '很轻松', helper: '马上就想起来', tone: 'rating-easy' },
]

export default function ReviewPage() {
  const [notes, setNotes] = useState([])
  const [cards, setCards] = useState([])
  const [active, setActive] = useState(null)
  const [activeNote, setActiveNote] = useState(null)
  const [noteMode, setNoteMode] = useState('existing')
  const [noteId, setNoteId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [prompt, setPrompt] = useState('')
  const [hasStudied, setHasStudied] = useState('yes')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [noteRows, cardRows] = await Promise.all([listNotes(), listCards(true)])
    setNotes(noteRows); setCards(cardRows)
  }, [])
  useEffect(() => { refresh().catch(e => setError(e.message)) }, [refresh])

  const dueCards = cards.filter(card => new Date(card.due_at) <= new Date())
  const nextCards = cards.filter(card => new Date(card.due_at) > new Date()).slice(0, 5)

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
      let targetId = noteId
      if (noteMode === 'new') {
        if (!newTitle.trim() || !newBody.trim()) throw new Error('请填写新知识标题和内容')
        const note = await createKnowledge({ title: newTitle, body: newBody }); targetId = note.id
      }
      await createCard({ noteId: targetId, prompt, hasStudied: hasStudied === 'yes' })
      setPrompt(''); setNewTitle(''); setNewBody(''); setMessage('复习卡片已创建，FSRS 已安排首次复习。'); await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <div className="page-content">
    <PageHeader eyebrow="SPACED REPETITION" title="复习工具" subtitle="按记忆状态安排下一次见面，让知识留得更久。" action={<span className="local-badge"><i /> FSRS 本地调度</span>} />
    <Notice error={error}>{message}</Notice>
    <section className="review-overview">
      <article className="review-stat panel"><span className="section-kicker">DUE NOW</span><strong>{dueCards.length}</strong><span>待复习卡片</span></article>
      <article className="review-stat panel"><span className="section-kicker">IN YOUR DECK</span><strong>{cards.length}</strong><span>复习卡片总数</span></article>
      <article className="review-hint panel"><span className="hint-icon">✳</span><div><strong>诚实地给出记忆感受</strong><p>FSRS 会依据“忘记、困难、记得、轻松”调整下一次复习时间。</p></div></article>
    </section>
    <div className="review-columns">
      <section className="panel review-queue"><div className="panel-heading"><div><span className="section-kicker">RECALL SESSION</span><h2>待复习</h2></div><span className="count-pill">{dueCards.length} 张</span></div>
        {active ? <div className="review-active"><div className="review-card-top"><span>{active.note_title}</span><button className="icon-button" onClick={() => { setActive(null); setActiveNote(null) }}>×</button></div><h3>{active.prompt}</h3><div className="answer-content"><small>知识笔记</small><div className="answer-body">{activeNote?.body || '没有笔记正文'}</div></div><div className="rating-grid">{ratings.map(rating => <button key={rating.key} className={`rating-button ${rating.tone}`} disabled={busy} onClick={() => submitRating(rating.key)}><strong>{rating.label}</strong><small>{rating.helper}</small></button>)}</div></div>
          : dueCards.length ? <div className="due-list">{dueCards.map(card => <button key={card.id} className="due-card" onClick={() => startReview(card)}><span className="due-mark">↻</span><span><strong>{card.note_title}</strong><small>{card.prompt}</small></span><span className="row-chevron">开始复习 ↗</span></button>)}</div>
            : <div className="queue-empty"><span>☼</span><strong>当前没有到期卡片</strong><small>可以添加新知识，FSRS 会为它安排第一次复习。</small></div>}
      </section>
      <section className="panel add-card-panel"><div className="panel-heading"><div><span className="section-kicker">ADD A CARD</span><h2>安排一次复习</h2></div><span className="note-glyph">＋</span></div>
        <form onSubmit={addCard} className="review-form"><div className="segmented"><button type="button" className={noteMode === 'existing' ? 'chosen' : ''} onClick={() => setNoteMode('existing')}>已有知识</button><button type="button" className={noteMode === 'new' ? 'chosen' : ''} onClick={() => setNoteMode('new')}>新知识</button></div>
          {noteMode === 'existing' ? <label>选择知识<select value={noteId} onChange={e => setNoteId(e.target.value)}><option value="">选择一条知识</option>{notes.map(note => <option value={note.id} key={note.id}>{note.title}</option>)}</select></label>
            : <><label>知识标题<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例如：什么是间隔重复？" /></label><label>知识内容<textarea rows="3" value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="简单记录概念或答案" /></label></>}
          <label>复习问题<textarea rows="3" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="写一个能帮助你主动回忆的问题" /></label>
          <fieldset><legend>这个知识之前学过吗？</legend><label className="radio-line"><input type="radio" checked={hasStudied === 'yes'} onChange={() => setHasStudied('yes')} />学过，正在巩固</label><label className="radio-line"><input type="radio" checked={hasStudied === 'no'} onChange={() => setHasStudied('no')} />还没学过，作为新卡开始</label></fieldset>
          <button className="button button-dark full-button" disabled={busy}>{busy ? '正在安排…' : '创建复习卡片'} <span>↗</span></button>
        </form><p className="helper-text">复习状态保存在本地 SQLite，排期由 FSRS 在本机计算。</p>
      </section>
    </div>
    {nextCards.length > 0 && <section className="panel upcoming-panel"><div className="panel-heading"><div><span className="section-kicker">COMING UP</span><h2>即将到期</h2></div><Link to="/brain" className="text-link">整理知识 ↗</Link></div><div className="upcoming-list">{nextCards.map(card => <div key={card.id}><strong>{card.note_title}</strong><span>{new Date(card.due_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>)}</div></section>}
  </div>
}
