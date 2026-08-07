// api/survey.js
// Collecte du questionnaire de fin de PAC BDCI.
//
// POST /api/survey
// { sessionId, campus?, answers: { clarte: 1..5, ... }, comment? }
//
// Écrit dans la clé persistante {PAC_BLOC_KEY}:surveys, pseudonymisée par
// HMAC de sessionId (voir lib/feedback.js). Une resoumission par le même
// étudiant remplace sa réponse au lieu d'en créer une seconde.
//
// La session doit exister : c'est le garde-fou anti-spam. Le questionnaire
// est soumis en fin de parcours, la session est donc encore vivante (TTL 7j).
// Passé ce délai la réponse est refusée, ce qui est le comportement voulu.

import { getSession } from '../lib/redis.js'
import { persistSurvey } from '../lib/feedback.js'

// Barème unique 1..5 pour toutes les questions fermées, afin que l'export
// CSV reste directement moyennable. Pour ajouter, retirer ou reformuler une
// question, c'est ici et nulle part ailleurs : l'endpoint et l'export
// s'alignent automatiquement sur cette liste.
export const QUESTIONS = [
  { id: 'clarte', label: "Les consignes étaient claires" },
  { id: 'realisme', label: "Les situations m'ont paru réalistes" },
  { id: 'utilite', label: "Le feedback reçu m'a été utile" },
  { id: 'difficulte', label: "Le niveau de difficulté était adapté" },
  { id: 'duree', label: "La durée du dispositif était adaptée" },
  { id: 'recommandation', label: "Je recommanderais ce dispositif" },
]

const VALID_IDS = new Set(QUESTIONS.map((q) => q.id))
const COMMENT_MAX = 4000

function clampLikert(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.min(5, Math.round(n)))
}

function normalizeCampus(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ')
    .slice(0, 60)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, campus, answers, comment } = body || {}

    if (!sessionId) return res.status(400).json({ error: 'sessionId requis.' })

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

    // On ne retient que les identifiants connus : un client bricolé ne peut
    // pas injecter de colonnes arbitraires dans l'export.
    const cleanAnswers = {}
    for (const q of QUESTIONS) {
      if (answers && answers[q.id] != null) {
        const v = clampLikert(answers[q.id])
        if (v !== null) cleanAnswers[q.id] = v
      }
    }

    if (!Object.keys(cleanAnswers).length && !comment) {
      return res.status(400).json({ error: 'Aucune réponse exploitable.' })
    }

    const ok = await persistSurvey(sessionId, {
      campus: normalizeCampus(campus) || null,
      answers: cleanAnswers,
      comment: comment ? String(comment).slice(0, COMMENT_MAX) : null,
      // Repère de complétion : permet de distinguer, à l'analyse, un avis
      // donné en fin de parcours d'un avis donné après un seul PAC.
      completedPacs: Array.isArray(session.progression?.completedPacs)
        ? session.progression.completedPacs.length
        : null,
    })

    if (!ok) {
      return res.status(503).json({ error: 'Enregistrement indisponible.', saved: false })
    }

    return res.status(200).json({ saved: true })
  } catch (err) {
    console.error('Erreur /api/survey :', err)
    return res.status(500).json({ error: 'Erreur serveur', message: err.message, saved: false })
  }
}

// Exposé pour permettre au front de construire le formulaire sans dupliquer
// la liste : GET /api/survey-questions n'existe pas, mais QUESTIONS peut être
// importée côté build si le front est bundlé dans le même dépôt.
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }
