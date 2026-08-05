import { useEffect, useRef, useState } from 'react'

// Détection des pertes de focus pendant les phases d'écriture (04/08).
//
// Ce que ça fait : compter les sorties de page et le temps passé ailleurs,
// pendant l'écriture uniquement. Ce que ça ne fait PAS : accélérer un
// décompte. Le carnet n'affiche pas de temps restant mais un temps écoulé,
// présenté comme « repère indicatif » — le fausser priverait l'étudiant·e
// d'un repère honnête sans rien apporter à l'observation.
//
// LIMITE ASSUMÉE, à ne pas oublier : un second écran (téléphone, autre
// machine) ne déclenche rien. Ce n'est donc pas un dispositif de détection,
// c'est un signal doux. La vraie protection reste de concevoir des tâches
// auxquelles une IA ne peut pas répondre à la place de l'étudiant·e.
//
// Le signal est TRANSPARENT : l'indicateur de retour dit à l'étudiant·e ce
// qui a été noté. Rien n'est enregistré en cachette.

const MIN_AWAY_MS = 3000 // en deçà, c'est un changement d'onglet accidentel

export function useFocusLoss(active) {
  const [awayCount, setAwayCount] = useState(0)
  const [awayMs, setAwayMs] = useState(0)
  const [lastAwayMs, setLastAwayMs] = useState(0)
  const leftAt = useRef(null)

  useEffect(() => {
    if (!active) {
      leftAt.current = null
      return
    }

    const onLeave = () => {
      if (leftAt.current === null) leftAt.current = Date.now()
    }

    const onReturn = () => {
      if (leftAt.current === null) return
      const duration = Date.now() - leftAt.current
      leftAt.current = null
      if (duration < MIN_AWAY_MS) return
      setAwayCount((n) => n + 1)
      setAwayMs((ms) => ms + duration)
      setLastAwayMs(duration)
    }

    const onVisibility = () => (document.hidden ? onLeave() : onReturn())

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onLeave)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('focus', onReturn)
    }
  }, [active])

  return {
    awayCount,
    awayMs,
    lastAwayMs,
    acknowledge: () => setLastAwayMs(0),
  }
}

export function formatAway(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} min ${r} s` : `${m} min`
}
