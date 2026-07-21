import { getSession, saveSession } from './lib/redis.js'
import { askClaude, askClaudeJSON, MODEL_DEFAULT } from './lib/anthropic.js'
import {
  buildClassificationPrompt,
  buildFeedbackIntermediairePrompt,
  buildFeedbackFinalPrompt,
} from './lib/prompts.js'
import { isPacUnlocked, tagMetaPosture } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/respond
// { sessionId, pacId, situationId, choiceLabel, studentText }
// Traite une production écrite de palier B : classification vers une branche,
// surprise de palier C, puis feedback intermédiaire (situation 1) ou feedback
// final + tag de posture-méta + déblocage du PAC suivant (situation 2).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, pacId, situationId, choiceLabel, studentText } = body || {}

    if (!sessionId || !pacId || !situationId || !studentText) {
      return res.status(400).json({ error: 'sessionId, pacId, situationId et studentText sont requis.' })
    }

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

    if (!isPacUnlocked(pacId, session.progression.completedPacs)) {
      return res.status(403).json({ error: 'Ce PAC n\'est pas encore débloqué pour cette session.' })
    }

    const pac = pacContent.pacs.find((p) => p.id === pacId)
    if (!pac) return res.status(404).json({ error: `PAC ${pacId} introuvable dans le contenu.` })
    const situation = pac.situations.find((s) => s.id === situationId)
    if (!situation) return res.status(404).json({ error: `Situation ${situationId} introuvable.` })

    // 1. Classification vers la branche la plus proche + surprise de palier C.
    const { system: classifySystem, prompt: classifyPrompt } = buildClassificationPrompt({
      situationText: situation.palierA.text,
      choiceLabel,
      tendencies: situation.palierB.tendencies,
      studentText,
    })
    const classification = await askClaudeJSON({ system: classifySystem, prompt: classifyPrompt, model: MODEL_DEFAULT, maxTokens: 1000 })

    const entry = {
      pacId,
      situationId,
      order: situation.order,
      choiceLabel: choiceLabel || null,
      studentText,
      matchedTendencyId: classification.matchedTendencyId,
      offTree: !!classification.offTree,
      surpriseText: classification.surpriseText,
      timestamp: new Date().toISOString(),
    }

    const result = { entry }

    // 2. Situation 1 → feedback intermédiaire. Situation 2 → feedback final + clôture du PAC.
    if (situation.order === 1) {
      const { system, prompt } = buildFeedbackIntermediairePrompt({
        situationText: situation.palierA.text,
        palierCText: situation.palierC.text,
        studentText,
        surpriseText: classification.surpriseText,
      })
      entry.feedbackIntermediaire = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 400 })
    } else {
      const allTextsThisPac = session.entries
        .filter((e) => e.pacId === pacId)
        .map((e) => e.studentText)
        .concat(studentText)

      const { system, prompt } = buildFeedbackFinalPrompt({
        posture: pac.posture,
        anchor: pac.feedbackFinal.anchor,
        notes: pac.feedbackFinal.notes,
        barnumSummary: session.barnumProfile?.text,
        allStudentTexts: allTextsThisPac,
      })
      entry.feedbackFinal = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 500 })

      // Tag de posture-méta pour Stabilité/Adaptabilité, basé sur la tendance de situation 2.
      const tag = tagMetaPosture(pacId, classification.matchedTendencyId, pacContent.metaPostureMapping)
      if (tag) session.progression.metaPostureTags[pacId] = tag

      if (!session.progression.completedPacs.includes(pacId)) {
        session.progression.completedPacs.push(pacId)
      }
      result.pacCompleted = true
    }

    session.entries.push(entry)
    await saveSession(sessionId, session)

    return res.status(200).json(result)
  } catch (err) {
    console.error('Erreur /api/respond :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message ||
      err?.error?.message ||
      err?.message ||
      JSON.stringify(err?.error || err) ||
      'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors du traitement de la réponse : ${detail}` })
  }
}
