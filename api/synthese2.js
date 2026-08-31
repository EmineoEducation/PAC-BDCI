// ==============================================================
//  LIVRAISON B03 - PAC BDCI - SYNTHESE 1 JOUEE
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : api/synthese2.js   (ecrase le fichier existant)
//  CORRECTIF   : classification remontee dans /api/synthese1
//  DATE        : 31/08/2026
// ==============================================================

import { getSession } from '../lib/redis.js'
import { askClaude, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildSynthese2Prompt } from '../lib/prompts.js'
import { isPacUnlocked } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/synthese2
// { sessionId, pacId, situationId, synthese1Text, tendencyLabel, reaction1Text }
//
// Étape intermédiaire du cycle "le monde résiste" (chantier densité temporelle, 21/07) :
// fait improviser par le modèle la suite de la scène à partir de reaction1Text.
//
// Depuis le 31/08, la classification de palierBText ne se fait plus ici mais dans
// /api/synthese1, où elle sert enfin à quelque chose de visible. Ce endpoint reçoit
// la tendance déjà classée et la scène déjà jouée : un seul appel modèle au lieu de
// deux, donc une attente plus courte pour l'étudiant·e à ce point du parcours.
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
    const { sessionId, pacId, situationId, synthese1Text, matchedTendencyId, reaction1Text } = body || {}

    if (!sessionId || !pacId || !situationId || !reaction1Text) {
      return res.status(400).json({
        error: 'sessionId, pacId, situationId et reaction1Text sont requis.',
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

    // La tendance a déjà été classée par /api/synthese1 : on relit simplement son
    // libellé dans le contenu, sans nouvel appel modèle.
    const matchedTendency = situation.palierB.tendencies.find((t) => t.id === matchedTendencyId)
    const tendencyLabel = matchedTendency
      ? matchedTendency.label
      : 'une approche inédite, hors des tendances prévues'

    // Improvisation de la Synthèse 2 — jamais pré-écrite. Elle enchaîne sur la scène
    // réellement jouée en Synthèse 1, pas sur l'indication de mise en scène interne.
    const { system, prompt } = buildSynthese2Prompt({
      situationText: situation.palierA.text,
      synthese1Text,
      tendencyLabel,
      reaction1Text,
      character: pac.character,
    })
    const synthese2Text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 400 })

    return res.status(200).json({ synthese2Text })
  } catch (err) {
    console.error('Erreur /api/synthese2 :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération de la synthèse : ${detail}` })
  }
}

// ── B01 · Duree maximale d'execution ───────────────────────────────────────
// Cette fonction genere du texte avec Sonnet 5 (400 tokens depuis le retrait de
// la classification, soit une generation nettement plus courte qu'avant). Sans declaration explicite, on depend du defaut
// de la plateforme, qui peut couper la generation en 504 au milieu. Meme
// correctif que maxDuration = 60 pose sur les cinq blocs MSMC.
export const maxDuration = 60
