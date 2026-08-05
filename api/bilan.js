import { getSession, saveSession } from '../lib/redis.js'
import { askClaude, MODEL_DEFAULT } from '../lib/anthropic.js'
import { buildBilanPrompt } from '../lib/prompts.js'
import { buildToile, bilanScope, AXIS_CARRIER_PAC } from '../src/lib/bilanScoring.js'
import { BARNUM_QUESTIONS } from '../src/data/barnumQuestions.js'
import pacContent from '../src/data/pacContent.json' with { type: 'json' }

// POST /api/bilan
//   { sessionId }                      → génère (ou renvoie) la note de la portée courante
//   { sessionId, confirmSent: 'jour1' } → enregistre que ce bilan a bien été envoyé
//
// Le PDF part à JOURNÉE COMPLÈTE : jour 1 = pac1+pac2, jour 2 = pac3+pac4.
// Un·e étudiant·e reçoit donc un ou deux documents, jamais plus. La règle vit
// dans bilanScope() — ce handler ne la réimplémente pas.
//
// Le rendu PDF est fait CÔTÉ CLIENT (src/lib/pdfBilan.js) puis transmis en
// base64 à /api/send-bilan, comme la chaîne générique des 18 PAC procède déjà
// pour sa carte visuelle. Ce handler ne produit que le texte et les positions.

// Rattache chaque axe aux situations qui l'ont réellement produit. Décision
// actée : « chaque point relié à une situation concrète, jamais un chiffre nu ».
// On affiche des TITRES DE SITUATION, jamais un nom de tendance ni de dimension.
function axisSituations(dimension) {
  const pacId = AXIS_CARRIER_PAC[dimension]
  if (!pacId) return ['Lu sur l\'ensemble des demi-journées traversées']
  const pac = pacContent.pacs.find((p) => p.id === pacId)
  if (!pac) return []
  return pac.situations.map((s) => s.title)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { sessionId, confirmSent } = body || {}
    if (!sessionId) return res.status(400).json({ error: 'sessionId est requis.' })

    const session = await getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session introuvable ou expirée.' })

    session.progression = session.progression || {}
    session.bilans = session.bilans || {}
    session.progression.bilansSent = session.progression.bilansSent || []

    // ── Confirmation d'envoi ────────────────────────────────────────────────
    if (confirmSent) {
      if (!session.progression.bilansSent.includes(confirmSent)) {
        session.progression.bilansSent.push(confirmSent)
        await saveSession(sessionId, session)
      }
      return res.status(200).json({ bilansSent: session.progression.bilansSent })
    }

    // ── Portée courante ─────────────────────────────────────────────────────
    const completed = session.progression.completedPacs || []
    const scope = bilanScope(completed)
    if (!scope) {
      return res.status(409).json({
        error: 'Aucune journée complète pour le moment — le bilan est établi à l\'issue d\'une journée entière.',
      })
    }

    const alreadySent = session.progression.bilansSent.includes(scope.key)
    const entries = session.entries || []

    // La toile n'accompagne que le bilan de fin de parcours : à une seule
    // journée, trop peu d'axes sont comparables pour qu'un tracé ait du sens
    // (cf. bilanScoring — Action/Réflexion n'a aucun signal classé). Le bilan
    // du jour 1 est donc purement narratif, et le signale à l'étudiant·e.
    const withToile = scope.key === 'complet'
    const axes = withToile
      ? buildToile({
          answers: session.barnumAnswers || {},
          entries,
          progression: session.progression,
          questions: BARNUM_QUESTIONS,
        }).map((axis) => ({ ...axis, situations: axisSituations(axis.dimension) }))
      : []

    // ── Texte : généré une fois, puis relu depuis la session ────────────────
    let text = session.bilans[scope.key]?.text
    if (!text) {
      const postures = scope.pacs
        .map((pacId) => {
          const pac = pacContent.pacs.find((p) => p.id === pacId)
          if (!pac) return null
          const pacEntries = entries
            .filter((e) => e.pacId === pacId)
            .sort((a, b) => a.order - b.order)
          if (!pacEntries.length) return null
          return {
            posture: pac.posture,
            character: pac.character,
            studentTexts: pacEntries.flatMap((e) => [
              `Palier B : ${e.palierBText}`,
              `Réaction 1 : ${e.reaction1Text}`,
              `Réaction 2 : ${e.reaction2Text}`,
            ]),
            feedbackFinal: pacEntries.find((e) => e.order === 2)?.feedbackFinal || null,
          }
        })
        .filter(Boolean)

      if (!postures.length) {
        return res.status(409).json({ error: 'Aucune production trouvée pour cette portée.' })
      }

      const { system, prompt } = buildBilanPrompt({
        scopeLabel: scope.label,
        postures,
        barnumSummary: session.barnumProfile?.text || null,
        isComplete: withToile,
      })

      // 1600 tokens : la note complète vise 450-600 mots, avec de la marge pour
      // éviter une coupure en plein mot comme observé sur les feedbacks.
      text = await askClaude({ system, prompt, model: MODEL_DEFAULT, maxTokens: 1600 })

      session.bilans[scope.key] = { text, generatedAt: new Date().toISOString() }
      await saveSession(sessionId, session)
    }

    // Productions brutes, verbatim, pour l'annexe du PDF. Le RP doit pouvoir
    // lire ce que l'apprenant a réellement écrit, pas seulement la synthèse.
    // On ne remonte QUE la matière produite par l'étudiant·e : ni les surprises
    // ni les synthèses générées, qui alourdiraient sans être de son fait.
    const productions = scope.pacs
      .map((pacId) => {
        const pac = pacContent.pacs.find((p) => p.id === pacId)
        if (!pac) return null
        const pacEntries = entries
          .filter((e) => e.pacId === pacId)
          .sort((a, b) => a.order - b.order)
        if (!pacEntries.length) return null
        return {
          posture: pac.posture,
          character: pac.character,
          situations: pacEntries.map((e) => ({
            title:
              pac.situations.find((sit) => sit.id === e.situationId)?.title ||
              `Situation ${e.order}`,
            choiceLabel: e.choiceLabel || null,
            focusLoss: e.focusLoss || null,
            palierBText: e.palierBText || null,
            reaction1Text: e.reaction1Text || null,
            reaction2Text: e.reaction2Text || null,
          })),
        }
      })
      .filter(Boolean)

    return res.status(200).json({
      scope: { key: scope.key, label: scope.label, day: scope.day },
      text,
      axes,
      withToile,
      alreadySent,
      productions,
      student: {
        prenom: session.prenom || '',
        nom: session.nom || '',
        email: session.email || '',
        campus: session.campus || '',
        formation: session.formation || '',
      },
    })
  } catch (err) {
    console.error('Erreur /api/bilan :', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    const detail =
      err?.error?.error?.message || err?.error?.message || err?.message || 'Erreur inconnue'
    return res.status(500).json({ error: `Erreur serveur lors de la génération du bilan : ${detail}` })
  }
}
