import { useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { addConnection, confirmPlan, createNote, createPlanDraft, deleteNote, listNotes, loadGraph, loadNote, suggestConnections, updateNote } from './api/brainApi.js'
import PageHeader from '../../shared/components/PageHeader.jsx'
import Notice from '../../shared/components/Notice.jsx'

function arrangeNodes(nodes, selectedId) {
  const radius = Math.max(100, Math.min(260, nodes.length * 30))
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index / Math.max(nodes.length, 1)) - Math.PI / 2
    return { id: node.id, data: { label: node.label }, position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
      style: { border: node.id === selectedId ? '2px solid #477b63' : '1px solid #deded3', background: node.id === selectedId ? '#e5efe7' : '#fffdf8', borderRadius: 14, padding: '12px 16px', minWidth: 110, color: '#25372e', fontWeight: 600, boxShadow: node.id === selectedId ? '0 8px 24px #477b6328' : '0 4px 14px #293c2810' } }
  })
}

function GraphFlow({ nodes, edges, onNodeClick, selectedId }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (nodes.length) fitView({ nodes: nodes.map(node => ({ id: node.id })), padding: 0.35, duration: 280 })
  }, [nodes, fitView])
  return <ReactFlow nodes={nodes} edges={edges} fitViewOptions={{ padding: 0.28 }} onNodeClick={onNodeClick} minZoom={0.2} maxZoom={1.8}>
    <Background color="#d8ddd2" gap={22} size={1} /><Controls /><MiniMap nodeColor={node => node.id === selectedId ? '#477b63' : '#d9c99d'} maskColor="#f6f5efaa" />
  </ReactFlow>
}

export default function BrainPage() {
  const [notes, setNotes] = useState([])
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [selected, setSelected] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState('ollama')
  const [suggestion, setSuggestion] = useState(null)
  const [relationship, setRelationship] = useState('相互关联')
  const [targetId, setTargetId] = useState('')
  const [planDays, setPlanDays] = useState(7)
  const [mastery, setMastery] = useState('能够独立讲清核心概念，并解决基础问题')
  const [plan, setPlan] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshNotes = useCallback(async () => setNotes(await listNotes(search)), [search])
  const refreshGraph = useCallback(async (id) => setGraph(await loadGraph(id)), [])
  useEffect(() => { refreshNotes().catch(e => setError(e.message)) }, [refreshNotes])
  useEffect(() => { refreshGraph().catch(e => setError(e.message)) }, [refreshGraph])

  const nodes = useMemo(() => arrangeNodes(graph.nodes || [], selected?.id), [graph.nodes, selected?.id])
  const edges = useMemo(() => (graph.edges || []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target,
    label: edge.label, animated: false, style: { stroke: '#9bab8d' }, labelStyle: { fill: '#607568', fontSize: 11 } })), [graph.edges])

  const chooseNote = async note => {
    try {
      const full = await loadNote(note.id); setSelected(full); setTitle(full.title); setBody(full.body); setSuggestion(null); setPlan(null)
      await refreshGraph(note.id)
    } catch (e) { setError(e.message) }
  }

  const onNodeClick = async (_, node) => {
    const note = notes.find(item => item.id === node.id) || { id: node.id, title: node.data.label }
    await chooseNote(note)
  }

  const saveNote = async event => {
    event?.preventDefault()
    if (!title.trim() || !body.trim()) { setError('先填写标题和内容'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = selected?.id ? await updateNote(selected.id, { title, body }) : await createNote({ title, body })
      setSelected(saved); setMessage('笔记已保存到本地 Markdown 文件。')
      await refreshNotes(); await refreshGraph()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const analyze = async () => {
    let noteId = selected?.id
    if (!noteId) {
      if (!title.trim() || !body.trim()) { setError('先填写标题和内容'); return }
      try {
        const saved = await createNote({ title, body }); noteId = saved.id; setSelected(saved)
        await refreshNotes(); await refreshGraph()
      } catch (e) { setError(e.message); return }
    }
    setBusy(true); setError(''); setSuggestion(null)
    try { setSuggestion(await suggestConnections(noteId, provider)); setMessage('AI 关联建议已生成，请确认后再建立图谱关系。') }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const createDraft = async () => {
    if (!selected?.id) { setError('先保存并选择一条知识'); return }
    setBusy(true); setError(''); setPlan(null)
    try { setPlan(await createPlanDraft({ noteId: selected.id, days: Number(planDays), mastery, provider })) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const saveEdge = async () => {
    if (!selected?.id || !targetId) { setError('请选择关联的知识'); return }
    try { await addConnection({ sourceNoteId: selected.id, targetNoteId: targetId, relation: relationship }); await refreshGraph(selected.id); setMessage('关系已加入知识图谱。') }
    catch (e) { setError(e.message) }
  }

  const removeNote = async () => {
    if (!selected?.id) return
    try { await deleteNote(selected.id); setSelected(null); setTitle(''); setBody(''); await refreshNotes(); await refreshGraph(); setMessage('笔记已删除。') }
    catch (e) { setError(e.message) }
  }

  return <div className="page-content brain-page">
    <PageHeader eyebrow="CONNECTED KNOWLEDGE" title="大脑外置" subtitle="把新想法放进已有的脉络里，看看它会连接到哪里。" action={<button className="button button-dark" onClick={() => { setSelected(null); setTitle(''); setBody(''); setSuggestion(null); setPlan(null) }}>＋ 新建知识</button>} />
    <Notice error={error}>{message}</Notice>
    <div className="brain-layout">
      <aside className="panel notes-sidebar"><div className="brain-panel-title"><div><span className="section-kicker">YOUR NOTES</span><h2>知识条目</h2></div><span className="count-pill">{notes.length}</span></div>
        <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="全文搜索…" />
        <div className="notes-list">{notes.map(note => <button key={note.id} className={`note-list-item ${selected?.id === note.id ? 'selected' : ''}`} onClick={() => chooseNote(note)}><span className="note-list-mark">✳</span><span><strong>{note.title}</strong><small>{new Date(note.updatedAt).toLocaleDateString('zh-CN')}</small></span></button>)}{!notes.length && <p className="empty-line">从一条新知识开始。</p>}</div>
      </aside>
      <section className="panel graph-panel"><div className="brain-panel-title"><div><span className="section-kicker">MIND MAP</span><h2>知识图谱</h2></div><span className="muted-label">点击节点查看邻近知识</span></div>
        <div className="graph-canvas">{nodes.length ? <ReactFlowProvider><GraphFlow nodes={nodes} edges={edges} selectedId={selected?.id} onNodeClick={onNodeClick} /></ReactFlowProvider> : <div className="graph-empty"><span>⌘</span><strong>你的知识关系会在这里生长</strong><small>保存笔记后，它会成为图谱中的一个节点</small></div>}</div>
        <div className="graph-footer"><span><i className="legend-node" /> {graph.nodes?.length || 0} 个知识节点</span><span><i className="legend-edge" /> {graph.edges?.length || 0} 条已确认关系</span></div>
      </section>
      <aside className="panel editor-panel"><div className="brain-panel-title"><div><span className="section-kicker">NOTE STUDIO</span><h2>{selected ? '编辑知识' : '新建知识'}</h2></div>{selected && <button className="icon-button danger" title="删除笔记" onClick={removeNote}>⌫</button>}</div>
        <form onSubmit={saveNote} className="note-form"><label>标题<input value={title} onChange={e => setTitle(e.target.value)} placeholder="给这个想法一个名字" /></label><label>内容 <span className="field-hint">支持 Markdown</span><textarea value={body} onChange={e => setBody(e.target.value)} rows="8" placeholder="记下你的理解、问题或例子……" /></label><button className="button button-outline full-button" disabled={busy}>{busy ? '处理中…' : '保存笔记'}</button></form>
        <div className="divider" />
        <div className="form-section"><div className="subheading"><span>AI 关联分析</span><span className="ai-spark">✦</span></div><p className="helper-text">让模型结合已有笔记，给出可供你确认的连接建议。</p><select value={provider} onChange={e => setProvider(e.target.value)}><option value="ollama">Ollama（本地）</option><option value="deepseek">DeepSeek API</option></select><button className="button button-soft full-button" onClick={analyze} disabled={busy || !selected}>生成关联建议</button>
          {suggestion && <div className="suggestion-box"><small>{suggestion.provider} · {suggestion.model}</small><p>{suggestion.suggestions}</p></div>}
        </div>
        <div className="divider" />
        <div className="form-section"><div className="subheading"><span>建立知识关系</span></div><select value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">选择一条相关知识</option>{notes.filter(n => n.id !== selected?.id).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select><input value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="关系描述" /><button className="button button-text full-button" onClick={saveEdge} disabled={!selected}>＋ 确认关系</button></div>
      </aside>
    </div>
    <section className="panel plan-builder"><div className="plan-intro"><span className="section-kicker">FROM IDEA TO PRACTICE</span><h2>把知识变成学习计划</h2><p>计划会结合这条新知识和已有知识生成草案，确认后才会加入每日任务。</p></div><div className="plan-controls"><label>计划天数<input type="number" min="1" max="180" value={planDays} onChange={e => setPlanDays(e.target.value)} /></label><label>希望学到什么程度<input value={mastery} onChange={e => setMastery(e.target.value)} /></label><button className="button button-dark" onClick={createDraft} disabled={busy || !selected}>生成计划草案 <span>✦</span></button></div>
      {plan && <div className="plan-preview"><div className="plan-preview-head"><div><strong>{plan.title} · {plan.days} 天</strong><small>由 {plan.provider} 生成 · 目标：{plan.mastery}</small></div><button className="button button-dark" onClick={async () => { try { await confirmPlan(plan.id); setMessage('学习计划已确认，任务已加入首页。'); setPlan(null) } catch (e) { setError(e.message) } }}>确认并加入今日任务</button></div><div className="plan-days">{plan.plan.days.map(day => <article key={day.day}><span>DAY {day.day}</span><strong>{day.focus}</strong><small>{day.minutes} 分钟</small><ul>{day.tasks?.map((task, i) => <li key={i}>{task}</li>)}</ul></article>)}</div></div>}
    </section>
  </div>
}
