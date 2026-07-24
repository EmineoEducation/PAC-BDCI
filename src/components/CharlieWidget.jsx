import { useEffect, useRef, useState } from 'react'
import { fetchCharlieHistory, sendCharlieMessage } from '../lib/api.js'

// Relances spontanées de Charlie (23/07) — combinaison plafonnée : déclencheur
// transition (retour sur la carte) + déclencheur inactivité, répliques
// scriptées (pas de génération IA pour un élément aussi mineur), plafond
// partagé de 3 apparitions par PAC. Jamais d'indice sur la réponse attendue,
// jamais de dimension nommée — mêmes garde-fous que le chat complet.
const POPUP_CAP_PER_PAC = 3
const INACTIVITY_DELAY_MS = 50000 // ~50s, dans la fourchette 45-60s validée

const TRANSITION_LINES = [
  "Alors, comment ça s'est passé de ce côté-là ?",
  "Le site continue de tourner — à toi de voir où aller ensuite.",
  'Prends le temps qu\'il te faut, personne ne te presse ici.',
  'Une étape de faite. La suite t\'attend quand tu es prêt·e.',
  'Le plan n\'a pas bougé — à toi de choisir la prochaine zone.',
]

const INACTIVITY_LINES = [
  'Toujours là si tu cherches ton chemin sur le site.',
  "Pas d'urgence, mais je reste dans le coin si besoin.",
  "Le prochain poste t'attend quand tu es prêt·e.",
  "Si une zone n'est pas claire, je peux t'orienter.",
  'Je ne bouge pas d\'ici, prends ton temps.',
]

function popupCountKey(pacId) {
  return `pacbdci_charlie_pops_${pacId}`
}

function getPopupCount(pacId) {
  // Pas de PAC en cours (bilan complet, 4/4) : plus de relance à afficher.
  if (!pacId) return POPUP_CAP_PER_PAC
  try {
    return Number(localStorage.getItem(popupCountKey(pacId))) || 0
  } catch {
    return 0
  }
}

function incrementPopupCount(pacId) {
  if (!pacId) return
  try {
    localStorage.setItem(popupCountKey(pacId), String(getPopupCount(pacId) + 1))
  } catch {
    // Stockage indisponible — la relance s'affiche simplement sans être comptée.
  }
}

// Tire une réplique au hasard en évitant de répéter celle d'avant.
function pickLine(lines, lastIndexRef) {
  let index = Math.floor(Math.random() * lines.length)
  if (lines.length > 1 && index === lastIndexRef.current) {
    index = (index + 1) % lines.length
  }
  lastIndexRef.current = index
  return lines[index]
}

// Repli propre si /charlie/avatar.png n'est pas (encore) déployé dans public/ —
// évite l'icône d'image cassée du navigateur tant que l'illustration finale
// n'a pas été fournie.
function CharlieAvatar({ className }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className={`${className} bg-accent flex items-center justify-center text-paper font-semibold`}>
        C
      </div>
    )
  }
  return (
    <img
      src="/charlie/avatar.png"
      alt="Charlie"
      className={`${className} object-cover`}
      onError={() => setBroken(true)}
    />
  )
}

// Le buste n'est que décoratif (écran d'accueil du chat) — s'il manque, on
// masque simplement l'image plutôt que d'afficher une icône cassée.
function CharlieBust() {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <div className="flex justify-center pb-1">
      <img src="/charlie/bust.png" alt="Charlie" className="w-32 h-auto" onError={() => setBroken(true)} />
    </div>
  )
}

// Charlie n'existe que sur la carte (Portail 2) — jamais pendant l'écriture des
// paliers, jamais dans le carnet de bord (cf. PAC_BDCI, chantier UX 20/07).
export default function CharlieWidget({ sessionId, currentPacId }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [bubble, setBubble] = useState(null)
  const scrollRef = useRef(null)
  const lastTransitionIndex = useRef(-1)
  const lastInactivityIndex = useRef(-1)
  const bubbleDismissTimer = useRef(null)

  function showBubble(lines, lastIndexRef) {
    if (getPopupCount(currentPacId) >= POPUP_CAP_PER_PAC) return
    incrementPopupCount(currentPacId)
    setBubble(pickLine(lines, lastIndexRef))
    clearTimeout(bubbleDismissTimer.current)
    bubbleDismissTimer.current = setTimeout(() => setBubble(null), 10000)
  }

  // Déclencheur "transition" : à l'arrivée sur la carte (montage du composant).
  // Couvre à la fois le retour après une situation/un feedback terminé et la
  // toute première arrivée depuis le briefing — les deux cas se valent ici.
  useEffect(() => {
    const t = setTimeout(() => showBubble(TRANSITION_LINES, lastTransitionIndex), 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Déclencheur "inactivité" : ~50s sans interaction sur l'écran carte, chat
  // fermé. Le minuteur se réarme à chaque interaction et se suspend tant que
  // le chat est ouvert (pas de relance qui s'affiche derrière la fenêtre déjà ouverte).
  useEffect(() => {
    let timer
    function resetTimer() {
      clearTimeout(timer)
      if (open) return
      timer = setTimeout(() => showBubble(INACTIVITY_LINES, lastInactivityIndex), INACTIVITY_DELAY_MS)
    }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => () => clearTimeout(bubbleDismissTimer.current), [])

  useEffect(() => {
    if (open && !loaded) {
      fetchCharlieHistory(sessionId)
        .then((data) => setHistory(data.history || []))
        .catch(() =>
          setHistory([{ role: 'assistant', content: 'Charlie a un peu de mal à répondre là — réessaie dans un instant.' }])
        )
        .finally(() => setLoaded(true))
    }
  }, [open, loaded, sessionId])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, open, sending])

  async function handleSend(e) {
    e.preventDefault()
    const message = input.trim()
    if (!message || sending) return
    setInput('')
    setHistory((h) => [...h, { role: 'user', content: message }])
    setSending(true)
    try {
      const data = await sendCharlieMessage({ sessionId, message })
      setHistory(data.history || [])
    } catch {
      setHistory((h) => [...h, { role: 'assistant', content: 'Un souci de mon côté — tu peux réessayer ?' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 font-body">
      {open && (
        <div className="w-80 h-96 bg-paper border border-rule rounded-xl shadow-xl flex flex-col mb-3 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-rule bg-paper-side shrink-0">
            <CharlieAvatar className="w-7 h-7 rounded-full" />
            <p className="text-[13.5px] font-semibold">Charlie · coordination générale</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {!loaded && <p className="text-[13px] text-ink-muted italic">Un instant...</p>}
            {loaded && history.length <= 1 && <CharlieBust />}
            {history.map((m, i) => (
              <div key={i} className={`text-[14px] leading-relaxed ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span
                  className={`inline-block max-w-[85%] px-3 py-2 rounded-[10px] text-left ${
                    m.role === 'user' ? 'bg-accent text-paper' : 'bg-accent-bg text-ink'
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {sending && <p className="text-[13px] text-ink-muted italic">Charlie répond...</p>}
          </div>

          <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-rule shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écris à Charlie..."
              className="flex-1 min-w-0 border border-rule rounded-lg px-3 py-2 text-[13.5px] bg-white/70 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-accent text-paper text-[13px] font-semibold px-3 py-2 rounded-lg disabled:opacity-40 shrink-0"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}

      {!open && bubble && (
        <div className="relative mb-3 max-w-[240px] ml-auto">
          <button
            onClick={() => {
              setBubble(null)
              setOpen(true)
            }}
            className="text-left w-full bg-paper border border-rule rounded-xl shadow-lg pl-4 pr-7 py-3 hover:border-accent transition-colors"
          >
            <span className="text-[13.5px] leading-relaxed text-ink">{bubble}</span>
          </button>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              setBubble(null)
            }}
            aria-label="Fermer"
            className="absolute top-1.5 right-2 text-ink-faint hover:text-ink-muted text-sm leading-none cursor-pointer"
          >
            ×
          </span>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o)
          setBubble(null)
        }}
        className="relative bg-accent rounded-full w-16 h-16 shadow-lg overflow-hidden hover:scale-105 transition-transform"
        title={open ? 'Fermer la discussion avec Charlie' : 'Parler à Charlie'}
      >
        {open ? (
          <span className="flex items-center justify-center w-full h-full text-paper text-2xl">×</span>
        ) : (
          <CharlieAvatar className="w-full h-full" />
        )}
      </button>
    </div>
  )
}
