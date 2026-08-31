// ==============================================================
//  LIVRAISON B01 - PAC BDCI - CORRECTIFS AVANT 1re SESSION
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : src/lib/api.js   (ecrase le fichier existant)
//  CORRECTIF   : reprise reseau (3 tentatives, 800ms/1,6s) + timeout client 90 s
//  DATE        : 30/08/2026
// ==============================================================

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

// ── B01 · Reprise reseau ────────────────────────────────────────────────────
// Equivalent de window.PAC_FETCH sur la chaine des 18 PAC (correctif F39).
// Motif : les etudiants travaillent sur leur propre machine en partage de
// connexion mobile. Un seul fetch sans reprise = une coupure de deux secondes
// suffit a perdre une production. Trois etudiantes y ont perdu leur matinee a
// Lille le 27/08 avant que F39 ne soit pose.
//
// On rejoue uniquement ce qui est rejouable sans risque :
//   - echec au niveau transport (fetch qui rejette : coupure, DNS, TLS)
//   - delai d'attente depasse cote client
//   - 408, 429, 500, 502, 503, 504 renvoyes par la plateforme
// Un 4xx metier (400 champ manquant, 403 PAC verrouille, 404 session expiree)
// n'est JAMAIS rejoue : le rejouer donnerait le meme resultat trois fois.
//
// /api/respond est idempotent cote serveur (indexe sur pacId+situationId), un
// double envoi remplace au lieu d'empiler. Les autres appels sont soit des
// lectures, soit sans effet de bord cumulatif.

const RETRY_MAX = 3
const RETRY_DELAIS = [800, 1600] // ms, entre chaque nouvelle tentative
const RETRY_STATUTS = new Set([408, 429, 500, 502, 503, 504])

// Les generations Claude les plus longues (portrait Barnum, bilan) tournent
// autour de 40 s. La fonction serverless est plafonnee a 60 s (maxDuration),
// donc 90 s cote client ne coupe jamais avant le serveur : ce garde-fou ne
// sert qu'a debloquer une socket restee suspendue, cas courant en 4G.
const TIMEOUT_MS = 90000

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchAvecTimeout(url, options) {
  if (typeof AbortController === 'undefined') return fetch(url, options)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function request(url, options) {
  let derniereErreur = null

  for (let tentative = 0; tentative < RETRY_MAX; tentative++) {
    let res
    try {
      res = await fetchAvecTimeout(url, options)
    } catch (err) {
      // Echec transport ou timeout : rejouable.
      derniereErreur = err
      console.warn(`request(${url}) — tentative ${tentative + 1}/${RETRY_MAX} : ${err.message}`)
      if (tentative < RETRY_MAX - 1) { await pause(RETRY_DELAIS[tentative]); continue }
      throw new Error(
        "Connexion interrompue. Ton texte est conserve sur cet appareil : verifie ta connexion et reessaie."
      )
    }

    if (res.ok) return res.json().catch(() => ({}))

    const data = await res.json().catch(() => ({}))
    const message = data.error || `Erreur ${res.status}`

    if (RETRY_STATUTS.has(res.status) && tentative < RETRY_MAX - 1) {
      derniereErreur = new Error(message)
      console.warn(`request(${url}) — HTTP ${res.status}, tentative ${tentative + 1}/${RETRY_MAX}`)
      await pause(RETRY_DELAIS[tentative])
      continue
    }

    throw new Error(message)
  }

  throw derniereErreur || new Error('Erreur reseau inconnue.')
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

// Synthèse 1 — appelée à la soumission du palier B. Classe la production vers une
// branche et fait jouer la scène par le personnage (correctif du 31/08 : la Synthèse 1
// était auparavant un texte fixe, identique pour toute la cohorte).
export async function fetchSynthese1({ sessionId, pacId, situationId, choiceLabel, palierBText }) {
  return request('/api/synthese1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, pacId, situationId, choiceLabel, palierBText }),
  })
}

export async function fetchSynthese2({ sessionId, pacId, situationId, synthese1Text, matchedTendencyId, reaction1Text }) {
  return request('/api/synthese2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, pacId, situationId, synthese1Text, matchedTendencyId, reaction1Text }),
  })
}

export async function submitResponse({
  sessionId, pacId, situationId, choiceLabel, focusLoss,
  palierBText, matchedTendencyId, surpriseText,
  synthese1Text, reaction1Text, synthese2Text, reaction2Text,
}) {
  return request('/api/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId, pacId, situationId, choiceLabel, focusLoss,
      palierBText, matchedTendencyId, surpriseText,
      synthese1Text, reaction1Text, synthese2Text, reaction2Text,
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
