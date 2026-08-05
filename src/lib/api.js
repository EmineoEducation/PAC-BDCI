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
  sessionId, pacId, situationId, choiceLabel, focusLoss,
  palierBText, matchedTendencyId, surpriseText,
  reaction1Text, synthese2Text, reaction2Text,
}) {
  return request('/api/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId, pacId, situationId, choiceLabel, focusLoss,
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

// ── Bilan de journée ────────────────────────────────────────────────────────
// Le PDF part à journée complète (jour 1 = pac1+pac2, jour 2 = pac3+pac4).
// La règle vit côté serveur dans bilanScope() — le client ne la duplique pas,
// il interroge et reçoit `null` tant qu'aucune journée n'est terminée.

export async function fetchBilan(sessionId) {
  try {
    return await request('/api/bilan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } catch (err) {
    // 409 = aucune journée complète : ce n'est pas une erreur, c'est l'état
    // normal pendant la majeure partie du parcours.
    if (/journée complète/i.test(err.message)) return null
    throw err
  }
}

export async function confirmBilanSent({ sessionId, scopeKey }) {
  return request('/api/bilan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, confirmSent: scopeKey }),
  })
}

export async function sendBilan({ email, studentName, campus, scopeLabel, bilanHTML, attachments, pdfAttempted }) {
  return request('/api/send-bilan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, studentName, campus, scopeLabel, bilanHTML, attachments, pdfAttempted }),
  })
}
