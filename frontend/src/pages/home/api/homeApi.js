import { del, get, post } from '../../../shared/api/client.js'

export const loadDashboard = weekStart => get(`/dashboard${weekStart ? `?week=${encodeURIComponent(weekStart)}` : ''}`)
export const saveDailyRecord = (body, imageData = '') => post('/dashboard/records', { body, imageData })
export const listDailyRecords = () => get('/dashboard/records')
export const deleteDailyRecord = id => del(`/dashboard/records/${id}`)
export const completeLearningTask = id => post(`/dashboard/tasks/${id}/complete`, {})
