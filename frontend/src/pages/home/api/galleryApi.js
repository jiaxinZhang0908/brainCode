import { get, post } from '../../../shared/api/client.js'

export const listPhotos = () => get('/gallery')
export const savePhoto = (imageData, caption) => post('/gallery', { imageData, caption })
