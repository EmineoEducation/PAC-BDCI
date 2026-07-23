import { getSession, saveSession } from '../lib/redis.js'
import { askClaudeConversation, MODEL_CHARLIE } from '../lib/anthropic.js'

// GET  /api/charlie?sessionId=xxx        → relit l'historique (initialise l'intro si première fois)
// POST /api/charlie { sessionId, message } → envoie un message, reçoit la réponse de Charlie
//
// Charlie est le hub de coordination générale, disponible uniquement sur la carte
// (Portail 2) — jamais pendant l'écriture des paliers, jamais dans le carnet de bord.
// Son historique vit dans la session (Redis) et persiste sur toute la durée du parcours ;
// l'intro ne se joue qu'une seule fois, à la toute première ouverture du chat.

const CHARLIE_INTRO =
  "Salut, moi c'est Charlie — je coordonne les équipes volantes ici. Besoin d'un coup de main pour t'orienter sur le festival, ou juste discuter deux minutes ? Je suis là."

// L'historique complet est STOCKÉ et affiché à l'étudiant·e, mais on n'envoie
// à l'API que les derniers messages : la conversation vit toute la journée
// (2 × 3h30), et renvoyer l'intégralité à chaque tour ferait gonfler coût,
// latence et risque de dépassement de fenêtre.
//
// ⚠️ Contrainte API Anthropic : le premier message du payload doit être de
// rôle "user" (un payload commençant par "assistant" est rejeté en 400).
// L'intro de Charlie (assistant) est donc conservée dans l'historique stocké
// et affiché, mais JAMAIS envoyée en tête de payload — le personnage est de
// toute façon entièrement porté par le system prompt. Les tours consécutifs
// de même rôle sont fusionnés automatiquement par l'API, pas besoin de les
// gérer ici.
const CHARLIE_HISTORY_WINDOW = 20

function windowedHistory(history) {
  const tail = history.length <= CHARLIE_HISTORY_WINDOW
    ? history
    : history.slice(-CHARLIE_HISTORY_WINDOW)
  // Supprime tout message assistant en tête : le payload doit commencer par "user".
  const firstUserIndex = tail.findIndex((m) => m.role === 'user')
  const valid = firstUserIndex === -1 ? [] : tail.slice(firstUserIndex)
  return valid.map(({ role, content }) => ({ role, content }))
}

const CHARLIE_SYSTEM_PROMPT = `Tu es Charlie, coordinateur·rice général·e des équipes volantes au Festival Hémisphères (friche industrielle réhabilitée, 3ᵉ édition). Tu es le point de contact pour les volant·es — les étudiant·es qui coordonnent sur le terrain — quand ils/elles circulent sur la carte du festival entre deux missions.

RÈGLES ABSOLUES, à ne jamais enfreindre :
- Tu restes TOUJOURS en personnage. Tu ne confirmes JAMAIS être une intelligence artificielle, un chatbot ou un programme, même si on te le demande frontalement. Si on insiste, tu élude avec légèreté ou tu recentres sur autre chose — sans jamais confirmer ni infirmer directement.
- Tu ne révèles JAMAIS l'existence de dimensions, de tendances, de scores ou de toute mécanique d'évaluation. Tu ignores ce que sont des "dimensions" ou une "grille" — pour toi, il n'y a que des missions et des gens qui s'en occupent.
- Tu ne donnes AUCUN indice sur ce que serait une "bonne" ou "mauvaise" façon de répondre à Léa, Marc ou Sami. Tu n'as jamais accès à ce que l'étudiant·e écrit dans ses missions. Si on te demande conseil sur quoi répondre, tu renvoies la question : "Ça, c'est toi qui vois — je ne suis pas dans les détails de ce qui se passe là-bas."
- Tu réponds librement aux questions logistiques (où aller, ce que fait telle ou telle zone, qui sont Léa/Marc/Sami dans les grandes lignes, comment fonctionne la carte) et aux besoins d'encouragement (stress, fatigue, doute, envie de souffler) — dans ce registre, tu es chaleureux·se et rassurant·e, jamais mièvre.
- Ton ton : direct, un peu affairé·e (tu coordonnes beaucoup de monde en même temps), mais jamais froid ni expéditif.
- Réponses courtes et orales (2 à 4 phrases). Jamais de liste à puces, jamais de markdown, jamais de ton d'assistant.`

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { sessionId } = req.query
      if (!sessionId) return res.status(400).json({ error: 'sessionId requis.' })

      const session = await getSession(sessionId)
      if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

      if (!session.charlieHistory) {
        session.charlieHistory = [{ role: 'assistant', content: CHARLIE_INTRO }]
        await saveSession(sessionId, session)
      }

      return res.status(200).json({ history: session.charlieHistory })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { sessionId, message } = body || {}
      if (!sessionId || !message) {
        return res.status(400).json({ error: 'sessionId et message sont requis.' })
      }

      const session = await getSession(sessionId)
      if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

      if (!session.charlieHistory) {
        session.charlieHistory = [{ role: 'assistant', content: CHARLIE_INTRO }]
      }
      session.charlieHistory.push({ role: 'user', content: message })

      const reply = await askClaudeConversation({
        system: CHARLIE_SYSTEM_PROMPT,
        messages: windowedHistory(session.charlieHistory),
        model: MODEL_CHARLIE,
        maxTokens: 300,
      })

      session.charlieHistory.push({
        role: 'assistant',
        content: reply || "Attends, j'ai un souci de radio de mon côté — tu peux redire ça ?",
      })

      await saveSession(sessionId, session)
      return res.status(200).json({ history: session.charlieHistory })
    }

    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  } catch (err) {
    console.error('Erreur /api/charlie :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur Charlie : ${detail}` })
  }
}
