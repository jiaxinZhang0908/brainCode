import { get, post } from '../../../shared/api/client.js'
export { listNotes, loadNote, createNote, updateNote, deleteNote } from '../../../shared/api/notesApi.js'

export const loadGraph = nodeId => get(`/knowledge/graph${nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : ''}`)
export const suggestConnections = noteId => post('/knowledge/suggestions', { noteId })
export const chatWithKnowledge = (message, history = []) => post('/knowledge/chat', { message, history })
export const addConnection = edge => post('/knowledge/edges', edge)
export const createPlanDraft = draft => post('/plans/drafts', draft)
export const confirmPlan = id => post(`/plans/${id}/confirm`, {})
