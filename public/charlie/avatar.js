import { Redis } from '@upstash/redis'

// Nécessite les variables d'environnement UPSTASH_REDIS_REST_URL et
// UPSTASH_REDIS_REST_TOKEN (générées automatiquement si tu relies un
// store Upstash à ton projet Vercel).
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 jours, aligné sur le Portrait Barnum existant

export function sessionKey(id) {
  return `session:${id}`
}

export async function getSession(id) {
  const data = await redis.get(sessionKey(id))
  return data || null
}

export async function saveSession(id, session) {
  await redis.set(sessionKey(id), session, { ex: SESSION_TTL_SECONDS })
}
