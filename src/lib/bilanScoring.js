// Calcul déterministe des positions de la toile superposée (PDF de bilan).
//
// Principe acté : la toile n'est pas un typage, c'est une COMPARAISON entre le
// portrait d'entrée (déclaré) et le comportement observé. Le score n'est qu'un
// artefact de mise en forme interne — jamais affiché à l'étudiant, jamais
// formulé comme un verdict. Les noms de dimension ne sortent jamais non plus :
// seuls les libellés narratifs (AXIS_LABELS) sont visibles.
//
// Échelle commune 1..5, orientée du pôle `low` vers le pôle `high` de
// DIMENSION_POLES (cf. src/data/barnumQuestions.js).

import {
  BARNUM_QUESTIONS,
  DIMENSIONS_ORDER,
  DIMENSION_POLES,
} from '../data/barnumQuestions.js'

// Libellés narratifs affichés sur la toile — jamais le nom brut de la
// dimension. Formulés comme deux manières de faire, sans pôle valorisé.
export const AXIS_LABELS = {
  cadre_autonomie: { low: 'Sécuriser le cadre', high: 'Avancer sans attendre' },
  action_reflexion: { low: 'Entrer dans l\'action', high: 'Cadrer avant d\'agir' },
  exigence_pragmatisme: { low: 'Viser la finition', high: 'Viser l\'utile' },
  stabilite_adaptabilite: { low: 'Tenir sa ligne', high: 'Épouser le mouvement' },
  relation_autonomie: { low: 'Passer par l\'autre', high: 'Trancher soi-même' },
  visibilite_discretion: { low: 'Se rendre visible', high: 'Laisser le travail parler' },
}

// PAC porteur de chaque dimension. `null` = pas de PAC porteur (lecture
// transversale pour stabilite_adaptabilite).
// ⚠️ action_reflexion est à `null` DÉLIBÉRÉMENT. Cette dimension est portée par
// PAC1 en secondaire, mais aucune tendance classée ne la mesure : les trois
// branches du palier B de PAC1 portent toutes sur Cadre/Autonomie. Lui affecter
// 'pac1' produirait un tracé strictement identique à celui de cadre_autonomie —
// deux axes jumeaux sur la toile, ce qui est pire qu'un axe absent. Elle reste
// donc hors du tracé observé tant qu'un signal propre n'est pas capté.
export const AXIS_CARRIER_PAC = {
  cadre_autonomie: 'pac1',
  action_reflexion: null,
  exigence_pragmatisme: 'pac2',
  stabilite_adaptabilite: null,
  relation_autonomie: 'pac3',
  visibilite_discretion: 'pac4',
}

// Position sur l'axe (1..5) de chaque tendance classée au palier B.
// ⚠️ Ce tableau est une DÉCISION DE MISE EN FORME, pas une mesure. Il traduit
// des tendances qualitatives en positions pour que la toile soit dessinable.
// Les trois tendances d'un PAC ne sont pas toujours alignées sur un même axe
// (ex. « délégation de l'arbitrage » n'est pas un degré d'exigence) : elles
// sont alors placées au centre. C'est le point le plus discutable du calcul —
// à ajuster ici, en un seul endroit, plutôt qu'ailleurs dans le code.
const TENDENCY_POSITION = {
  // cadre_autonomie — Cadre (1) → Autonomie (5)
  autonomie_affirmee: 5,
  cadre_recherche: 3,
  attente_du_cadre: 1,
  // exigence_pragmatisme — Exigence (1) → Pragmatisme (5)
  exigence_globale: 1,
  pragmatisme_cible: 5,
  delegation_arbitrage: 3,
  // relation_autonomie — Relation (1) → Autonomie (5)
  priorite_relationnelle: 1,
  priorite_autorite: 2,
  mediation_autonome: 5,
  // visibilite_discretion — Visibilité (1) → Discrétion (5)
  visibilite_comprehensive: 1,
  visibilite_defensive: 2,
  discretion_evitement: 5,
}

// Séquence de postures-méta → position sur Stabilité (1) / Adaptabilité (5).
const META_POSTURE_RANK = {
  initiative_propre: 1,
  ajustement_mediation: 2,
  retrait_delegation: 3,
}

function round1(n) {
  return Math.round(n * 10) / 10
}

// ── Tracé d'entrée : agrégation des réponses Barnum ────────────────────────
// Likert : valeur brute, inversée (6 - v) si l'accord penche vers le pôle bas.
// Projectif : 5 si l'option choisie est celle du pôle haut, sinon 1. Les
// projectifs pèsent volontairement autant qu'un Likert — ils sont deux sur
// huit items par dimension, leur poids relatif reste mesuré.
export function entryAxisValue(dimension, answers, questions = BARNUM_QUESTIONS) {
  const items = questions.filter((q) => q.dimension === dimension)
  const values = []
  for (const q of items) {
    const raw = answers?.[q.id]
    if (raw === undefined || raw === null) continue
    if (q.type === 'likert') {
      if (!Number.isInteger(raw)) continue
      values.push(q.reverse ? 6 - raw : raw)
    } else {
      values.push(raw === q.highOption ? 5 : 1)
    }
  }
  if (!values.length) return null
  return round1(values.reduce((a, b) => a + b, 0) / values.length)
}

// ── Tracé observé : agrégation des tendances classées ──────────────────────
// Une dimension n'est lisible que si son PAC porteur a été complété. Les deux
// situations d'un PAC comptent pour une moyenne — un étudiant qui bascule
// d'une situation à l'autre se retrouve au centre, ce qui est l'information
// juste (aucune ligne claire) plutôt qu'un artefact.
export function observedAxisValue(dimension, entries = [], progression = {}) {
  if (dimension === 'stabilite_adaptabilite') {
    return observedStability(progression)
  }

  const pacId = AXIS_CARRIER_PAC[dimension]
  if (!pacId) return null
  if (!(progression.completedPacs || []).includes(pacId)) return null

  const positions = entries
    .filter((e) => e.pacId === pacId && !e.offTree)
    .map((e) => TENDENCY_POSITION[e.matchedTendencyId])
    .filter((p) => typeof p === 'number')

  if (!positions.length) return null
  return round1(positions.reduce((a, b) => a + b, 0) / positions.length)
}

// Stabilité/Adaptabilité : illisible sur un seul PAC (aucune comparaison
// possible), première lecture à 2, lecture pleine à 4. Trois cas de figure :
// même posture partout → Stabilité (1) ; posture qui varie → Adaptabilité (5) ;
// dérive régulière vers le retrait → position intermédiaire, la variation
// n'étant alors pas une adaptation au contexte mais une érosion.
export function observedStability(progression = {}) {
  const tags = progression.metaPostureTags || {}
  const ordered = ['pac1', 'pac2', 'pac3', 'pac4']
    .filter((p) => tags[p])
    .map((p) => tags[p])

  if (ordered.length < 2) return null

  const distinct = new Set(ordered)
  if (distinct.size === 1) return 1

  // À deux PAC, une variation est forcément « monotone » (deux points font
  // toujours une droite) : impossible d'y distinguer une adaptation au contexte
  // d'une érosion. On rend une position intermédiaire haute, cohérente avec le
  // statut de « première lecture indicative » acté pour ce cas.
  if (ordered.length === 2) return 4

  const ranks = ordered.map((t) => META_POSTURE_RANK[t]).filter((r) => r)
  const monotoneDrift =
    ranks.length === ordered.length &&
    ranks.every((r, i) => i === 0 || r >= ranks[i - 1]) &&
    ranks[ranks.length - 1] > ranks[0]

  return monotoneDrift ? 3 : 5
}

// ── Assemblage de la toile ─────────────────────────────────────────────────
// Règle actée : axes disponibles uniquement, jamais d'axe grisé en attente.
// Une dimension n'apparaît que si les DEUX tracés sont calculables — un axe
// avec le seul portrait d'entrée ne compare rien et fausse la lecture.
export function buildToile({ answers, entries = [], progression = {}, questions = BARNUM_QUESTIONS }) {
  const axes = []
  for (const dimension of DIMENSIONS_ORDER) {
    const entry = entryAxisValue(dimension, answers, questions)
    const observed = observedAxisValue(dimension, entries, progression)
    if (entry === null || observed === null) continue
    axes.push({
      dimension,
      labelLow: AXIS_LABELS[dimension].low,
      labelHigh: AXIS_LABELS[dimension].high,
      poles: DIMENSION_POLES[dimension],
      entry,
      observed,
      gap: round1(observed - entry),
    })
  }
  return axes
}

// Portée du bilan à partir des PAC réellement complétés.
// Le PDF part à journée complète : jour 1 = pac1+pac2, jour 2 = pac3+pac4.
export function bilanScope(completedPacs = []) {
  const has = (p) => completedPacs.includes(p)
  const day1 = has('pac1') && has('pac2')
  const day2 = has('pac3') && has('pac4')
  if (day1 && day2) return { key: 'complet', label: 'Bilan complet', day: 2, pacs: ['pac1', 'pac2', 'pac3', 'pac4'] }
  if (day2) return { key: 'jour2', label: 'Bilan de la seconde journée', day: 2, pacs: ['pac3', 'pac4'] }
  if (day1) return { key: 'jour1', label: 'Bilan de la première journée', day: 1, pacs: ['pac1', 'pac2'] }
  return null
}
