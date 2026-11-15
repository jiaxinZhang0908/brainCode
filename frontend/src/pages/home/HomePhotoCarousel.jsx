import { useEffect, useRef, useState } from 'react'
import { listPhotos, savePhoto } from './api/galleryApi.js'

async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.88)
}

export default function HomePhotoCarousel() {
  const [photos, setPhotos] = useState([])
  const [index, setIndex] = useState(0)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const drag = useRef(null)
  const dragged = useRef(false)
  const sectionRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRevealed(true)
        observer.disconnect()
      }
    }, { threshold: 0.12 })
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    listPhotos().then(setPhotos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!lightbox) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  const move = direction => {
    if (!photos.length) return
    setIndex(current => (current + direction + photos.length) % photos.length)
  }

  const upload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (file.size > 20 * 1024 * 1024) { setError('原始照片请小于 20 MB'); return }
    setUploading(true)
    setError('')
    try {
      const imageData = await preparePhoto(file)
      const photo = await savePhoto(imageData, caption.trim() || file.name.replace(/\.[^.]+$/, ''))
      const updated = await listPhotos()
      setPhotos(updated)
      setIndex(Math.max(0, updated.findIndex(item => item.id === photo.id)))
      setCaption('')
    } catch (e) { setError(e.message || '照片保存失败') }
    finally { setUploading(false) }
  }

  const onPointerDown = event => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY }
    dragged.current = false
  }
  const onPointerUp = event => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    drag.current = null
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
      dragged.current = true
      move(dx < 0 ? 1 : -1)
    }
  }
  const onKeyDown = event => {
    if (event.key === 'ArrowLeft') move(-1)
    if (event.key === 'ArrowRight') move(1)
  }

  const visiblePhotos = photos.map((photo, photoIndex) => {
    let offset = photoIndex - index
    if (offset > photos.length / 2) offset -= photos.length
    if (offset < -photos.length / 2) offset += photos.length
    return { photo, offset, photoIndex }
  }).filter(item => Math.abs(item.offset) <= 2)
  const cardStep = Math.min(360, Math.max(170, viewportWidth * 0.25))

  return <section ref={sectionRef} className={`memory-gallery ${revealed ? 'is-revealed' : ''}`} aria-label="个人照片轮播">
    <div className="gallery-topline"><span>PERSONAL ARCHIVE <i /> 2026</span><span className="gallery-monogram">M</span><span>DRAG TO EXPLORE <i>↗</i></span></div>
    <div className="gallery-heading">
      <div><span className="gallery-kicker">A LITTLE FILM OF MY LIFE</span><h2>把喜欢的瞬间，留在这里。</h2><p>向下滑动，慢慢翻看你的照片。</p></div>
      <div className="gallery-tools"><input value={caption} onChange={event => setCaption(event.target.value)} placeholder="给照片加一句话" aria-label="照片说明" /><label className={`gallery-upload ${uploading ? 'is-uploading' : ''}`}>{uploading ? '正在保存…' : '＋ 添加照片'}<input type="file" accept="image/*" onChange={upload} disabled={uploading} /></label></div>
    </div>
    {error && <div className="gallery-error">{error}<button onClick={() => setError('')}>×</button></div>}
    {loading ? <div className="gallery-empty">正在打开你的相册…</div> : photos.length ? <>
      <div className="gallery-stage" tabIndex="0" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
        <button className="gallery-arrow gallery-prev" onClick={() => move(-1)} aria-label="上一张">‹</button>
        <div className="gallery-deck">{visiblePhotos.map(({ photo, offset, photoIndex }) => <button key={photo.id} className={`gallery-card ${offset === 0 ? 'is-active' : ''}`} style={{ '--card-offset': offset, '--card-x': `${offset * cardStep}px`, '--card-y': `${Math.abs(offset) * 14}px`, '--card-scale': offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.82 : 0.64, '--card-rotate': `${offset * -10}deg`, '--card-roll': `${offset * -1.2}deg`, '--card-z': 20 - Math.abs(offset), '--card-opacity': 1 - Math.abs(offset) * 0.24, '--card-brightness': 1 - Math.abs(offset) * 0.13 }} onClick={event => { if (dragged.current) { dragged.current = false; event.preventDefault(); return } if (offset === 0) setLightbox(true); else setIndex((index + offset + photos.length) % photos.length) }} aria-label={offset === 0 ? `放大照片：${photo.caption || ''}` : `切换到照片：${photo.caption || ''}`}>
          <img src={photo.image_data} alt={photo.caption || '个人照片'} draggable="false" />
          <span className="gallery-card-index">{String(photoIndex + 1).padStart(2, '0')} <i>/</i> {String(photos.length).padStart(2, '0')}</span>
          <span className="gallery-card-shade" />
          <span className="gallery-card-caption"><small>{new Date(photo.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</small><strong>{photo.caption || '未命名瞬间'}</strong></span>
        </button>)}</div>
        <button className="gallery-arrow gallery-next" onClick={() => move(1)} aria-label="下一张">›</button>
      </div>
      <div className="gallery-footer"><div className="gallery-dots">{photos.map((photo, dotIndex) => <button key={photo.id} onClick={() => setIndex(dotIndex)} className={dotIndex === index ? 'active' : ''} aria-label={`第 ${dotIndex + 1} 张照片`} />)}</div><span>{String(index + 1).padStart(2, '0')} <i /> {String(photos.length).padStart(2, '0')}</span><small>拖动切换 · 点击中央照片放大</small></div>
    </> : <div className="gallery-empty"><span>✧</span><strong>这里还没有照片</strong><p>添加几张喜欢的照片，开始收集你的日常。</p><label className="gallery-upload">＋ 添加第一张照片<input type="file" accept="image/*" onChange={upload} disabled={uploading} /></label></div>}

    {lightbox && photos[index] && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="照片预览" onMouseDown={event => { if (event.target === event.currentTarget) setLightbox(false) }}>
      <button className="lightbox-close" onClick={() => setLightbox(false)} aria-label="关闭照片">×</button>
      <button className="lightbox-arrow lightbox-left" onClick={() => move(-1)} aria-label="上一张">‹</button><figure><img src={photos[index].image_data} alt={photos[index].caption || '个人照片'} /><figcaption>{photos[index].caption}</figcaption></figure><button className="lightbox-arrow lightbox-right" onClick={() => move(1)} aria-label="下一张">›</button>
    </div>}
  </section>
}
