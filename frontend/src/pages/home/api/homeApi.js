import { get, post } from '../../../shared/api/client.js'

export const loadDashboard = () => get('/dashboard')
export const saveDailyRecord = body => post('/dashboard/records', { body })
export const completeLearningTask = id => post(`/dashboard/tasks/${id}/complete`, {})
