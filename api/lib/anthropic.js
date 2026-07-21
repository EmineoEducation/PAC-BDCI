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

// `temperature` est déprécié pour Sonnet 5 (retiré le 20/07 suite à l'erreur
// API "temperature is deprecated for this model") — ne plus l'envoyer.
export async function askClaude({ system, prompt, model = MODEL_DEFAULT, maxTokens = 1200 }) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock ? textBlock.text : ''
}

// Force une réponse JSON stricte — utilisé pour la classification de tendance.
export async function askClaudeJSON(args) {
  const raw = await askClaude(args)
  let cleaned = raw.replace(/```json|```/g, '').trim()

  // Filet de sécurité : si le modèle ajoute un préambule ou un commentaire
  // malgré la consigne "JSON strict, sans texte avant ou après", on isole le
  // plus grand bloc { ... } plutôt que d'échouer sur la moindre phrase parasite.
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(cleaned)
  } catch {
    // Fenêtre élargie (500 au lieu de 200) + réponse brute complète dans les logs serveur
    // (Vercel → Functions/Logs) pour permettre un vrai diagnostic sans dépendre de ce message.
    console.error('askClaudeJSON — réponse brute reçue de Claude :', raw)
    throw new Error(`Réponse non-JSON de Claude (voir logs serveur pour le contenu complet) : ${cleaned.slice(0, 500) || '(réponse vide)'}`)
  }
}
