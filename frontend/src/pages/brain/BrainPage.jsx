import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyNodeChanges, Background, Controls, ReactFlow, ReactFlowProvider, useOnViewportChange, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './brain-layout.css'
import { addConnection, createNote, deleteNote, listNotes, loadGraph, loadNote, suggestConnections, updateNote, chatWithKnowledge } from './api/brainApi.js'
import { arrangeNodes, loadSavedPositions, loadSavedViewport, savePositions, saveViewport } from './lib/graphLayout.js'
import {
  conversationDate, newConversation, persistActiveConversationId,
  persistConversations, readActiveConversationId, readConversations,
} from './lib/chatStore.js'
import { formatAssistantMessage } from '../../shared/lib/markdown.js'
import Notice from '../../shared/components/Notice.jsx'

function GraphFlow({ nodes: initialNodes, edges, onNodeClick, onNodesChange, onPaneClick, selectedId }) {
  const [nodes, setNodes] = useState(initialNodes)
  // 只在节点集合真正变化（新增/删除）时才同步，避免 edges 刷新或父组件重渲染导致的拖拽中断
  const prevIdsRef = useRef(null)
  useEffect(() => {
    const currentIds = initialNodes.map(n => n.id).join(',')
    if (prevIdsRef.current === currentIds) return
    prevIdsRef.current = currentIds
    setNodes(initialNodes)
  }, [initialNodes])
  const { fitView } = useReactFlow()
  const initialViewport = useRef(loadSavedViewport())
  const didInitialFit = useRef(Boolean(initialViewport.current))
  useOnViewportChange({ onChange: saveViewport })
  useEffect(() => {
    if (!nodes.length || didInitialFit.current) return
    didInitialFit.current = true
    const timer = window.setTimeout(() => fitView({ nodes: nodes.map(node => ({ id: node.id })), padding: .3, duration: 350 }), 80)
    return () => window.clearTimeout(timer)
  }, [nodes, fitView])
  const handleNodesChange = changes => { onNodesChange(changes); setNodes(current => applyNodeChanges(changes, current)) }
  return <ReactFlow nodes={nodes} edges={edges} defaultViewport={initialViewport.current || undefined} onNodesChange={handleNodesChange} onNodeClick={onNodeClick} onPaneClick={onPaneClick} nodesDraggable minZoom={.18} maxZoom={2} fitViewOptions={{ padding: .25 }}>
    <Background color="#314148" gap={28} size={1} /><Controls />
    <GraphOverview nodes={nodes} edges={edges} selectedId={selectedId} />
  </ReactFlow>
}

function GraphOverview({ nodes, edges, selectedId }) {
  const { setCenter, getZoom, screenToFlowPosition } = useReactFlow()
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  useOnViewportChange({ onChange: setViewport })
  const positions = nodes.map(n => n.position)
  const minX = Math.min(...positions.map(p => p.x), 0), maxX = Math.max(...positions.map(p => p.x), 0)
  const minY = Math.min(...positions.map(p => p.y), 0), maxY = Math.max(...positions.map(p => p.y), 0)
  const point = node => ({ x: 12 + (node.position.x - minX) / Math.max(maxX - minX, 1) * 156, y: 10 + (node.position.y - minY) / Math.max(maxY - minY, 1) * 86 })
  const byId = new Map(nodes.map(node => [node.id, node]))
  const pane = document.querySelector('.brain-map-canvas .react-flow')
  const bounds = pane?.getBoundingClientRect()
  const topLeft = bounds ? screenToFlowPosition({ x: bounds.left, y: bounds.top }) : null
  const bottomRight = bounds ? screenToFlowPosition({ x: bounds.right, y: bounds.bottom }) : null
  const mapPoint = pointFromWorld => ({ x: 12 + (pointFromWorld.x - minX) / Math.max(maxX - minX, 1) * 156, y: 10 + (pointFromWorld.y - minY) / Math.max(maxY - minY, 1) * 86 })
  const visibleRect = topLeft && bottomRight ? { x: mapPoint(topLeft).x, y: mapPoint(topLeft).y, width: Math.max(8, mapPoint(bottomRight).x - mapPoint(topLeft).x), height: Math.max(8, mapPoint(bottomRight).y - mapPoint(topLeft).y) } : null
  const jumpToOverviewPoint = event => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * 180
    const y = (event.clientY - rect.top) / rect.height * 112
    const worldX = minX + (x - 12) / 156 * (maxX - minX)
    const worldY = minY + (y - 10) / 86 * (maxY - minY)
    setCenter(worldX, worldY, { zoom: getZoom(), duration: 260 })
  }
  return <div className="brain-overview" data-zoom={viewport.zoom.toFixed(2)}><small>节点总览 · {nodes.length}</small><svg viewBox="0 0 180 112" role="img" aria-label={`总览，${nodes.length} 个节点`}>
    {edges.map(edge => { const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) return null; const p1 = point(a), p2 = point(b); return <line key={edge.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} /> })}
    {nodes.map(node => { const p = point(node); return <circle key={node.id} cx={p.x} cy={p.y} r={node.id === selectedId ? 4.5 : 3.5} className={node.id === selectedId ? 'active' : ''} /> })}
    {visibleRect && <rect className="overview-viewport" x={Math.max(12, Math.min(168, visibleRect.x))} y={Math.max(10, Math.min(96, visibleRect.y))} width={Math.min(156, visibleRect.width)} height={Math.min(86, visibleRect.height)} rx="3" />}
    <rect className="overview-hitarea" x="0" y="0" width="180" height="112" onClick={jumpToOverviewPoint} />
  </svg></div>
}

export default function BrainPage() {
  const [notes, setNotes] = useState([]), [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [selected, setSelected] = useState(null), [search, setSearch] = useState('')
  const [open, setOpen] = useState(false), [title, setTitle] = useState(''), [body, setBody] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [connectMode, setConnectMode] = useState(false), [connectionStart, setConnectionStart] = useState(null)
  const [conversations, setConversations] = useState(readConversations)
  const [activeConversationId, setActiveConversationId] = useState(readActiveConversationId)
  const [draft, setDraft] = useState('')
  const [chatWidth, setChatWidth] = useState(320)
  const [threadOpen, setThreadOpen] = useState(false), [threadConfirmId, setThreadConfirmId] = useState(null)
  const chatLogRef = useRef(null)
  const positionCache = useRef(loadSavedPositions())
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const refreshNotes = useCallback(async () => setNotes(await listNotes(search)), [search])
  const refreshGraph = useCallback(async (id) => setGraph(await loadGraph(id)), [])
  const messages = conversations.find(item => item.id === activeConversationId)?.messages || []
  const activeConversation = conversations.find(item => item.id === activeConversationId)
  useEffect(() => { persistConversations(conversations) }, [conversations])
  useEffect(() => { if (!conversations.some(item => item.id === activeConversationId)) setActiveConversationId(conversations[0]?.id || '') }, [conversations, activeConversationId])
  useEffect(() => { persistActiveConversationId(activeConversationId) }, [activeConversationId])
  useEffect(() => { if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight }, [messages, busy])
  useEffect(() => { refreshNotes().catch(e => setError(e.message)) }, [refreshNotes])
  useEffect(() => { refreshGraph().catch(e => setError(e.message)) }, [refreshGraph])
  useEffect(() => {
    if (!notice && !error) return
    const timer = window.setTimeout(() => { setNotice(''); setError('') }, 5000)
    return () => window.clearTimeout(timer)
  }, [notice, error])
  const nodes = useMemo(() => arrangeNodes(graph.nodes || [], graph.edges || [], selected?.id, positionCache.current), [graph.nodes, graph.edges, selected?.id])
  const edges = useMemo(() => (graph.edges || []).map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label,
    style: { stroke: '#78978d', strokeWidth: 1.5 }, labelStyle: { fill: '#afc2bd', fontSize: 11 }, labelBgStyle: { fill: '#101a1e' } })), [graph.edges])
  const chooseNode = async (_, node) => {
    if (connectMode) {
      if (!connectionStart) { setConnectionStart(node.id); setNotice('已选起点，再点击另一个节点完成连接。'); return }
      if (connectionStart === node.id) { setConnectionStart(null); setNotice('已取消连接起点。'); return }
      try { await addConnection({ sourceNoteId: connectionStart, targetNoteId: node.id, relation: '用户建立的关联' }); setConnectionStart(null); await refreshGraph(); setNotice('节点连接已建立。') }
      catch (e) { setError(e.message) }
      return
    }
    try { const full = await loadNote(node.id); setSelected(full); setConfirmDelete(false) } catch (e) { setError(e.message) }
  }
  const handleNodesChange = changes => {
    let changed = false
    for (const change of changes) if (change.type === 'position' && change.position) { positionCache.current.set(change.id, change.position); changed = true }
    if (changed) savePositions(positionCache.current)
  }
  const clearSelection = () => { setSelected(null); setOpen(false); setEditingId(null); setConnectionStart(null); setConfirmDelete(false) }
  const editSelected = () => {
    if (!selected) return
    setEditingId(selected.id); setTitle(selected.title); setBody(selected.body); setOpen(true)
  }
  const saveKnowledge = async e => {
    e.preventDefault(); if (!title.trim() || !body.trim()) return setError('请填写标题和知识内容')
    const isEditing = Boolean(editingId)
    setBusy(true); setError('')
    try {
      const saved = editingId ? await updateNote(editingId, { title, body }) : await createNote({ title, body }); setSelected(saved); setOpen(false); setEditingId(null); setTitle(''); setBody('')
      await refreshNotes(); await refreshGraph(); setNotice(isEditing ? '知识已更新，脑图和 AI 上下文已同步。' : '知识已加入脑图和 AI 上下文，正在分析关联…')
      if (isEditing) return
      setBusy(false)
      suggestConnections(saved.id).then(async result => {
        await refreshGraph()
        const details = (result.connections || []).map(item => `${item.keyPoint}（${item.relation}）`).join('；')
        if (details) setNotice(`已建立 ${result.linkedCount} 条具体关联：${details}`)
        else setNotice(result.message || '关联分析完成：暂未找到足够具体、可靠的连接。')
      }).catch(e2 => setError(`知识已保存，关联分析暂不可用：${e2.message}`))
    } catch (e2) { setError(e2.message) } finally { setBusy(false) }
  }
  const sendMessage = async e => {
    e.preventDefault(); const text = draft.trim(); if (!text || busy) return
    const conversationId = activeConversationId
    const history = messages.slice(-6); setConversations(v => v.map(item => item.id === conversationId ? { ...item, title: item.messages.length ? item.title : text.slice(0, 24), updatedAt: Date.now(), messages: [...item.messages, { role: 'user', content: text }] } : item)); setDraft(''); setBusy(true); setError('')
    try { const result = await chatWithKnowledge(text, history); setConversations(v => v.map(item => item.id === conversationId ? { ...item, updatedAt: Date.now(), messages: [...item.messages, { role: 'assistant', content: result.reply }] } : item)) }
    catch (e2) { setError(e2.message); setConversations(v => v.map(item => item.id === conversationId ? { ...item, messages: [...item.messages, { role: 'assistant', content: `暂时无法连接智能助理：${e2.message}` }] } : item)) }
    finally { setBusy(false) }
  }
  const startNewConversation = () => {
    const empty = conversations.find(item => item.messages.length === 0)
    if (empty) {
      setActiveConversationId(empty.id)
      setThreadOpen(false)
      setThreadConfirmId(null)
      setNotice('已有一个空白对话，直接继续使用。')
      return
    }
    const conversation = newConversation()
    setConversations(v => [...v, conversation])
    setActiveConversationId(conversation.id)
    setThreadOpen(false)
    setThreadConfirmId(null)
    setDraft('')
  }
  const removeConversation = id => {
    const remaining = conversations.filter(item => item.id !== id)
    if (!remaining.length) remaining.push(newConversation())
    setConversations(remaining)
    if (id === activeConversationId) setActiveConversationId(remaining[0].id)
    setThreadConfirmId(null)
    setDraft('')
  }
  const removeKnowledge = async () => {
    if (!selected) return
    try { await deleteNote(selected.id); setSelected(null); setConfirmDelete(false); await refreshNotes(); await refreshGraph(); setNotice('知识已删除。') } catch (e) { setError(e.message) }
  }
  const reanalyzeSelected = async () => {
    if (!selected || busy) return
    setBusy(true)
    try {
      const result = await suggestConnections(selected.id)
      await refreshGraph()
      const details = (result.connections || []).map(item => `${item.keyPoint}（${item.relation}）`).join('；')
      if (details) setNotice(`关联分析完成，新增 ${result.linkedCount} 条：${details}`)
      else setNotice(result.message || `分析了 ${result.candidateCount ?? 0} 条候选知识，本次没有确认出新的直接关联。`)
    } catch (e) { setError(`关联分析失败：${e.message}`) }
    finally { setBusy(false) }
  }
  const relation = async target => { if (!selected) return; try { await addConnection({ sourceNoteId: selected.id, targetNoteId: target, relation: '相关知识' }); await refreshGraph(selected.id); setNotice('知识关系已连接。') } catch (e) { setError(e.message) } }

  return <div className="page-content brain-page brain-dark">
    <header className="brain-topbar"><div className="brain-actions"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索知识节点" /><button className={connectMode ? 'brain-add connect-active' : 'brain-connect'} onClick={() => { setConnectMode(v => !v); setConnectionStart(null); setNotice(connectMode ? '已退出连接模式。' : '连接模式：依次点击两个节点。') }}>{connectMode ? '取消连接' : '⟷ 连接知识'}</button><button className="brain-add" onClick={() => { setEditingId(null); setTitle(''); setBody(''); setOpen(true) }}>＋ 添加知识</button></div></header>
    <Notice error={error}>{notice}</Notice>
    <div className="brain-workspace" style={{ '--chat-width': `${chatWidth}px` }}>
      <section className="brain-map-area"><div className="map-caption"><span>知识图谱</span><small>{graph.nodes?.length || 0} 个节点 · {graph.edges?.length || 0} 条连接　/　拖动节点，滚轮缩放</small></div>
        <div className="brain-map-canvas">{nodes.length ? <ReactFlowProvider><GraphFlow nodes={nodes.map(n => ({ ...n, className: connectMode && connectionStart === n.id ? 'connection-source' : '' }))} edges={edges} selectedId={selected?.id} onNodeClick={chooseNode} onNodesChange={handleNodesChange} onPaneClick={clearSelection} /></ReactFlowProvider> : <div className="brain-map-empty"><span>✳</span><strong>你的知识网络从这里生长</strong><small>点击右上角添加第一条知识</small></div>}</div>
        {selected && <div className="brain-selected">
          {confirmDelete ? <div className="node-delete-confirm"><small>确认删除</small><strong>删除「{selected.title}」？</strong><p>关联连线也会一并移除。</p><div><button onClick={() => setConfirmDelete(false)}>取消</button><button className="confirm-danger" onClick={removeKnowledge}>确认删除</button></div></div> : <><div><small>当前节点</small><strong>{selected.title}</strong><p>{selected.body?.slice(0, 170)}</p></div><div className="node-actions"><button onClick={reanalyzeSelected} disabled={busy}>重新分析</button><button onClick={editSelected}>修改</button><button onClick={() => setConfirmDelete(true)} title="删除知识">删除</button></div></>}
        </div>}
      </section>
      <aside className="brain-chat"><div className="chat-resize-handle" role="separator" aria-label="拖动调整对话栏宽度" onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e => { if (e.buttons) { const rect = e.currentTarget.parentElement.getBoundingClientRect(); setChatWidth(Math.max(280, Math.min(window.innerWidth * .55, rect.right - e.clientX))) } }} /><header><span className="chat-orb">✦</span><div><strong>知识助理</strong><small>已载入 {notes.length} 条知识 · 按需检索</small></div><span className="chat-online" /></header>
        <div className="chat-thread-toolbar">
          <div className="chat-thread-switch">
            <button className="chat-thread-trigger" onClick={() => { setThreadOpen(v => !v); setThreadConfirmId(null) }} aria-expanded={threadOpen} aria-label="切换或管理对话">
              <span>{conversationDate(activeConversation?.updatedAt)}</span>
              <strong>{activeConversation?.title || '新对话'}</strong>
              <i>{conversations.length}</i>
              <b className={threadOpen ? 'open' : ''}>⌄</b>
            </button>
            {threadOpen && <div className="chat-thread-panel">
              <div className="chat-thread-panel-head"><span>全部对话</span><button onClick={startNewConversation}>＋ 新对话</button></div>
              <ul>{conversations.map(item => <li key={item.id} className={item.id === activeConversationId ? 'active' : ''}>
                {threadConfirmId === item.id
                  ? <div className="chat-thread-confirm"><p>删除「{item.title}」？该对话的 {item.messages.length} 条消息将一并清除，且无法恢复。</p><div><button onClick={() => setThreadConfirmId(null)}>取消</button><button className="danger" onClick={() => removeConversation(item.id)}>确认删除</button></div></div>
                  : <div className="chat-thread-row">
                      <button className="chat-thread-pick" onClick={() => { setActiveConversationId(item.id); setThreadOpen(false) }}>
                        <span>{item.title}</span>
                        <small>{conversationDate(item.updatedAt)} · {item.messages.length} 条消息</small>
                      </button>
                      <button className="chat-thread-remove" title="删除对话" aria-label={`删除对话 ${item.title}`} onClick={() => setThreadConfirmId(item.id)}>⌫</button>
                    </div>}
              </li>)}</ul>
            </div>}
          </div>
        </div>
        <div className="brain-chat-log" ref={chatLogRef}><div className="chat-welcome"><span>✧</span><p>我会检索最相关的知识条目来回答。新增的知识会自动进入检索范围。</p></div>
          {messages.map((m, i) => <article key={i} className={`chat-message ${m.role}`}><small>{m.role === 'user' ? '你' : '知识助理'}</small><div className="chat-message-content" dangerouslySetInnerHTML={{ __html: formatAssistantMessage(m.content) }} /></article>)}
          {busy && <div className="chat-thinking">正在沿着知识脉络思考…</div>}
        </div>
        <form className="brain-chat-compose" onSubmit={sendMessage}><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }} placeholder="问问你的知识体系…" rows={2} /><button disabled={busy || !draft.trim()}>发送 ↗</button></form>
        <small className="chat-context-note">对话会按问题检索最相关的知识条目作为上下文</small>
      </aside>
    </div>
    {open && <div className="knowledge-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setOpen(false); setEditingId(null) } }}><form className="knowledge-modal" onSubmit={saveKnowledge}><button className="modal-close" type="button" onClick={() => { setOpen(false); setEditingId(null) }}>×</button><span className="section-kicker">{editingId ? 'EDIT KNOWLEDGE' : 'ADD TO YOUR KNOWLEDGE'}</span><h2>{editingId ? '编辑知识' : '新建知识'}</h2><p>{editingId ? '更新这条知识后，AI 会在后续对话中使用最新内容。' : '写下新概念，AI 会搜索公开网页，并分析它与现有知识的联系。'}</p><label>知识标题<input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="例如：间隔重复" /></label><label>内容<textarea value={body} onChange={e => setBody(e.target.value)} rows={7} placeholder="写下定义、理解、问题或例子……" /></label><div className="modal-footer"><small>{editingId ? '保存后更新知识图谱与 AI 上下文' : '保存后自动加入脑图与 AI 上下文'}</small><button className="brain-add" disabled={busy}>{busy ? '正在保存…' : editingId ? '保存修改' : '保存并分析关联'}</button></div></form></div>}
  </div>
}
