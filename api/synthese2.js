import { getSession } from '../lib/redis.js'
import { askClaude, askClaudeJSON, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildClassificationPrompt, buildSynthese2Prompt } from '../lib/prompts.js'
import { isPacUnlocked } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/synthese2
// { sessionId, pacId, situationId, choiceLabel, palierBText, reaction1Text }
//
// Étape intermédiaire du cycle "le monde résiste" (chantier densité temporelle, 21/07) :
// classe palierBText comme le faisait /api/respond avant ce chantier (même mécanisme),
// puis fait improviser par le modèle la suite de la scène à partir de reaction1Text.
// N'écrit RIEN en session — la persistance complète a lieu une seule fois, dans
// /api/respond, au moment où reaction2 est soumise. Ce endpoint est donc rejouable
// sans effet de bord si l'étudiant·e revient en arrière ou recharge la page.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, pacId, situationId, choiceLabel, palierBText, reaction1Text } = body || {}

    if (!sessionId || !pacId || !situationId || !palierBText || !reaction1Text) {
      return res.status(400).json({
        error: 'sessionId, pacId, situationId, palierBText et reaction1Text sont requis.',
      })
    }

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })
    if (!isPacUnlocked(pacId, session.progression.completedPacs)) {
      return res.status(403).json({ error: "Ce PAC n'est pas encore débloqué pour cette session." })
    }

    const pac = pacContent.pacs.find((p) => p.id === pacId)
    if (!pac) return res.status(404).json({ error: `PAC ${pacId} introuvable dans le contenu.` })
    const situation = pac.situations.find((s) => s.id === situationId)
    if (!situation) return res.status(404).json({ error: `Situation ${situationId} introuvable.` })

    // 1. Classification de palierB — même mécanisme qu'avant ce chantier.
    const { system: classifySystem, prompt: classifyPrompt } = buildClassificationPrompt({
      situationText: situation.palierA.text,
      choiceLabel,
      tendencies: situation.palierB.tendencies,
      studentText: palierBText,
    })
    const classification = await askClaudeJSON({
      system: classifySystem,
      prompt: classifyPrompt,
      model: MODEL_DEFAULT,
      maxTokens: 1000,
    })

    const matchedTendency = situation.palierB.tendencies.find((t) => t.id === classification.matchedTendencyId)
    const tendencyLabel = matchedTendency ? matchedTendency.label : 'une approche inédite, hors des tendances prévues'

    // 2. Improvisation de la Synthèse 2 — jamais pré-écrite.
    const { system, prompt } = buildSynthese2Prompt({
      situationText: situation.palierA.text,
      palierCText: situation.palierC.text,
      tendencyLabel,
      reaction1Text,
      character: pac.character,
    })
    const synthese2Text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 250 })

    return res.status(200).json({
      synthese2Text,
      matchedTendencyId: classification.matchedTendencyId,
      surpriseText: classification.surpriseText,
    })
  } catch (err) {
    console.error('Erreur /api/synthese2 :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération de la synthèse : ${detail}` })
  }
}
