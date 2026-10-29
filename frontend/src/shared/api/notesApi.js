import { del, get, post, put } from './client.js'

export const listNotes = q => get(`/notes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
export const loadNote = id => get(`/notes/${id}`)
export const createNote = note => post('/notes', note)
export const updateNote = (id, note) => put(`/notes/${id}`, note)
export const deleteNote = id => del(`/notes/${id}`)
