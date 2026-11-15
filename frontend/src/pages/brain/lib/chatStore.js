const CHAT_STORAGE_KEY = 'brain-knowledge-conversations-v1'
const ACTIVE_CHAT_KEY = 'brain-knowledge-active-conversation-v1'
const MAX_CONVERSATIONS = 30

export function newConversation() {
  return { id: crypto.randomUUID(), title: '新对话', updatedAt: Date.now(), messages: [] }
}

export function conversationDate(value) {
  return new Date(value || Date.now()).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function readConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]')
    return Array.isArray(saved) && saved.length ? saved : [newConversation()]
  } catch {
    return [newConversation()]
  }
}

/** 本地只保留最近若干轮对话，避免 localStorage 无限膨胀。 */
export function persistConversations(conversations) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations.slice(-MAX_CONVERSATIONS)))
}

export function readActiveConversationId() {
  return localStorage.getItem(ACTIVE_CHAT_KEY) || ''
}

export function persistActiveConversationId(id) {
  if (id) localStorage.setItem(ACTIVE_CHAT_KEY, id)
}
