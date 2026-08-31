// lib/feedback.js
// Trace analytique persistante du PAC BDCI, tenue à l'écart de la session.
//
// POURQUOI UNE CLÉ DISTINCTE DE LA SESSION
// lib/redis.js applique un TTL de 7 jours aux sessions, et c'est très bien
// ainsi : la session finit par contenir des données nominatives (l'email et le
// nom transitent par /api/send-bilan) et n'a aucune raison de survivre à la
// campagne. La trace analytique a le cycle de vie inverse : les PAC courent de
// fin août à début septembre, l'exploitation vient après, et elle ne doit
// contenir aucune identité. Deux cycles de vie incompatibles = deux clés.
// On écrit donc deux fois, sans jamais toucher au TTL des sessions.
//
// PSEUDONYMISATION
// L'identifiant de session est passé au HMAC-SHA256 avec FEEDBACK_SALT. Le
// résultat est stable — on peut donc recouper les deux situations d'un même
// étudiant, et rattacher sa réponse au questionnaire à ses productions — mais
// irréversible sans le sel. Aucun email, aucun nom n'entre ici. C'est du
// hachage à l'écriture, pas à l'export : les données personnelles ne sont
// jamais au repos dans ces clés.
//
// ATTENTION : changer FEEDBACK_SALT rend les traces déjà écrites
// incomparables avec les nouvelles (même étudiant, hash différent). Ne pas y
// toucher entre le début et la fin d'une campagne.
//
// STRUCTURE REDIS
//   {PAC_BLOC_KEY}:traces    hash — champ `{hash}:{pacId}:{situationId}`
//   {PAC_BLOC_KEY}:surveys   hash — champ `{hash}`
// Un hash Redis plutôt qu'une liste : la ré-écriture d'un même champ écrase
// au lieu d'empiler. C'est la même préoccupation d'idempotence que celle déjà
// traitée dans /api/respond.js (double-clic, ré-POST après timeout).

import { createHmac } from 'node:crypto'
import { redis } from './redis.js'

const PAC_BLOC_KEY = process.env.PAC_BLOC_KEY || 'bdci:bc1'

export const TRACES_KEY = `${PAC_BLOC_KEY}:traces`
export const SURVEYS_KEY = `${PAC_BLOC_KEY}:surveys`

/**
 * Pseudonyme stable et irréversible dérivé de l'identifiant de session.
 * Retourne null si FEEDBACK_SALT n'est pas configurée — l'appelant doit
 * alors renoncer à écrire plutôt que de produire un identifiant en clair.
 */
export function studentHash(sessionId) {
  const salt = process.env.FEEDBACK_SALT
  if (!salt || !sessionId) return null
  return createHmac('sha256', salt).update(String(sessionId)).digest('hex').slice(0, 16)
}

/** Upstash peut renvoyer un objet déjà désérialisé ou une chaîne. */
export function safeParse(value) {
  if (value == null) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Écrit la trace d'une situation terminée. BEST-EFFORT : un échec est
 * journalisé mais ne remonte jamais en exception, sur le modèle de
 * logIncident() dans send-bilan.js. Le parcours étudiant ne doit jamais
 * s'interrompre parce que la couche analytique a hoqueté.
 */
export async function persistTrace(sessionId, entry, meta = {}) {
  const student = studentHash(sessionId)
  if (!student) {
    console.warn('persistTrace: FEEDBACK_SALT absente — trace non écrite')
    return false
  }
  try {
    const field = `${student}:${entry.pacId}:${entry.situationId}`
    const record = {
      student,
      pacId: entry.pacId,
      situationId: entry.situationId,
      order: entry.order ?? null,
      choiceLabel: entry.choiceLabel ?? null,
      matchedTendencyId: entry.matchedTendencyId ?? null,
      offTree: entry.offTree === true,
      awayCount: entry.focusLoss?.awayCount ?? 0,
      awayMs: entry.focusLoss?.awayMs ?? 0,
      palierBText: entry.palierBText ?? null,
      surpriseText: entry.surpriseText ?? null,
      synthese1Text: entry.synthese1Text ?? null,
      reaction1Text: entry.reaction1Text ?? null,
      synthese2Text: entry.synthese2Text ?? null,
      reaction2Text: entry.reaction2Text ?? null,
      feedbackIntermediaire: entry.feedbackIntermediaire ?? null,
      feedbackFinal: entry.feedbackFinal ?? null,
      timestamp: entry.timestamp || new Date().toISOString(),
      ...meta,
    }
    await redis.hset(TRACES_KEY, { [field]: JSON.stringify(record) })
    return true
  } catch (err) {
    console.warn('persistTrace redis error:', err.message)
    return false
  }
}

/**
 * Écrit (ou remplace) la réponse au questionnaire d'un étudiant.
 * Un seul enregistrement par pseudonyme : une resoumission corrige.
 */
export async function persistSurvey(sessionId, payload) {
  const student = studentHash(sessionId)
  if (!student) {
    console.warn('persistSurvey: FEEDBACK_SALT absente — réponse non écrite')
    return false
  }
  try {
    const record = { student, submittedAt: new Date().toISOString(), ...payload }
    await redis.hset(SURVEYS_KEY, { [student]: JSON.stringify(record) })
    return true
  } catch (err) {
    console.warn('persistSurvey redis error:', err.message)
    return false
  }
}
