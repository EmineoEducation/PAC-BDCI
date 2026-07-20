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

export async function askClaude({ system, prompt, model = MODEL_DEFAULT, maxTokens = 1200, temperature = 0.7 }) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock ? textBlock.text : ''
}

// Force une réponse JSON stricte — utilisé pour la classification de tendance.
export async function askClaudeJSON(args) {
  const raw = await askClaude(args)
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`Réponse non-JSON de Claude : ${cleaned.slice(0, 200)}`)
  }
}
