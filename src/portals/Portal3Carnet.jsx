import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext.jsx'
import { isPacUnlocked } from '../lib/progression.js'
import { submitResponse } from '../lib/api.js'
import pacContent from '../data/pacContent.json'

const COLOR_TEXT = { green: 'text-pac1', blue: 'text-pac2', purple: 'text-pac3', orange: 'text-pac4' }
const COLOR_BG = { green: 'bg-pac1-bg', blue: 'bg-pac2-bg', purple: 'bg-pac3-bg', orange: 'bg-pac4-bg' }
const COLOR_BORDER = { green: 'border-pac1', blue: 'border-pac2', purple: 'border-pac3', orange: 'border-pac4' }
const COLOR_DOT = { green: 'bg-pac1', blue: 'bg-pac2', purple: 'bg-pac3', orange: 'bg-pac4' }

const BANNER_BY_PAC = {
  pac1: '/banners/pac1_village_associatif.png',
  pac2: '/banners/pac2_regie_technique.png',
  pac3: '/banners/pac3_grande_scene.png',
  pac4: '/banners/pac4_espace_presse.png',
}

// Garde-fou anti-soumission vide (permet d'activer le bouton) — pas une contrainte de qualité rédactionnelle.
const MIN_WORDS_TO_ENABLE_SUBMIT = 20

// Repère de temps purement indicatif — aucun verrou, juste un rappel du gabarit visé (3h30/PAC).
// Démarre au premier chargement de ce PAC, persiste en localStorage pour survivre à un rafraîchissement.
function usePacElapsed(pacId) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const storageKey = `pacbdci_pac_start_${pacId}`
    let start = Number(localStorage.getItem(storageKey))
    if (!start) {
      start = Date.now()
      localStorage.setItem(storageKey, String(start))
    }
    const tick = () => setElapsedMs(Date.now() - start)
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [pacId])

  return elapsedMs
}

function formatElapsed(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return `${m} min`
}

export default function Portal3Carnet() {
  const { pacId } = useParams()
  const navigate = useNavigate()
  const { session, setSession } = useSession()

  const pac = pacContent.pacs.find((p) => p.id === pacId)
  const completedPacs = session?.progression?.completedPacs || []
  const unlocked = isPacUnlocked(pacId, completedPacs)

  const pacEntries = useMemo(
    () => (session?.entries || []).filter((e) => e.pacId === pacId),
    [session, pacId]
  )

  // Situation active = la première non encore répondue.
  const activeSituation = pac?.situations.find(
    (s) => !pacEntries.some((e) => e.situationId === s.id)
  )

  const [step, setStep] = useState('A') // 'A' | 'B' | 'done'
  const [choiceLabel, setChoiceLabel] = useState(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const elapsed = usePacElapsed(pacId)

  if (!pac) return <p className="p-8 font-[var(--font-body)]">PAC introuvable.</p>
  if (!unlocked) {
    return (
      <div className="p-8 text-center font-[var(--font-body)]">
        <p className="text-ink-muted">Ce PAC n'est pas encore débloqué.</p>
        <button onClick={() => navigate('/plan')} className="mt-4 text-sm underline">Retour au plan</button>
      </div>
    )
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const [minWords, maxWords] = activeSituation ? activeSituation.palierB.wordRange : [0, 0]
  const inRange = wordCount >= minWords && wordCount <= maxWords
  const bridge = activeSituation?.palierA.microChoiceBridges?.[choiceLabel]

  function handleChoice(label) {
    setChoiceLabel(label)
    setStep('B')
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await submitResponse({
        sessionId: session.id,
        pacId,
        situationId: activeSituation.id,
        choiceLabel,
        studentText: text,
      })
      setLastResult(result)
      setStep('done')

      if (result.pacCompleted) {
        setSession({
          ...session,
          entries: [...session.entries, result.entry],
          progression: {
            ...session.progression,
            completedPacs: [...session.progression.completedPacs, pacId],
          },
        })
      } else {
        setSession({ ...session, entries: [...session.entries, result.entry] })
      }
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function goToNextSituation() {
    setStep('A')
    setChoiceLabel(null)
    setText('')
    setLastResult(null)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 font-[var(--font-body)]">
      <div className="flex gap-0 border border-rule rounded-xl overflow-hidden bg-paper min-h-[80vh]">
        <Sidebar session={session} currentPacId={pacId} activeSituationId={activeSituation?.id} />

        <div className="flex-1 min-w-0">
          <img
            src={BANNER_BY_PAC[pac.id]}
            alt=""
            className="w-full h-[150px] object-cover border-b border-rule"
          />

          <div className="px-8 py-7">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => navigate('/plan')} className="text-xs text-ink-muted hover:underline">
              ← Retour au plan
            </button>
            <span className="text-[12px] text-ink-muted">
              ⏱ {formatElapsed(elapsed)} sur ce PAC · repère indicatif : 3h30
            </span>
          </div>

            <div className="mb-6">
              <p className="font-[var(--font-script)] text-[32px] leading-none text-accent">Mon carnet de bord</p>
              <p className="text-[11px] tracking-[0.08em] uppercase text-ink-muted mt-1.5">Ton bilan de compétences</p>
            </div>

            {!activeSituation ? (
              <PacFullyDone onBack={() => navigate('/plan')} />
            ) : (
              <>
                <div className="flex items-center gap-2 text-[13px] text-ink-muted pb-3 mb-5 border-b border-rule">
                  <span className={`w-[7px] h-[7px] rounded-full ${COLOR_DOT[pac.color]}`} />
                  <span>{pac.id.toUpperCase()} · {pac.posture}</span>
                  <span className="text-ink-faint">›</span>
                  <span>{activeSituation.title}</span>
                </div>

                <h1 className="font-[var(--font-display)] font-semibold text-[28px] leading-tight mb-6 max-w-[16ch]">
                  {activeSituation.title}
                </h1>

                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mb-2">
                  Mise en situation
                </p>
                <p className="text-[16px] leading-relaxed max-w-[68ch] mb-2">
                  {activeSituation.palierA.text}
                </p>

                {step === 'A' && (
                  <ChoiceStep situation={activeSituation} onChoose={handleChoice} />
                )}

                {step !== 'A' && choiceLabel && (
                  <>
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mt-7 mb-2">
                      Le choix que tu as retenu
                    </p>
                    <span
                      className={`inline-flex items-center gap-2 ${COLOR_BG[pac.color]} ${COLOR_TEXT[pac.color]} font-semibold text-[14.5px] px-4 py-2 rounded-full border border-black/5`}
                    >
                      {choiceLabel}
                    </span>
                    {bridge && (
                      <p className="text-[16px] leading-relaxed italic mt-4 max-w-[68ch] text-ink/90">
                        {bridge}
                      </p>
                    )}
                  </>
                )}

                {activeSituation.palierB.context && step !== 'A' && (
                  <p className="text-[16px] leading-relaxed max-w-[68ch] mt-4">
                    {activeSituation.palierB.context}
                  </p>
                )}

                {(step === 'B' || step === 'done') && (
                  <div className="mt-7">
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mb-2">
                      Ta réponse
                    </p>
                    <p className="text-[15.5px] leading-relaxed max-w-[68ch] mb-3">
                      {activeSituation.palierB.livrable}
                    </p>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      disabled={step === 'done'}
                      placeholder="Écris ta réponse ici…"
                      className="w-full min-h-[170px] border border-rule rounded-[10px] p-4 text-[15.5px] leading-relaxed bg-white/60 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent disabled:bg-paper-side disabled:text-ink-muted"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <span className={`text-[13px] ${inRange ? 'text-accent font-semibold' : 'text-ink-muted'}`}>
                        {wordCount} mots · entre {minWords} et {maxWords}
                      </span>
                      {step === 'B' && (
                        <button
                          onClick={handleSubmit}
                          disabled={submitting || wordCount < MIN_WORDS_TO_ENABLE_SUBMIT}
                          className="bg-accent text-[var(--color-paper)] text-[14.5px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          {submitting ? 'Envoi...' : 'Envoyer ma réponse'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {step === 'done' && lastResult && (
                  <div className="flex gap-4 items-start bg-accent-bg border border-accent-bg-strong rounded-[10px] p-5 mt-7">
                    <FeedbackIcon />
                    <div>
                      <p className="text-[15px] leading-relaxed">
                        {lastResult.entry.feedbackIntermediaire || lastResult.entry.feedbackFinal}
                      </p>
                      <div className="mt-4">
                        {activeSituation.order === 1 ? (
                          <button onClick={goToNextSituation} className="text-sm font-semibold text-accent underline">
                            Continuer vers la situation 2 →
                          </button>
                        ) : (
                          <button onClick={() => navigate('/plan')} className="text-sm font-semibold text-accent underline">
                            PAC terminé — retour au plan →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <NotesPersonnelles />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChoiceStep({ situation, onChoose }) {
  const options = situation.palierA.microChoiceOptions
  if (options && options.length) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChoose(opt)}
            className="text-left text-[15px] border border-rule rounded-[10px] px-4 py-2.5 hover:border-accent hover:bg-accent-bg/40 transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }
  // Filet de sécurité si un contenu futur revient au format description libre sans options.
  return (
    <div className="mt-4">
      <p className="text-[15px] text-ink-muted italic mb-3">{situation.palierA.microChoiceDescription}</p>
      <button
        onClick={() => onChoose(situation.palierA.microChoiceDescription)}
        className="text-[14.5px] bg-accent text-[var(--color-paper)] px-4 py-2 rounded-[10px]"
      >
        Continuer
      </button>
    </div>
  )
}

function PacFullyDone({ onBack }) {
  return (
    <div className="text-center py-16">
      <p className="text-[15px] text-ink-muted mb-3">Ce PAC est terminé — bravo.</p>
      <button onClick={onBack} className="text-sm underline">Retour au plan</button>
    </div>
  )
}

function NotesPersonnelles() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <div className="mt-10 pt-5 border-t border-rule">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[13.5px] font-semibold text-ink-muted tracking-wide"
      >
        Notes personnelles (privé) {open ? '▲' : '▼'}
      </button>
      {open && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ce que tu retiens, tes idées, tes prochains pas…"
          className="w-full min-h-[90px] mt-3 border border-dashed border-rule rounded-[10px] p-3 text-[14.5px] leading-relaxed bg-transparent focus:outline-none focus:ring-2 focus:ring-pac1/20"
        />
      )}
    </div>
  )
}

function FeedbackIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-accent shrink-0 mt-0.5 opacity-80">
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M4 20h16" />
      <path d="M10 20v-6h4v6" />
      <path d="M9 12h.01M12 9h.01M15 12h.01" />
    </svg>
  )
}

function StatusIcon({ status }) {
  if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 mt-0.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    )
  }
  if (status === 'active') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 mt-0.5">
        <path d="M16.5 3.5l4 4L7 21l-4.5 1L4 17.5 16.5 3.5z" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 mt-0.5">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function Sidebar({ session, currentPacId, activeSituationId }) {
  const completedPacs = session?.progression?.completedPacs || []
  const entries = session?.entries || []

  return (
    <div className="w-[280px] shrink-0 bg-paper-side border-r border-rule p-6">
      <div className="mb-8">
        <p className="font-[var(--font-display)] font-bold uppercase text-[20px] leading-tight tracking-wide">
          Festival<br />Hémisphères
        </p>
        <p className="text-[10.5px] tracking-[0.12em] uppercase text-ink-muted mt-1.5">
          Friche industrielle réhabilitée
        </p>
        <p className="italic font-semibold text-[12px] tracking-wide uppercase text-pac4 mt-1">
          3ᵉ édition
        </p>
      </div>

      <nav className="space-y-6">
        {pacContent.pacs.map((pac) => {
          const unlocked = isPacUnlocked(pac.id, completedPacs)
          return (
            <div key={pac.id}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-2 h-2 rounded-full ${COLOR_DOT[pac.color]}`} />
                <span className="text-[13px] font-semibold">{pac.id.toUpperCase()} · {pac.posture}</span>
              </div>
              <ul className={`border-l ${COLOR_BORDER[pac.color]}/30 pl-3.5 ml-0.5 space-y-1`}>
                {pac.situations.map((sit) => {
                  const done = entries.some((e) => e.situationId === sit.id)
                  const isActive = sit.id === activeSituationId && pac.id === currentPacId
                  const status = done ? 'done' : isActive ? 'active' : 'locked'
                  return (
                    <li
                      key={sit.id}
                      className={`flex items-start gap-2 py-1 text-[13.5px] leading-snug ${
                        isActive ? 'text-ink font-semibold' : done ? 'text-ink-muted' : 'text-ink-faint'
                      }`}
                    >
                      <StatusIcon status={unlocked ? status : 'locked'} />
                      {sit.title}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
