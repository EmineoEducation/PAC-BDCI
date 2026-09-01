// ==============================================================
//  CORRECTIF URGENT - PAC BDCI - SESSION DU 01/09
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : api/synthese2.js   (ecrase le fichier existant)
//  CORRECTIF   : import casse (buildSynthese2Prompt) + degradation gracieuse
//  DATE        : 01/09/2026
// ==============================================================

import { getSession } from '../lib/redis.js'
import { askClaude, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildSynthese2Prompt } from '../lib/prompts.js'
import { isPacUnlocked } from '../src/lib/progression.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/synthese2
// { sessionId, pacId, situationId, synthese1Text, matchedTendencyId, reaction1Text }
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
//
// ── Correctif du 01/09 · la panne bloquante de la session ───────────────────
// Ce fichier importait `buildSynthese2Prompt` depuis lib/prompts.js, où la
// fonction n'existait pas : seul son bloc de commentaire avait survécu à une
// édition antérieure. Conséquence, un SyntaxError au CHARGEMENT du module —
// donc avant l'exécution de la moindre ligne du handler. Aucun try/catch ne
// pouvait l'attraper, et chaque étudiant·e arrivant à la Synthèse 2 recevait un
// 500 immédiat, quel que soit son texte. Journal du 01/09 : 30 invocations,
// 30 échecs, 0 succès.
//
// La fonction est désormais écrite dans lib/prompts.js. Deux garde-fous en plus :
//   - budget de génération relevé de 400 à 1200 tokens (400 suffisait pour la
//     prose attendue mais pas pour l'éventuel raisonnement interne du modèle,
//     cause des troncatures constatées sur /api/synthese1 le même matin) ;
//   - repli jouable plutôt qu'un 500 si le modèle reste indisponible.

// Repli de mise en scène : sobre, mais conserve les deux propriétés qui rendent
// la scène jouable — on rebondit sur ce qui vient d'être répondu, et on pose une
// question explicite à laquelle une réponse courte est attendue.
// Volontairement SANS nom de personnage : `pac.character` vaut
// "Tension Léa / Marc" sur PAC3, ce qui donnerait une phrase cassée si on
// l'injectait dans une tournure du type "X relit ta réponse".
// ── Invariant de jouabilité (contre-check du 01/09) ─────────────────────────
// Une génération tronquée n'est pas vide : elle revient comme une phrase coupée
// en plein milieu, sans question. Testée uniquement sur "texte non vide", elle
// passait le filtre et l'étudiant·e recevait une scène impossible à répondre —
// exactement le défaut corrigé le 31/08, réintroduit par la troncature.
// La règle métier est explicite depuis cette date : une scène doit poser UNE
// question à laquelle on peut répondre par écrit. On la vérifie ici.
function sceneJouable(texte) {
  const t = (texte || '').trim()
  return t.length >= 60 && t.includes('?')
}

function repliScene() {
  return `Ta réponse est passée, mais elle laisse un point en suspens que personne ne tranchera à ta place. Le temps continue de courir et une décision est attendue. Qu'est-ce que tu sécurises en premier, et qui doit être prévenu ?`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    // Même butoir que /api/synthese1 : rester sous maxDuration = 60 s.
    const deadlineAt = Date.now() + 48000

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
    let synthese2Text = ''
    try {
      const { system, prompt } = buildSynthese2Prompt({
        situationText: situation.palierA.text,
        synthese1Text,
        tendencyLabel,
        reaction1Text,
        character: pac.character,
      })
      synthese2Text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 2000, deadlineAt })
    } catch (err) {
      console.error(`[synthese2] génération échouée (${pacId}/${situationId}) :`, err?.message || err)
    }

    let degraded = false
    if (!sceneJouable(synthese2Text)) {
      degraded = true
      console.error(
        `[synthese2] scène non jouable (${synthese2Text.trim().length} car., question ${synthese2Text.includes('?') ? 'présente' : 'absente'}) — repli servi (${pacId}/${situationId}).`
      )
      synthese2Text = repliScene()
    }

    return res.status(200).json({ synthese2Text, degraded })
  } catch (err) {
    // N'attrape plus que l'irrécupérable (corps illisible, Redis injoignable).
    console.error('Erreur /api/synthese2 :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération de la synthèse : ${detail}` })
  }
}

// ── B01 · Duree maximale d'execution ───────────────────────────────────────
// Cette fonction genere du texte avec Sonnet 5, avec relance possible sur
// troncature depuis le correctif du 01/09. Sans declaration explicite, on depend
// du defaut de la plateforme, qui peut couper la generation en 504 au milieu.
export const maxDuration = 60
