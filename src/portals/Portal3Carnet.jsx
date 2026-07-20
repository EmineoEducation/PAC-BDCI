import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext.jsx'
import { isPacUnlocked } from '../lib/progression.js'
import { submitResponse } from '../lib/api.js'
import pacContent from '../data/pacContent.json'

const COLOR_TEXT = { green: 'text-pac1', blue: 'text-pac2', purple: 'text-pac3', orange: 'text-pac4' }
const COLOR_BG = { green: 'bg-pac1-bg', blue: 'bg-pac2-bg', purple: 'bg-pac3-bg', orange: 'bg-pac4-bg' }

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

  if (!pac) return <p className="p-8">PAC introuvable.</p>
  if (!unlocked) {
    return (
      <div className="p-8 text-center">
        <p className="text-neutral-600">Ce PAC n'est pas encore débloqué.</p>
        <button onClick={() => navigate('/plan')} className="mt-4 text-sm underline">Retour au plan</button>
      </div>
    )
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  async function handleChoice(label) {
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
    <div className="max-w-5xl mx-auto px-4 py-6 flex gap-0 border border-neutral-200 rounded-xl overflow-hidden bg-white min-h-[70vh]">
      <Sidebar session={session} currentPacId={pacId} activeSituationId={activeSituation?.id} />

      <div className="flex-1 p-6">
        <button onClick={() => navigate('/plan')} className="text-xs text-neutral-500 mb-3 hover:underline">
          ← Retour au plan
        </button>

        {!activeSituation ? (
          <PacFullyDone pac={pac} onBack={() => navigate('/plan')} />
        ) : (
          <>
            <p className={`text-xs mb-1 ${COLOR_TEXT[pac.color]}`}>
              {pac.id.toUpperCase()} — {pac.posture} · Situation {activeSituation.order}
            </p>
            <h2 className="text-lg font-medium mb-4">{activeSituation.title}</h2>

            <p className="text-sm leading-relaxed text-neutral-800 mb-4">{activeSituation.palierA.text}</p>

            {step === 'A' && (
              <ChoiceStep situation={activeSituation} onChoose={handleChoice} />
            )}

            {step !== 'A' && choiceLabel && (
              <div className="mb-4">
                <span className={`text-xs px-3 py-1 rounded-full ${COLOR_BG[pac.color]} ${COLOR_TEXT[pac.color]}`}>
                  Choix retenu : {choiceLabel}
                </span>
              </div>
            )}

            {activeSituation.palierB.context && step !== 'A' && (
              <p className="text-sm leading-relaxed text-neutral-800 mb-4">{activeSituation.palierB.context}</p>
            )}

            {(step === 'B' || step === 'done') && (
              <div className="mb-2">
                <p className="text-sm font-medium mb-2">Votre réponse</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={step === 'done'}
                  placeholder={activeSituation.palierB.livrable}
                  className="w-full min-h-[140px] border border-neutral-300 rounded-lg p-3 text-sm leading-relaxed disabled:bg-neutral-50"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-neutral-500">
                    {wordCount} mots · entre {activeSituation.palierB.wordRange[0]} et {activeSituation.palierB.wordRange[1]}
                  </span>
                  {step === 'B' && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || wordCount < 20}
                      className="bg-neutral-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
                    >
                      {submitting ? 'Envoi...' : 'Envoyer ma réponse'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'done' && lastResult && (
              <div className={`mt-5 rounded-lg p-4 ${COLOR_BG[pac.color]}`}>
                <p className="text-xs font-medium mb-1">Retour</p>
                <p className="text-sm leading-relaxed mb-3">{lastResult.entry.feedbackIntermediaire || lastResult.entry.feedbackFinal}</p>

                {activeSituation.order === 1 ? (
                  <button onClick={goToNextSituation} className="text-sm underline">
                    Continuer vers la situation 2 →
                  </button>
                ) : (
                  <button onClick={() => navigate('/plan')} className="text-sm underline">
                    PAC terminé — retour au plan →
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ChoiceStep({ situation, onChoose }) {
  if (situation.palierA.microChoiceOptions) {
    return (
      <div className="flex flex-col gap-2 mb-4">
        {situation.palierA.microChoiceOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => onChoose(opt)}
            className="text-left text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:border-neutral-500"
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-600 italic mb-2">{situation.palierA.microChoiceDescription}</p>
      <button
        onClick={() => onChoose(situation.palierA.microChoiceDescription)}
        className="text-sm bg-neutral-900 text-white px-4 py-2 rounded-lg"
      >
        Continuer
      </button>
    </div>
  )
}

function PacFullyDone({ pac, onBack }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm text-neutral-600 mb-3">Ce PAC est terminé — bravo.</p>
      <button onClick={onBack} className="text-sm underline">Retour au plan</button>
    </div>
  )
}

function Sidebar({ session, currentPacId, activeSituationId }) {
  const completedPacs = session?.progression?.completedPacs || []
  const entries = session?.entries || []

  return (
    <div className="w-56 shrink-0 bg-neutral-950 text-neutral-300 p-4 space-y-5">
      <p className="text-[11px] text-neutral-500">Mon carnet de bord</p>
      {pacContent.pacs.map((pac) => {
        const unlocked = isPacUnlocked(pac.id, completedPacs)
        return (
          <div key={pac.id} className={unlocked ? '' : 'opacity-40'}>
            <p className={`text-[11px] font-medium mb-1 ${COLOR_TEXT[pac.color]}`}>
              {pac.id.toUpperCase()} · {pac.posture}
            </p>
            {pac.situations.map((sit) => {
              const done = entries.some((e) => e.situationId === sit.id)
              const isActive = sit.id === activeSituationId && pac.id === currentPacId
              return (
                <div key={sit.id} className="pl-2 py-1 text-xs flex items-center gap-2">
                  <span>{done ? '✓' : isActive ? '✎' : unlocked ? '·' : '🔒'}</span>
                  <span className={isActive ? 'text-white font-medium' : ''}>{sit.title}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
