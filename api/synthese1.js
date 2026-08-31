// ==============================================================
//  LIVRAISON B03 - PAC BDCI - SYNTHESE 1 JOUEE
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : api/synthese1.js   (nouveau fichier)
//  DATE        : 31/08/2026
// ==============================================================

import { getSession } from '../lib/redis.js'
import { askClaude, askClaudeJSON, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildClassificationPrompt, buildSynthese1Prompt } from '../lib/prompts.js'
import { isPacUnlocked } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/synthese1
// { sessionId, pacId, situationId, choiceLabel, palierBText }
//
// Correctif du 31/08 (retour RP « je n'ai pas la capacité de proposer une réponse
// à cette synthèse »). Avant ce correctif, la Synthèse 1 était `palierC.text`
// affiché tel quel : le même texte pour toute la cohorte, une didascalie annonçant
// une question sans jamais la poser. L'arborescence de branches était classée trop
// tard (dans /api/synthese2) et sa surprise n'était jamais montrée.
//
// Ce endpoint reprend la classification qui vivait dans /api/synthese2 — elle est
// simplement remontée d'un cran, là où elle a toujours dû être : juste après le
// palier B. Le nombre d'appels modèle par situation reste stable côté Synthèse 2,
// qui reçoit désormais la tendance déjà classée au lieu de la recalculer.
//
// N'écrit RIEN en session — la persistance a lieu une seule fois, dans /api/respond,
// à la soumission de la réaction 2. Rejouable sans effet de bord (retour arrière,
// rechargement de page).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, pacId, situationId, choiceLabel, palierBText } = body || {}

    if (!sessionId || !pacId || !situationId || !palierBText) {
      return res.status(400).json({
        error: 'sessionId, pacId, situationId et palierBText sont requis.',
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

    // 1. Classification de la production du palier B vers la branche la plus proche.
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

    const matchedTendency = situation.palierB.tendencies.find(
      (t) => t.id === classification.matchedTendencyId
    )
    const tendencyLabel = matchedTendency
      ? matchedTendency.label
      : 'une approche inédite, hors des tendances prévues'

    // 2. Mise en scène de la Synthèse 1 : la branche donne la direction narrative,
    //    le texte réel de l'étudiant·e donne le point précis sur lequel le
    //    personnage revient. C'est ce second ingrédient qui manquait et qui rendait
    //    la scène impossible à jouer.
    const { system, prompt } = buildSynthese1Prompt({
      situationText: situation.palierA.text,
      choiceLabel,
      palierCText: situation.palierC.text,
      tendencyLabel,
      surpriseText: classification.surpriseText,
      palierBText,
      character: pac.character,
    })
    const synthese1Text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 500 })

    return res.status(200).json({
      synthese1Text,
      matchedTendencyId: classification.matchedTendencyId,
      surpriseText: classification.surpriseText,
    })
  } catch (err) {
    console.error('Erreur /api/synthese1 :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération de la synthèse : ${detail}` })
  }
}

// Même raison que sur /api/synthese2 : deux générations Sonnet 5 enchaînées
// (classification 1000 tokens + scène 500 tokens) dépassent couramment le défaut
// de plateforme et se feraient couper en 504 en pleine génération.
export const maxDuration = 60
