import { getSession, saveSession } from '../lib/redis.js'
import { askClaude, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildFeedbackIntermediairePrompt, buildFeedbackFinalPrompt } from '../lib/prompts.js'
import { isPacUnlocked, tagMetaPosture } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/respond
// { sessionId, pacId, situationId, choiceLabel, palierBText, matchedTendencyId,
//   surpriseText, reaction1Text, synthese2Text, reaction2Text }
//
// Appelé une seule fois par situation, au moment où reaction2 est soumise (fin du cycle
// "le monde résiste" — chantier densité temporelle, 21/07). Persiste l'entrée complète
// (palierB + les deux réactions) et génère le feedback intermédiaire (situation 1) ou
// final + clôture du PAC (situation 2). matchedTendencyId/surpriseText proviennent de
// l'appel préalable à /api/synthese2, pas reclassifiés ici.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const {
      sessionId, pacId, situationId, choiceLabel,
      palierBText, matchedTendencyId, surpriseText,
      reaction1Text, synthese2Text, reaction2Text,
    } = body || {}

    if (!sessionId || !pacId || !situationId || !palierBText || !reaction1Text || !reaction2Text) {
      return res.status(400).json({
        error: 'sessionId, pacId, situationId, palierBText, reaction1Text et reaction2Text sont requis.',
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

    const entry = {
      pacId,
      situationId,
      order: situation.order,
      choiceLabel: choiceLabel || null,
      palierBText,
      matchedTendencyId: matchedTendencyId || null,
      offTree: matchedTendencyId === 'hors_arbre',
      surpriseText: surpriseText || null,
      reaction1Text,
      synthese2Text: synthese2Text || null,
      reaction2Text,
      timestamp: new Date().toISOString(),
    }

    const result = { entry }

    if (situation.order === 1) {
      const { system, prompt } = buildFeedbackIntermediairePrompt({
        palierCText: situation.palierC.text,
        reaction1Text,
        synthese2Text,
        reaction2Text,
        surpriseText,
      })
      entry.feedbackIntermediaire = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 450 })
    } else {
      const s1Entry = session.entries.find((e) => e.pacId === pacId && e.order === 1)
      const s1Texts = s1Entry
        ? `Situation 1 — réaction 1 : ${s1Entry.reaction1Text}\nSituation 1 — rebondissement : ${s1Entry.synthese2Text || '(non disponible)'}\nSituation 1 — réaction 2 : ${s1Entry.reaction2Text}`
        : '(situation 1 non disponible)'
      const s2Texts = `Situation 2 — réaction 1 : ${reaction1Text}\nSituation 2 — rebondissement : ${synthese2Text || '(non disponible)'}\nSituation 2 — réaction 2 : ${reaction2Text}`

      const { system, prompt } = buildFeedbackFinalPrompt({
        posture: pac.posture,
        anchor: pac.feedbackFinal.anchor,
        notes: pac.feedbackFinal.notes,
        barnumSummary: session.barnumProfile?.text,
        allStudentTexts: [s1Texts, s2Texts],
      })
      entry.feedbackFinal = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 550 })

      const tag = tagMetaPosture(pacId, matchedTendencyId, pacContent.metaPostureMapping)
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
