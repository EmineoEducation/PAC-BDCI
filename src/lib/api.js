const SESSION_STORAGE_KEY = 'pacbdci_session_id'

export function getStoredSessionId() {
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

export function storeSessionId(id) {
  localStorage.setItem(SESSION_STORAGE_KEY, id)
}

export function clearStoredSessionId() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

async function request(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

export async function createSession({ nom, prenom, formation, campus }) {
  const data = await request('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, prenom, formation, campus }),
  })
  storeSessionId(data.session.id)
  return data.session
}

export async function fetchSession(id) {
  const data = await request(`/api/session?id=${encodeURIComponent(id)}`, { method: 'GET' })
  return data.session
}

export async function submitBarnum({ sessionId, answers }) {
  const data = await request('/api/barnum', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, answers }),
  })
  return data.portrait
}

export async function submitResponse({ sessionId, pacId, situationId, choiceLabel, studentText }) {
  return request('/api/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, pacId, situationId, choiceLabel, studentText }),
  })
}
