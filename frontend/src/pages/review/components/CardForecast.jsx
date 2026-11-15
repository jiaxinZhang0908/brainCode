import { useEffect, useState } from 'react'
import { getForecast } from '../api/reviewApi.js'

const friendlyDate = (value, dateKey) => {
  const date = new Date(dateKey ? `${dateKey}T12:00:00+08:00` : value), now = new Date(), next = new Date(now)
  const dateText = date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
  const todayText = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' })
  next.setDate(next.getDate() + 1)
  const tomorrowText = next.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' })
  const localText = date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' })
  const day = localText === todayText ? '今天' : localText === tomorrowText ? '明天' : dateText
  return `${day} ${date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })}`
}
const mix = (from, to, amount) => `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * amount)).join(',')})`

export default function CardForecast({ card, onStart, onDelete, confirmDelete, onRequestDelete, onCancelDelete, onSuspend, onResume, busy }) {
  const [forecast, setForecast] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (card.suspended) { setForecast([]); setLoading(false); return }
    let live = true
    setLoading(true); setError('')
    getForecast(card.id, 5).then(data => { if (live) setForecast(data.items || []) }).catch(e => { if (live) setError(e.message) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [card.id, card.suspended])
  const rates = forecast.map(item => item.retention)
  const useInterval = rates.length > 1 && Math.max(...rates) - Math.min(...rates) < .06
  const values = useInterval ? forecast.map(item => item.interval_days) : rates
  const min = Math.min(...values, 0), max = Math.max(...values, 1), span = max - min || 1
  return <div className="card-forecast">
    <div className="forecast-heading"><strong>之后的复习日程</strong><small>按 GOOD 推演，不会改动真实排期</small></div>
    {card.suspended ? <p className="forecast-message">卡片暂停中，恢复后可查看预测日程。</p> : loading ? <p className="forecast-message">正在计算复习日程…</p> : error ? <p className="forecast-message forecast-error">{error}</p> : forecast.length === 0 ? <p className="forecast-message">完成第一次复习后，这里会生成之后的预测日程并同步到左侧时间轴。</p> : <>
      <div className="forecast-timeline">{forecast.map((item, index) => {
        const intensity = (values[index] - min) / span
        const color = useInterval ? mix([89, 244, 223], [255, 85, 216], intensity) : mix([89, 244, 223], [255, 85, 216], 1 - item.retention)
        const percent = Math.round(item.retention * 100)
        const dueValue = item.due_local || item.due_at
        const dueLabel = friendlyDate(dueValue, item.due_date)
        return <div className="forecast-point" key={`${item.due_date || item.due_at}-${index}`} title={`预计复习 ${dueLabel}，保留率约 ${percent}%，稳定性 ${item.stability.toFixed(1)} 天，间隔 ${item.interval_days} 天`}>
          <i style={{ '--forecast-color': color }} /><strong>{dueLabel}</strong><small>保留 {percent}%</small>
        </div>
      })}</div>
      <p className="forecast-legend">圆点越深 = 预计遗忘越多{useInterval ? '（颜色按间隔长度估算）' : ''}</p>
    </>}
    <div className="forecast-actions"><button type="button" onClick={() => onStart(card)} disabled={busy || card.suspended}>开始复习</button>{card.suspended ? <button type="button" onClick={() => onResume(card.id)} disabled={busy}>恢复</button> : <button type="button" onClick={() => onSuspend(card.id)} disabled={busy}>暂停</button>}{confirmDelete ? <><button type="button" className="forecast-delete" onClick={() => onDelete(card.id)} disabled={busy}>确认删除</button><button type="button" onClick={onCancelDelete} disabled={busy}>取消</button></> : <button type="button" className="forecast-delete" onClick={() => onRequestDelete(card.id)} disabled={busy}>删除</button>}</div>
  </div>
}
