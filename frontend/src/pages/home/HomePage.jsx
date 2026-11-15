import { useEffect, useRef, useState } from 'react'
import { deleteDailyRecord, listDailyRecords, saveDailyRecord } from './api/homeApi.js'
import RainGlass from '../../shared/components/RainGlass.jsx'

export default function HomePage() {
  const [error, setError] = useState('')
  const [panel, setPanel] = useState('')
  const [record, setRecord] = useState('')
  const [image, setImage] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [composerCollapsed, setComposerCollapsed] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [saving, setSaving] = useState(false)
  const sceneRef = useRef(null)
  const calendarFrameRef = useRef(null)

  const openPanel = async name => {
    setPanel(name)
    setError('')
    if (name === 'record') {
      setComposerCollapsed(false)
      try { setHistory(await listDailyRecords()) } catch (e) { setError(e.message) }
    }
  }

  useEffect(() => {
    if (!panel) return
    const closeOnEscape = e => { if (e.key === 'Escape') setPanel('') }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [panel])

  const handleCalendarFrameLoad = () => {
    calendarFrameRef.current?.contentDocument?.addEventListener('keydown', event => {
      if (event.key === 'Escape') setPanel('')
    })
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
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const removeRecord = async id => {
    try {
      await deleteDailyRecord(id)
      setHistory(items => items.filter(item => item.id !== id))
      setConfirmDeleteId('')
    } catch (e) { setError(e.message) }
  }

  return <div className="home-page-scroll">
    <section ref={sceneRef} className="home-scene-content">
      <RainGlass hostRef={sceneRef} />
      <section className="scene-welcome">
      <div className="scene-date">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} <span>✦</span> YOUR QUIET SPACE</div>
      <h1>把日子过成<br /><em>自己的节奏。</em></h1>
      <p>学一点，记一点，让每个念头都有地方安放。</p>
      </section>

    <div className="scene-caption"><span className="caption-line" />RAINY DAY, SOFT THOUGHTS</div>
    <aside className="scene-rail" aria-label="快捷功能">
      <button onClick={() => openPanel('record')} aria-label="记录"><span>✎</span><small>记录</small></button>
      <button onClick={() => openPanel('learning')} aria-label="学习"><span>◷</span><small>学习</small></button>
    </aside>
    </section>

    {panel === 'record' && <div className="scene-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPanel('') }}>
      <section className="scene-modal glass-surface record-modal" role="dialog" aria-modal="true" aria-labelledby="scene-modal-title">
        <button className="scene-modal-close" onClick={() => setPanel('')} aria-label="关闭">×</button>
        <>
          {!composerCollapsed && <>
          <div className="modal-eyebrow">A MOMENT TO KEEP</div><h2 id="scene-modal-title">留住这一刻</h2><p className="modal-intro">写下今天的想法，也可以附上一张照片。</p>
          {error && <div className="scene-error">{error}</div>}
          <form className="scene-record-form" onSubmit={addRecord}>
            <textarea value={record} onChange={e => setRecord(e.target.value)} placeholder="今天发生了什么？此刻的心情、一个小发现……" rows="4" />
            {image && <div className="image-preview"><img src={image} alt="记录图片预览" /><button type="button" onClick={() => setImage('')}>移除图片 ×</button></div>}
            <div className="modal-form-actions"><label className="image-picker">＋ 添加图片<input type="file" accept="image/*" onChange={chooseImage} /></label><button className="scene-save-button" disabled={saving || (!record.trim() && !image)}>{saving ? '正在保存…' : '发布记录'} <span>↗</span></button></div>
          </form>
          </>}
          <button className="history-toggle" type="button" onClick={() => { const collapsed = !composerCollapsed; setComposerCollapsed(collapsed); if (collapsed) setShowHistory(true) }}>{composerCollapsed ? '展开编辑区' : '收起编辑区'} <span>{composerCollapsed ? '⌄' : '⌃'}</span></button>
          {composerCollapsed && <h2 id="scene-modal-title">我的记录</h2>}
          <button className="history-toggle" onClick={() => setShowHistory(value => !value)}>{showHistory ? '收起历史记录' : `查看历史记录${history.length ? ` · ${history.length}` : ''}`} <span>{showHistory ? '⌃' : '⌄'}</span></button>
          {showHistory && <div className="scene-history">{history.length ? history.map(item => <article className="history-entry" key={item.id}><time>{new Date(item.created_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</time><p>{item.body || '（图片记录）'}</p>{item.image_data && <img src={item.image_data} alt="记录附件" />}<div className="history-entry-actions">{confirmDeleteId === item.id ? <><span>确认删除这条记录？</span><button onClick={() => removeRecord(item.id)}>确认删除</button><button onClick={() => setConfirmDeleteId('')}>取消</button></> : <button onClick={() => setConfirmDeleteId(item.id)}>删除记录</button>}</div></article>) : <div className="history-empty">还没有记录，留下一点今天的痕迹吧。</div>}</div>}
        </>
      </section>
    </div>}

    {panel === 'learning' && <div className="learning-calendar-overlay" role="dialog" aria-modal="true" aria-label="学习日历">
      <iframe ref={calendarFrameRef} src="/calendar.html" title="多分类学习日历" onLoad={handleCalendarFrameLoad} />
    </div>}
  </div>
}
