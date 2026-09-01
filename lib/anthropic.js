// ==============================================================
//  CORRECTIF URGENT - PAC BDCI - SESSION DU 01/09
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : lib/anthropic.js   (ecrase le fichier existant)
//  CORRECTIF   : reponses tronquees / vides -> 500 sur /api/synthese1
//  DATE        : 01/09/2026
// ==============================================================

import Anthropic from '@anthropic-ai/sdk'

// Nécessite la variable d'environnement ANTHROPIC_API_KEY.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Modèle unique tranché le 20/07 : Sonnet 5 partout (portraits, classification,
// feedback intermédiaire/final). Opus 4.8 réservé en option à la synthèse finale
// si besoin ponctuel de qualité maximale (non activé par défaut).
export const MODEL_DEFAULT = 'claude-sonnet-5'
export const MODEL_SYNTHESIS_OPTION = 'claude-opus-4-8'
export const MODEL_CHARLIE = 'claude-haiku-4-5-20251001'

// ── Correctif 01/09 · pourquoi ce fichier change ────────────────────────────
// En session réelle, /api/synthese1 renvoyait un 500 sur la moitié des appels.
// Les logs serveur montrent trois symptômes distincts d'une même cause :
//   1. JSON coupé en plein milieu d'un mot ("surpriseText": "Le partenaire est
//      rassuré par ton sér)
//   2. JSON coupé encore plus tôt, sur la clé elle-même ("surpriseText)
//   3. réponse totalement vide
// Ce sont trois manifestations de `stop_reason: "max_tokens"` : le budget de
// génération est épuisé avant que le texte ne soit terminé. Le code précédent
// ne lisait jamais `stop_reason`, ne prenait que le PREMIER bloc de type text,
// et laissait remonter l'échec de JSON.parse en 500 — un cul-de-sac pour
// l'étudiant·e, alors que sa production était intacte.
//
// Trois garde-fous sont posés ici :
//   - on concatène TOUS les blocs de texte, pas seulement le premier ;
//   - une troncature déclenche automatiquement une nouvelle tentative avec un
//     budget doublé, jusqu'à MAX_RELANCES_TRONCATURE ;
//   - askClaudeJSON tente de réparer un JSON tronqué avant d'abandonner.
// Le dernier filet (ne jamais renvoyer 500 à l'étudiant·e) est posé dans les
// endpoints eux-mêmes, pas ici.

const MAX_RELANCES_TRONCATURE = 2
const MAX_RELANCES_TRANSITOIRE = 3
const DELAIS_TRANSITOIRE = [700, 1800] // ms
const STATUTS_TRANSITOIRES = new Set([408, 409, 429, 500, 502, 503, 504, 529])

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

function estTransitoire(err) {
  const statut = err?.status ?? err?.statusCode ?? err?.response?.status
  if (statut && STATUTS_TRANSITOIRES.has(statut)) return true
  const type = err?.error?.error?.type || err?.error?.type
  if (type === 'overloaded_error' || type === 'rate_limit_error' || type === 'api_error') return true
  // Coupure réseau entre la fonction serverless et l'API.
  return err?.name === 'APIConnectionError' || err?.name === 'APIConnectionTimeoutError'
}

// Concatène tous les blocs texte. Un bloc `thinking` éventuel est ignoré ici
// mais consomme bien du budget côté API — d'où l'importance de relire
// `stop_reason` plutôt que de supposer qu'une réponse courte est complète.
function extraireTexte(response) {
  if (!Array.isArray(response?.content)) return ''
  return response.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

// Appel bas niveau : renvoie le texte ET le motif d'arrêt, avec reprise sur
// erreur transitoire de l'API (surcharge, limite de débit, coupure réseau).
async function appelBrut({ system, prompt, model, maxTokens }) {
  let derniereErreur = null

  for (let tentative = 1; tentative <= MAX_RELANCES_TRANSITOIRE; tentative++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      })
      return {
        text: extraireTexte(response),
        stopReason: response?.stop_reason ?? null,
      }
    } catch (err) {
      derniereErreur = err
      if (!estTransitoire(err) || tentative === MAX_RELANCES_TRANSITOIRE) throw err
      const attente = DELAIS_TRANSITOIRE[tentative - 1] ?? 1800
      console.warn(
        `[anthropic] tentative ${tentative}/${MAX_RELANCES_TRANSITOIRE} échouée (${err?.status ?? err?.name}) — nouvelle tentative dans ${attente} ms`
      )
      await pause(attente)
    }
  }

  throw derniereErreur
}

// `temperature` est déprécié pour Sonnet 5 (retiré le 20/07 suite à l'erreur
// API "temperature is deprecated for this model") — ne plus l'envoyer.
//
// Correctif 01/09 : si la génération est coupée par `max_tokens` (ou revient
// vide), on relance automatiquement avec un budget doublé. Un texte tronqué
// affiché tel quel à l'étudiant·e serait pire qu'une attente d'une seconde.
export async function askClaude({ system, prompt, model = MODEL_DEFAULT, maxTokens = 1200 }) {
  let budget = maxTokens

  for (let essai = 0; essai <= MAX_RELANCES_TRONCATURE; essai++) {
    const { text, stopReason } = await appelBrut({ system, prompt, model, maxTokens: budget })
    const tronque = stopReason === 'max_tokens'
    const vide = !text.trim()

    if (!tronque && !vide) return text

    if (essai === MAX_RELANCES_TRONCATURE) {
      // Dernier recours : on rend ce qu'on a plutôt que rien. Un texte
      // incomplet reste exploitable par l'appelant, qui décidera s'il bascule
      // sur son propre repli.
      console.error(
        `[anthropic] génération encore ${vide ? 'vide' : 'tronquée'} après ${MAX_RELANCES_TRONCATURE} relances (budget final ${budget}).`
      )
      return text
    }

    budget = Math.min(budget * 2, 8000)
    console.warn(
      `[anthropic] réponse ${vide ? 'vide' : 'tronquée (stop_reason=max_tokens)'} — relance avec max_tokens=${budget}`
    )
  }

  return ''
}

// Échange multi-tours (historique de messages) — utilisé par Charlie, qui garde
// le fil de la conversation sur toute la durée de la session de l'étudiant·e.
export async function askClaudeConversation({ system, messages, model = MODEL_CHARLIE, maxTokens = 300 }) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  })
  return extraireTexte(response)
}

// ── Réparation d'un JSON tronqué ────────────────────────────────────────────
// Quand la génération a été coupée net, il manque typiquement la fin d'une
// chaîne et les accolades fermantes. Plutôt que de perdre la classification
// déjà produite (matchedTendencyId arrive en premier dans le JSON, donc il est
// presque toujours complet), on referme proprement ce qui est ouvert.
function reparerJsonTronque(brut) {
  let s = brut.trim()
  if (!s) return null

  const pile = []
  let dansChaine = false
  let echappe = false

  for (const c of s) {
    if (dansChaine) {
      if (echappe) echappe = false
      else if (c === '\\') echappe = true
      else if (c === '"') dansChaine = false
      continue
    }
    if (c === '"') dansChaine = true
    else if (c === '{' || c === '[') pile.push(c)
    else if (c === '}' || c === ']') pile.pop()
  }

  if (dansChaine) s += '"'
  // Virgule ou deux-points en suspens juste avant la coupure.
  s = s.replace(/[,:]\s*$/, '')
  // Clé orpheline sans valeur (ex. ..., "surpriseText" ).
  s = s.replace(/,\s*"[^"]*"\s*$/, '')

  while (pile.length) {
    const ouvrant = pile.pop()
    s += ouvrant === '{' ? '}' : ']'
  }

  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// Force une réponse JSON stricte — utilisé pour la classification de tendance.
// Correctif 01/09 : budget par défaut relevé (la classification était appelée
// avec 1000 tokens et se faisait couper), extraction du bloc { ... } conservée,
// puis tentative de réparation avant de renoncer.
export async function askClaudeJSON(args) {
  const raw = await askClaude({ maxTokens: 4000, ...args })
  let cleaned = raw.replace(/```json|```/g, '').trim()

  // Filet de sécurité : si le modèle ajoute un préambule ou un commentaire
  // malgré la consigne "JSON strict, sans texte avant ou après", on isole le
  // plus grand bloc { ... } plutôt que d'échouer sur la moindre phrase parasite.
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  } else if (firstBrace !== -1) {
    // Pas d'accolade fermante du tout : réponse coupée avant la fin.
    cleaned = cleaned.slice(firstBrace)
  }

  try {
    return JSON.parse(cleaned)
  } catch {
    const repare = reparerJsonTronque(cleaned)
    if (repare) {
      console.warn('[anthropic] JSON tronqué réparé automatiquement.')
      return repare
    }
    console.error('askClaudeJSON — réponse brute reçue de Claude :', raw)
    throw new Error(
      `Réponse non-JSON de Claude (voir logs serveur pour le contenu complet) : ${cleaned.slice(0, 500) || '(réponse vide)'}`
    )
  }
}
