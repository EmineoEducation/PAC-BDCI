import { getSession, saveSession } from './lib/redis.js'
import { askClaude, MODEL_DEFAULT } from './lib/anthropic.js'
import { buildBarnumPortraitPrompt } from './lib/prompts.js'
import { BARNUM_QUESTIONS } from '../src/data/barnumQuestions.js'

// POST /api/barnum  { sessionId, answers }
// Déclenché une seule fois, à la toute première session de l'étudiant·e.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, answers } = body || {}

    if (!sessionId || !answers) {
      return res.status(400).json({ error: 'sessionId et answers sont requis.' })
    }

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

    if (session.barnumProfile) {
      // Déjà généré — on ne relance jamais un deuxième questionnaire pour le même étudiant.
      return res.status(200).json({ portrait: session.barnumProfile })
    }

    const { system, prompt } = buildBarnumPortraitPrompt({ answers, questions: BARNUM_QUESTIONS })
    const portraitText = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 1500, temperature: 0.7 })

    session.barnumProfile = {
      text: portraitText,
      generatedAt: new Date().toISOString(),
    }
    await saveSession(sessionId, session)

    return res.status(200).json({ portrait: session.barnumProfile })
  } catch (err) {
    // Log en profondeur complète — évite les "{…}" tronqués dans les logs Vercel.
    console.error('Erreur /api/barnum :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message ||
      err?.error?.message ||
      err?.message ||
      JSON.stringify(err?.error || err) ||
      'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération du portrait : ${detail}` })
  }
}
