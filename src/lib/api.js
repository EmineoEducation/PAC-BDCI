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

const MISSION_SEEN_KEY = 'pacbdci_mission_seen'

// Gate d'UX pur (page de facilitation entre le questionnaire Barnum et la
// carte) — n'a rien à voir avec la trace RP, donc pas de champ côté session/
// Redis. Même logique de stockage que SESSION_STORAGE_KEY : une seule session
// active par navigateur, pas besoin de namespacer par sessionId.
export function hasMissionSeen() {
  return localStorage.getItem(MISSION_SEEN_KEY) === '1'
}

export function markMissionSeen() {
  localStorage.setItem(MISSION_SEEN_KEY, '1')
}

async function request(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

export async function createSession({ nom, prenom, email, formation, campus }) {
  const data = await request('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, prenom, email, formation, campus }),
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

export async function fetchSynthese2({ sessionId, pacId, situationId, choiceLabel, palierBText, reaction1Text }) {
  return request('/api/synthese2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, pacId, situationId, choiceLabel, palierBText, reaction1Text }),
  })
}

export async function submitResponse({
  sessionId, pacId, situationId, choiceLabel,
  palierBText, matchedTendencyId, surpriseText,
  reaction1Text, synthese2Text, reaction2Text,
}) {
  return request('/api/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId, pacId, situationId, choiceLabel,
      palierBText, matchedTendencyId, surpriseText,
      reaction1Text, synthese2Text, reaction2Text,
    }),
  })
}

export async function fetchCharlieHistory(sessionId) {
  return request(`/api/charlie?sessionId=${encodeURIComponent(sessionId)}`, { method: 'GET' })
}

export async function sendCharlieMessage({ sessionId, message }) {
  return request('/api/charlie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  })
}
