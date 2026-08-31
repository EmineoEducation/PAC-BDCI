// api/feedback-export.js
// Export formateur des traces pédagogiques et des réponses au questionnaire.
//
// GET /api/feedback-export?type=traces|surveys|all&format=json|csv
// En-tête requis : Authorization: Bearer <FEEDBACK_EXPORT_TOKEN>
//
// Le jeton passe par l'en-tête et non par la query string : une URL se
// retrouve dans les journaux d'accès, l'historique du navigateur et le
// Referer, un en-tête non.
//
// Si FEEDBACK_EXPORT_TOKEN n'est pas définie, la route répond 404 — même
// motif d'interrupteur que /api/dev-seed.js : échec fermé par défaut, et un
// 404 plutôt qu'un 403 pour ne pas révéler que la route existe.
//
// Les données exportées sont pseudonymisées à la source (voir lib/feedback.js) :
// aucun email, aucun nom. La colonne `student` est un HMAC tronqué, stable par
// étudiant, qui permet de recouper ses deux situations et son questionnaire.

import { timingSafeEqual } from 'node:crypto'
import { redis } from '../lib/redis.js'
import { TRACES_KEY, SURVEYS_KEY, safeParse } from '../lib/feedback.js'
import { QUESTIONS } from './survey.js'

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function extractBearer(req) {
  const raw = req.headers?.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m ? m[1].trim() : null
}

async function readHash(key) {
  const all = await redis.hgetall(key)
  if (!all) return []
  return Object.values(all).map(safeParse).filter(Boolean)
}

// Séparateur point-virgule et BOM UTF-8 : c'est ce qu'attend Excel en
// configuration française. Avec une virgule et sans BOM, Excel colle tout
// dans une seule colonne et casse les accents.
function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const head = columns.join(';')
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(';'))
  return '\uFEFF' + [head, ...body].join('\r\n')
}

const TRACE_COLUMNS = [
  'student', 'pacId', 'situationId', 'order', 'choiceLabel', 'matchedTendencyId',
  'offTree', 'awayCount', 'awayMs', 'timestamp',
  'palierBText', 'surpriseText', 'synthese1Text', 'reaction1Text', 'synthese2Text', 'reaction2Text',
  'feedbackIntermediaire', 'feedbackFinal',
]

function flattenSurvey(r) {
  const flat = {
    student: r.student,
    submittedAt: r.submittedAt,
    campus: r.campus,
    completedPacs: r.completedPacs,
    comment: r.comment,
  }
  for (const q of QUESTIONS) flat[q.id] = r.answers?.[q.id] ?? ''
  return flat
}

const SURVEY_COLUMNS = [
  'student', 'submittedAt', 'campus', 'completedPacs',
  ...QUESTIONS.map((q) => q.id),
  'comment',
]

export default async function handler(req, res) {
  const expected = process.env.FEEDBACK_EXPORT_TOKEN
  if (!expected) return res.status(404).json({ error: 'Not found.' })

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  if (!tokenMatches(extractBearer(req), expected)) {
    return res.status(403).json({ error: 'Jeton invalide.' })
  }

  const type = String(req.query?.type || 'all').toLowerCase()
  const format = String(req.query?.format || 'json').toLowerCase()
  const stamp = new Date().toISOString().slice(0, 10)

  try {
    if (format === 'csv') {
      // Un CSV = un seul tableau. `all` n'a pas de sens ici : on impose
      // un choix explicite plutôt que de produire un fichier hybride.
      if (type !== 'traces' && type !== 'surveys') {
        return res.status(400).json({
          error: "En CSV, précisez type=traces ou type=surveys.",
        })
      }
      const rows = type === 'traces'
        ? await readHash(TRACES_KEY)
        : (await readHash(SURVEYS_KEY)).map(flattenSurvey)
      const columns = type === 'traces' ? TRACE_COLUMNS : SURVEY_COLUMNS

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="pac-bdci-${type}-${stamp}.csv"`)
      return res.status(200).send(toCsv(rows, columns))
    }

    const out = { exportedAt: new Date().toISOString() }
    if (type === 'traces' || type === 'all') out.traces = await readHash(TRACES_KEY)
    if (type === 'surveys' || type === 'all') out.surveys = await readHash(SURVEYS_KEY)
    out.counts = {
      traces: out.traces?.length ?? null,
      surveys: out.surveys?.length ?? null,
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return res.status(200).json(out)
  } catch (err) {
    console.error('Erreur /api/feedback-export :', err)
    return res.status(500).json({ error: 'Erreur serveur', message: err.message })
  }
}
