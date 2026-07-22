import { randomUUID } from 'crypto'
import { getSession, saveSession } from '../lib/redis.js'

// Validation serveur (la validation client de Portal1 est contournable).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/session         → crée une nouvelle session (portail 1)
// GET  /api/session?id=xxx  → relit une session existante (retour du plan/carnet)

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { nom, prenom, email, formation, campus } = body || {}

      if (!nom || !prenom || !email || !formation || !campus) {
        return res.status(400).json({ error: 'nom, prenom, email, formation et campus sont requis.' })
      }
      if (!EMAIL_RE.test(String(email))) {
        return res.status(400).json({ error: 'Adresse mail invalide.' })
      }

      const id = randomUUID()
      const session = {
        id,
        nom,
        prenom,
        email,
        formation,
        campus,
        createdAt: new Date().toISOString(),
        barnumProfile: null, // rempli après le questionnaire d'entrée (une seule fois)
        progression: {
          completedPacs: [], // ex: ["pac1", "pac2"]
          metaPostureTags: {}, // ex: { pac1: "initiative_propre" }
        },
        entries: [], // historique du carnet de bord, grandit au fil du parcours
      }

      await saveSession(id, session)
      return res.status(201).json({ session })
    }

    if (req.method === 'GET') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Paramètre id requis.' })

      const session = await getSession(id)
      if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

      return res.status(200).json({ session })
    }

    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  } catch (err) {
    console.error('Erreur /api/session', err)
    return res.status(500).json({ error: 'Erreur serveur.' })
  }
}
