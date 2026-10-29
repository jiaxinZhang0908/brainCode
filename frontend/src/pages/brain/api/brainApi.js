import { get, post } from '../../../shared/api/client.js'
export { listNotes, loadNote, createNote, updateNote, deleteNote } from '../../../shared/api/notesApi.js'

export const loadGraph = nodeId => get(`/knowledge/graph${nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : ''}`)
export const suggestConnections = (noteId, provider) => post('/knowledge/suggestions', { noteId, provider })
export const addConnection = edge => post('/knowledge/edges', edge)
export const createPlanDraft = draft => post('/plans/drafts', draft)
export const confirmPlan = id => post(`/plans/${id}/confirm`, {})
