import { del, get, post } from '../../../shared/api/client.js'
import { createNote, listNotes, loadNote } from '../../../shared/api/notesApi.js'
export { listNotes, loadNote }

export const createKnowledge = note => createNote(note)
export const listCards = all => get(`/reviews${all ? '?all=true' : ''}`)
export const createCard = card => post('/reviews', card)
export const answerCard = (id, rating) => post(`/reviews/${id}/answer`, { rating })
export const deleteCard = id => del(`/reviews/${id}`)
export const getSchedule = days => get(`/reviews/schedule?days=${days}`)
export const getForecast = (id, count = 5) => get(`/reviews/${id}/forecast?count=${count}`)
export const suspendCard = id => post(`/reviews/${id}/suspend`, {})
export const resumeCard = id => post(`/reviews/${id}/resume`, {})
