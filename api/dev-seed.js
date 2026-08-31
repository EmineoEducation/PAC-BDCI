// api/dev-seed.js — RACCOURCI DE TEST, jamais actif en production.
//
// Atteindre le bilan demande d'avoir terminé deux PAC, soit sept heures de
// rédaction réelle : intestable à la main. Ce point d'entrée injecte des
// productions factices dans une session EXISTANTE pour que la carte de bilan
// se déclenche immédiatement.
//
// GARDE-FOU : le handler répond 404 si la variable DEV_SEED_TOKEN n'est pas
// posée. En ne la définissant QUE sur le scope Preview de Vercel, le raccourci
// n'existe tout simplement pas en production — le fichier peut rester dans le
// dépôt sans risque.
//
// Mode d'emploi :
//   1. Parcours normal jusqu'à la carte du festival (identification + Barnum).
//   2. Console du navigateur, sur la page du plan :
//
//      await fetch('/api/dev-seed', {
//        method: 'POST',
//        headers: { 'Content-Type': 'application/json' },
//        body: JSON.stringify({
//          sessionId: localStorage.getItem('pacbdci_session_id'),
//          token: 'LA-VALEUR-DE-DEV_SEED_TOKEN',
//          scope: 'jour1',   // ou 'complet'
//        }),
//      }).then((r) => r.json())
//
//   3. Recharge la page : la carte de bilan apparaît et l'envoi part.
//
// Pour rejouer un envoi déjà effectué, passe `reset: true` : les bilans
// enregistrés et les confirmations d'envoi sont effacés côté serveur. Pense à
// vider aussi la garde locale du navigateur :
//   Object.keys(localStorage).filter(k => k.startsWith('pacbdci_bilan_sent_'))
//     .forEach(k => localStorage.removeItem(k))

import { getSession, saveSession } from '../lib/redis.js'
import { BARNUM_QUESTIONS } from '../src/data/barnumQuestions.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

const SCOPES = {
  jour1: ['pac1', 'pac2'],
  complet: ['pac1', 'pac2', 'pac3', 'pac4'],
}

// Une posture-méta différente par PAC, pour que la lecture transversale de
// Stabilité/Adaptabilité ne renvoie pas systématiquement « même ligne partout ».
const META_TAGS = {
  pac1: 'initiative_propre',
  pac2: 'ajustement_mediation',
  pac3: 'ajustement_mediation',
  pac4: 'retrait_delegation',
}

const FILLER = `J'ai commencé par relire ce qui m'avait été transmis pour repérer ce qui manquait réellement : le nom du contact, l'horaire, et surtout qui validait quoi. Plutôt que d'attendre une réponse qui pouvait tarder, j'ai posé mes hypothèses par écrit.

J'ai ensuite prévenu les deux personnes concernées en signalant explicitement les points que je n'avais pas pu vérifier, pour que personne ne découvre le trou après moi. Texte de remplissage produit par /api/dev-seed.`

export default async function handler(req, res) {
  const expected = process.env.DEV_SEED_TOKEN
  if (!expected) return res.status(404).json({ error: 'Not found.' })

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, token, scope = 'jour1', reset = false } = body || {}

    if (token !== expected) return res.status(403).json({ error: 'Jeton invalide.' })
    if (!sessionId) return res.status(400).json({ error: 'sessionId est requis.' })
    if (!SCOPES[scope]) {
      return res.status(400).json({ error: `scope doit valoir ${Object.keys(SCOPES).join(' ou ')}.` })
    }

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

    const pacIds = SCOPES[scope]

    // Réponses Barnum neutres si le questionnaire n'a pas été rempli — le tracé
    // d'entrée de la toile en a besoin. Valeurs volontairement variées, sinon
    // tous les axes se superposent et le graphique ne prouve rien.
    if (!session.barnumAnswers || !Object.keys(session.barnumAnswers).length) {
      const answers = {}
      BARNUM_QUESTIONS.forEach((q, i) => {
        answers[q.id] = q.type === 'likert' ? [2, 3, 4, 5, 3, 4][i % 6] : i % 2 ? 'optionB' : 'optionA'
      })
      session.barnumAnswers = answers
    }
    session.barnumProfile = session.barnumProfile || {
      text: 'Portrait d\'entrée de remplissage, produit par /api/dev-seed pour les tests.',
      generatedAt: new Date().toISOString(),
    }

    // Une entrée par situation, en respectant la forme écrite par /api/respond.
    const entries = []
    for (const pacId of pacIds) {
      const pac = pacContent.pacs.find((p) => p.id === pacId)
      if (!pac) continue
      pac.situations.forEach((sit, index) => {
        const tendencies = sit.palierB?.tendencies || []
        const tendency = tendencies[index % Math.max(tendencies.length, 1)]
        entries.push({
          pacId,
          situationId: sit.id,
          order: index + 1,
          choiceLabel: sit.palierA?.microChoiceOptions?.[index % 4] || 'Choix de remplissage',
          palierBText: FILLER,
          matchedTendencyId: tendency?.id || null,
          offTree: false,
          surpriseText: tendency?.surprise || 'Surprise de remplissage.',
          synthese1Text: 'Synthèse 1 de remplissage, produite par /api/dev-seed.',
          reaction1Text: FILLER,
          synthese2Text: 'Synthèse 2 de remplissage, produite par /api/dev-seed.',
          reaction2Text:
            'Je comprends le point soulevé. Sur le moment, j\'ai priorisé la remise du document plutôt que la revalidation.',
          ...(index === 0
            ? { feedbackIntermediaire: 'Feedback intermédiaire de remplissage.' }
            : { feedbackFinal: 'Feedback final de remplissage.' }),
          timestamp: new Date().toISOString(),
        })
      })
    }

    // Les entrées d'un PAC re-semé sont remplacées, pas empilées.
    session.entries = [...(session.entries || []).filter((e) => !pacIds.includes(e.pacId)), ...entries]

    session.progression = session.progression || {}
    session.progression.completedPacs = [
      ...new Set([...(session.progression.completedPacs || []), ...pacIds]),
    ]
    session.progression.metaPostureTags = {
      ...session.progression.metaPostureTags,
      ...Object.fromEntries(pacIds.map((p) => [p, META_TAGS[p]])),
    }

    if (reset) {
      session.bilans = {}
      session.progression.bilansSent = []
    }

    await saveSession(sessionId, session)

    return res.status(200).json({
      ok: true,
      scope,
      completedPacs: session.progression.completedPacs,
      entries: session.entries.length,
      bilansSent: session.progression.bilansSent || [],
      next: 'Recharge la page du plan : la carte de bilan doit apparaître.',
    })
  } catch (err) {
    console.error('Erreur /api/dev-seed :', err)
    return res.status(500).json({ error: err.message })
  }
}
