// ==============================================================
//  CORRECTIF URGENT - PAC BDCI - SESSION DU 01/09
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : api/synthese1.js   (ecrase le fichier existant)
//  CORRECTIF   : plus aucun 500 renvoye a l'etudiant.e
//  DATE        : 01/09/2026
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
// N'écrit RIEN en session — la persistance a lieu une seule fois, dans /api/respond,
// à la soumission de la réaction 2. Rejouable sans effet de bord (retour arrière,
// rechargement de page).
//
// ── Correctif du 01/09 · dégradation gracieuse ──────────────────────────────
// En session réelle, la classification a renvoyé du JSON tronqué sur la moitié
// des appels, ce qui remontait en 500 et bloquait net l'étudiant·e au milieu de
// sa situation. La robustesse de l'appel modèle est traitée dans lib/anthropic.js ;
// ici on pose le dernier filet : ce endpoint ne renvoie plus JAMAIS 500 à cause
// du modèle. Si la classification échoue malgré les relances, on retombe sur une
// branche pré-écrite ; si la mise en scène échoue à son tour, on joue une scène
// de repli construite sur la surprise pré-écrite. Une scène dégradée reste
// jouable — un cul-de-sac, non.
//
// Un 500 reste possible pour ce qui n'est PAS récupérable ici (corps de requête
// illisible, Redis injoignable) : dans ces cas il n'y a rien à dégrader.

// Repli de classification : on retient la première branche prévue pour la
// situation. Choix délibérément déterministe plutôt qu'aléatoire — en cas
// d'incident on veut pouvoir rejouer exactement ce que l'étudiant·e a vu.
// `classificationDegraded` est remonté au client et journalisé : cette
// observation ne doit pas peser comme une classification réelle dans la lecture
// RP a posteriori.
function repliClassification(situation) {
  const premiere = situation?.palierB?.tendencies?.[0]
  return {
    matchedTendencyId: premiere?.id ?? 'hors_arbre',
    surpriseText: premiere?.surprise ?? '',
    offTree: !premiere,
  }
}

// Repli de mise en scène : uniquement si le modèle est totalement indisponible.
// Volontairement sobre, mais respecte les deux règles qui rendent la scène
// jouable — un fait concret, puis une question explicite à laquelle répondre.
function repliScene({ character, surpriseText }) {
  const fait = surpriseText?.trim()
    ? surpriseText.trim()
    : "la situation vient de bouger et ce qui avait été prévu ne tient plus tel quel"
  return `${character} revient vers toi : ${fait} Je n'ai pas le détail de ce que tu as prévu de ton côté. Sur quoi tu t'appuies pour trancher maintenant, et qu'est-ce que tu fais en premier ?`
}

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
    let classification
    let classificationDegraded = false
    try {
      const { system: classifySystem, prompt: classifyPrompt } = buildClassificationPrompt({
        situationText: situation.palierA.text,
        choiceLabel,
        tendencies: situation.palierB.tendencies,
        studentText: palierBText,
      })
      classification = await askClaudeJSON({
        system: classifySystem,
        prompt: classifyPrompt,
        model: MODEL_DEFAULT,
        maxTokens: 4000,
      })
      if (!classification || typeof classification !== 'object' || !classification.matchedTendencyId) {
        throw new Error('Classification incomplète (matchedTendencyId absent).')
      }
    } catch (err) {
      classificationDegraded = true
      classification = repliClassification(situation)
      console.error(
        `[synthese1] classification en repli (${pacId}/${situationId}) — branche retenue : ${classification.matchedTendencyId}. Cause :`,
        err?.message || err
      )
    }

    const matchedTendency = situation.palierB.tendencies.find(
      (t) => t.id === classification.matchedTendencyId
    )
    const tendencyLabel = matchedTendency
      ? matchedTendency.label
      : 'une approche inédite, hors des tendances prévues'

    // Quand le modèle sort de l'arbre, il improvise `surpriseText`. Si cette
    // improvisation a été perdue dans la troncature, on récupère au moins la
    // surprise pré-écrite de la branche pour que la scène ait de la matière.
    const surpriseText =
      classification.surpriseText?.trim() || matchedTendency?.surprise || ''

    // 2. Mise en scène de la Synthèse 1 : la branche donne la direction narrative,
    //    le texte réel de l'étudiant·e donne le point précis sur lequel le
    //    personnage revient. C'est ce second ingrédient qui manquait et qui rendait
    //    la scène impossible à jouer.
    let synthese1Text = ''
    let sceneDegraded = false
    try {
      const { system, prompt } = buildSynthese1Prompt({
        situationText: situation.palierA.text,
        choiceLabel,
        palierCText: situation.palierC.text,
        tendencyLabel,
        surpriseText,
        palierBText,
        character: pac.character,
      })
      synthese1Text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 1500 })
    } catch (err) {
      console.error(`[synthese1] génération de scène échouée (${pacId}/${situationId}) :`, err?.message || err)
    }

    if (!synthese1Text.trim()) {
      sceneDegraded = true
      synthese1Text = repliScene({ character: pac.character, surpriseText })
      console.error(`[synthese1] scène en repli servie (${pacId}/${situationId}).`)
    }

    return res.status(200).json({
      synthese1Text,
      matchedTendencyId: classification.matchedTendencyId,
      surpriseText,
      degraded: classificationDegraded || sceneDegraded,
    })
  } catch (err) {
    // N'attrape plus que l'irrécupérable (corps illisible, Redis injoignable).
    console.error('Erreur /api/synthese1 :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération de la synthèse : ${detail}` })
  }
}

// Deux générations Sonnet 5 enchaînées (classification + scène), chacune
// susceptible d'être relancée une fois sur troncature depuis le correctif du
// 01/09 : le plafond de 60 s reste nécessaire.
export const maxDuration = 60
