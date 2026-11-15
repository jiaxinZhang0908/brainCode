const POSITIONS_KEY = 'brain-map-positions'
const VIEWPORT_KEY = 'brain-map-viewport'

const NODE_GAP = 230
const MIN_NODE_DISTANCE = 175

/** 读取用户手动拖动后保存的节点位置。 */
export function loadSavedPositions() {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}')))
  } catch {
    return new Map()
  }
}

/** 只持久化用户真正拖动过的节点，避免自动布局污染缓存。 */
export function savePositions(positions) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(Object.fromEntries(positions)))
}

export function loadSavedViewport() {
  try {
    return JSON.parse(localStorage.getItem(VIEWPORT_KEY) || 'null')
  } catch {
    return null
  }
}

export function saveViewport(viewport) {
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport))
}

/**
 * 计算节点坐标。
 * 已缓存的节点沿用用户拖动后的位置；未缓存的节点按关联关系就近布局。
 * 计算结果只写入本地 Map，不回写 positionCache。
 */
export function arrangeNodes(items, edges, selectedId, positionCache) {
  const computed = new Map()
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id))
  ordered.forEach((item, index) => {
    if (positionCache.has(item.id)) {
      computed.set(item.id, positionCache.get(item.id))
      return
    }
    const linked = (edges || [])
      .flatMap(edge => edge.source === item.id ? [edge.target] : edge.target === item.id ? [edge.source] : [])
      .map(id => computed.get(id) || positionCache.get(id))
      .filter(Boolean)
    if (linked.length) {
      const center = linked.reduce(
        (point, value) => ({ x: point.x + value.x / linked.length, y: point.y + value.y / linked.length }),
        { x: 0, y: 0 }
      )
      const directions = [
        { x: 0, y: -NODE_GAP }, { x: NODE_GAP, y: 0 },
        { x: 0, y: NODE_GAP }, { x: -NODE_GAP, y: 0 },
      ]
      const occupied = [...computed.values(), ...positionCache.values()]
      const free = directions.find(direction => !occupied.some(point =>
        Math.hypot(point.x - center.x - direction.x, point.y - center.y - direction.y) < MIN_NODE_DISTANCE))
      const direction = free || { x: 0, y: -(NODE_GAP + 80) }
      computed.set(item.id, { x: center.x + direction.x, y: center.y + direction.y })
      return
    }
    if (!computed.size && index === 0) {
      computed.set(item.id, { x: 0, y: 0 })
      return
    }
    const seed = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const angle = seed * 2.399
    const radius = 320 + (seed % 3) * 100
    computed.set(item.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  })

  return items.map(item => ({
    id: item.id,
    data: { label: item.label },
    position: computed.get(item.id),
    style: nodeStyle(item.id === selectedId),
  }))
}

function nodeStyle(active) {
  return {
    border: `1px solid ${active ? '#9ad3bb' : '#41545a'}`,
    background: active ? '#17372f' : '#172329',
    borderRadius: 16,
    padding: '14px 18px',
    minWidth: 130,
    color: active ? '#e2fff0' : '#d6e0e2',
    fontWeight: 550,
    boxShadow: active ? '0 0 28px #58b58a33' : '0 8px 24px #0005',
  }
}
