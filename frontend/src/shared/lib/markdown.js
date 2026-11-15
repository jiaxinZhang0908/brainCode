const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * 把助手返回的轻量 Markdown 转成受控 HTML。
 * 先整体转义，再只还原少量安全标签，避免直接把模型输出注入 DOM。
 */
export function formatAssistantMessage(value) {
  const escaped = String(value || '').replace(/[&<>"']/g, char => ESCAPE_MAP[char])
  const lines = escaped.replace(/^\s{0,3}#{1,6}\s*/gm, '').split('\n')
  return lines.map(line => {
    const item = line.match(/^\s*[-*•]\s+(.+)$/)
    const content = (item ? item[1] : line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
    if (item) return `<div class="assistant-bullet"><i></i><span>${content}</span></div>`
    return content ? `<p>${content}</p>` : '<div class="assistant-paragraph-gap"></div>'
  }).join('')
}
