import { useEffect, useRef } from 'react'

function createRainDrop(width, height, initial = false, gentle = false) {
  const length = 38 + Math.random() * 68
  return {
    x: Math.random() * width,
    y: initial ? Math.random() * height : -length - Math.random() * height * 0.2,
    length,
    speed: (gentle ? 55 : 105) + Math.random() * (gentle ? 65 : 115),
    slant: 0.18 + Math.random() * 0.2,
    alpha: 0.16 + Math.random() * 0.16,
    width: 0.85 + Math.random() * 0.65,
  }
}

function startRainGlass(canvas, host) {
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return undefined

  let width = 1
  let height = 1
  let dpr = 1
  let lastFrame = 0
  let frame = 0
  let stopped = false
  let lastPointerAt = -Infinity
  let pointerX = 0
  let pointerY = 0
  let softX = 0
  let softY = 0
  let drops = []
  const clicks = []
  const gentle = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function resize() {
    const rect = host.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    dpr = Math.min(window.devicePixelRatio || 1, 1.3)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drops = Array.from({ length: gentle ? 68 : 168 }, () => createRainDrop(width, height, true, gentle))
    requestDraw()
  }

  function requestDraw() {
    if (!frame && !stopped) frame = requestAnimationFrame(draw)
  }

  function drawClickRipple(ripple, now) {
    const progress = Math.min(1, (now - ripple.time) / ripple.duration)
    if (progress >= 1) return false
    for (let ring = 0; ring < 5; ring += 1) {
      const delay = ring * 0.095
      if (progress < delay) continue
      const phase = Math.min(1, (progress - delay) / (1 - delay))
      const radius = 3 + (ripple.radius + ring * 5) * (1 - (1 - phase) ** 2)
      const alpha = (1 - phase) ** 1.35 * 0.42
      ctx.beginPath()
      ctx.ellipse(ripple.x, ripple.y, radius, radius * (0.8 + ring * 0.025), -0.12, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(0.65, 1.15 - phase * 0.35)
      ctx.strokeStyle = `rgba(239,251,250,${alpha})`
      ctx.shadowColor = `rgba(191,235,235,${alpha * 0.65})`
      ctx.shadowBlur = 7
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    return true
  }

  function draw(now) {
    frame = 0
    if (stopped) return
    if (now - lastFrame < 28) { frame = requestAnimationFrame(draw); return }
    const dt = Math.min(0.045, lastFrame ? (now - lastFrame) / 1000 : 0.03)
    lastFrame = now
    ctx.clearRect(0, 0, width, height)

    for (const drop of drops) {
      drop.x += drop.speed * drop.slant * dt
      drop.y += drop.speed * dt
      if (drop.y - drop.length > height) Object.assign(drop, createRainDrop(width, height, false, gentle))
      const tailX = drop.x - drop.length * drop.slant
      const tailY = drop.y - drop.length
      const rainLine = ctx.createLinearGradient(tailX, tailY, drop.x, drop.y)
      rainLine.addColorStop(0, 'rgba(223,245,247,0)')
      rainLine.addColorStop(0.78, `rgba(222,244,246,${drop.alpha * 0.45})`)
      rainLine.addColorStop(1, `rgba(244,252,251,${drop.alpha})`)
      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(drop.x, drop.y)
      ctx.lineWidth = drop.width
      ctx.strokeStyle = rainLine
      ctx.stroke()
    }

    const idle = Math.max(0, now - lastPointerAt - 180)
    const pointerStrength = Math.exp(-idle / 520)
    softX += (pointerX - softX) * 0.18
    softY += (pointerY - softY) * 0.18

    if (pointerStrength > 0.015) {
      const glow = ctx.createRadialGradient(softX, softY, 0, softX, softY, 58)
      glow.addColorStop(0, `rgba(247,255,254,${pointerStrength * 0.11})`)
      glow.addColorStop(0.4, `rgba(201,239,240,${pointerStrength * 0.05})`)
      glow.addColorStop(1, 'rgba(210,245,244,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(softX, softY, 58, 0, Math.PI * 2)
      ctx.fill()
    }

    for (let i = clicks.length - 1; i >= 0; i -= 1) {
      if (!drawClickRipple(clicks[i], now)) clicks.splice(i, 1)
    }
    frame = requestAnimationFrame(draw)
  }

  function onPointerMove(event) {
    const rect = host.getBoundingClientRect()
    pointerX = event.clientX - rect.left
    pointerY = event.clientY - rect.top
    lastPointerAt = performance.now()
    requestDraw()
  }

  function onPointerDown(event) {
    if (event.button !== 0) return
    const rect = host.getBoundingClientRect()
    clicks.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, radius: 68, duration: 2700, time: performance.now() })
    if (clicks.length > 4) clicks.shift()
    pointerX = event.clientX - rect.left
    pointerY = event.clientY - rect.top
    lastPointerAt = performance.now()
    requestDraw()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  host.addEventListener('pointermove', onPointerMove, { passive: true })
  host.addEventListener('pointerdown', onPointerDown, { passive: true })
  resize()

  return () => {
    stopped = true
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    host.removeEventListener('pointermove', onPointerMove)
    host.removeEventListener('pointerdown', onPointerDown)
    ctx.clearRect(0, 0, width, height)
  }
}

export default function RainGlass({ hostRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef?.current
    if (!canvas || !host) return undefined
    try { return startRainGlass(canvas, host) }
    catch { return undefined }
  }, [hostRef])

  return <canvas ref={canvasRef} className="rain-glass-canvas" aria-hidden="true" />
}
