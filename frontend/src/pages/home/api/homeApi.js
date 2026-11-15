import { del, get, post } from '../../../shared/api/client.js'

export const saveDailyRecord = (body, imageData = '') => post('/dashboard/records', { body, imageData })
export const listDailyRecords = () => get('/dashboard/records')
export const deleteDailyRecord = id => del(`/dashboard/records/${id}`)
