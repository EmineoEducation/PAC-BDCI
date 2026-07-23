// Logique de progression partagée entre le frontend (grisage des zones du plan)
// et les fonctions serverless (validation côté serveur). Ordre fixe pac1→pac2→pac3→pac4,
// aucune fréquentation éclatée à gérer : cf. PAC_BDCI_synthese_scenarisation.md, section 8.

const PAC_ORDER = ['pac1', 'pac2', 'pac3', 'pac4']

export function isPacUnlocked(pacId, completedPacs = []) {
  const index = PAC_ORDER.indexOf(pacId)
  if (index === -1) return false // pacId inconnu : jamais débloqué
  if (index === 0) return true // pac1 toujours accessible dès le portrait Barnum passé
  const previousPac = PAC_ORDER[index - 1]
  return completedPacs.includes(previousPac)
}

export function nextPacToUnlock(completedPacs = []) {
  return PAC_ORDER.find((id) => !completedPacs.includes(id)) || null
}

// Aligné sur pacContent.json > meta.cumulRules :
//   1 PAC        → portrait_de_posture
//   2 ou 3 PAC   → portrait_partiel
//   4 PAC        → bilan_complet
export function cumulLevel(completedPacs = []) {
  const n = completedPacs.length
  if (n === 0) return 'aucun'
  if (n === 1) return 'portrait_de_posture'
  if (n >= 4) return 'bilan_complet'
  return 'portrait_partiel'
}

// Détermine la posture-méta (Stabilité/Adaptabilité) à partir de la tendance
// observée en situation 2 de chaque PAC — voir metaPostureMapping dans pacContent.json.
export function tagMetaPosture(pacId, tendencyId, metaPostureMapping) {
  for (const [posture, mapping] of Object.entries(metaPostureMapping)) {
    // La clé "note" du mapping est une chaîne documentaire, pas une posture.
    if (typeof mapping !== 'object' || mapping === null) continue
    if (mapping[pacId] === tendencyId) return posture
  }
  return null
}

export { PAC_ORDER }
