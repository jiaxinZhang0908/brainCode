import { get, post } from '../../../shared/api/client.js'
import { createNote, listNotes, loadNote } from '../../../shared/api/notesApi.js'
export { listNotes, loadNote }

export const createKnowledge = note => createNote(note)
export const listCards = all => get(`/reviews${all ? '?all=true' : ''}`)
export const createCard = card => post('/reviews', card)
export const answerCard = (id, rating) => post(`/reviews/${id}/answer`, { rating })
