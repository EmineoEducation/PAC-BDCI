import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BARNUM_QUESTIONS, DIMENSIONS_ORDER, NEUTRAL_STEP_META, LIKERT_SCALE, LIKERT_ENDPOINT_LABELS } from '../data/barnumQuestions.js'
import { submitBarnum } from '../lib/api.js'
import { useSession } from '../lib/SessionContext.jsx'

export default function BarnumQuestionnaire() {
  const navigate = useNavigate()
  const { session, setSession } = useSession()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const dimension = DIMENSIONS_ORDER[step]
  // Intitulé NEUTRE, identique à chaque étape : ne révèle jamais l'axe mesuré.
  const meta = NEUTRAL_STEP_META
  const questions = useMemo(
    () => BARNUM_QUESTIONS.filter((q) => q.dimension === dimension),
    [dimension]
  )
  const likertQs = questions.filter((q) => q.type === 'likert')
  const projQ = questions.find((q) => q.type === 'projectif')

  const stepComplete = likertQs.every((q) => answers[q.id] !== undefined) && answers[projQ.id] !== undefined

  function setAnswer(id, value) {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

  async function handleNext() {
    if (step < DIMENSIONS_ORDER.length - 1) {
      setStep((s) => s + 1)
      window.scrollTo(0, 0)
      return
    }
    setSubmitting(true)
    try {
      const portrait = await submitBarnum({ sessionId: session.id, answers })
      setSession({ ...session, barnumProfile: portrait })
      // La carte n'est plus accédée directement : passage par la page de
      // facilitation (mise en contexte du poste de volant·e), cf. /mission.
      navigate('/mission')
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <p className="text-xs text-neutral-500 mb-1">Avant d'entrer dans le festival</p>
      <h1 className="text-xl font-medium mb-1">Portrait professionnel</h1>
      <p className="text-sm text-neutral-500 mb-6">
        5 minutes pour dégager une première image de votre manière d'être en contexte professionnel.
        Répondez spontanément — il n'y a pas de bonne ou de mauvaise réponse.
      </p>

      <div className="h-[3px] bg-neutral-200 rounded-full mb-8">
        <div
          className="h-full bg-pac3 rounded-full transition-all"
          style={{ width: `${((step + 1) / DIMENSIONS_ORDER.length) * 100}%` }}
        />
      </div>

      <p className="text-xs font-medium tracking-wide uppercase text-pac3 mb-1">Partie {step + 1} / 6</p>
      <h2 className="text-lg font-medium mb-1">{meta.title}</h2>
      <p className="text-sm text-neutral-500 mb-6">{meta.desc}</p>

      <div className="space-y-6">
        {likertQs.map((q) => (
          <div key={q.id}>
            <p className="text-sm text-neutral-900 mb-2">{q.text}</p>
            <div className="flex justify-between gap-1">
              {LIKERT_SCALE.map((val) => (
                <button
                  key={val}
                  onClick={() => setAnswer(q.id, val)}
                  className="flex-1 flex flex-col items-center gap-1 py-1"
                >
                  <span
                    className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs ${
                      answers[q.id] === val ? 'bg-pac3 border-pac3 text-white' : 'border-neutral-300 text-neutral-400'
                    }`}
                  >
                    {val}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-neutral-400 mt-1">
              <span>{LIKERT_ENDPOINT_LABELS.low}</span>
              <span>{LIKERT_ENDPOINT_LABELS.high}</span>
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-neutral-200">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-3 mt-4">Situation concrète</p>
          <p className="text-sm text-neutral-900 mb-3">{projQ.text}</p>
          <div className="grid grid-cols-2 gap-2">
            {['optionA', 'optionB'].map((key) => (
              <button
                key={key}
                onClick={() => setAnswer(projQ.id, key)}
                className={`text-left text-sm p-3 rounded-lg border leading-relaxed ${
                  answers[projQ.id] === key
                    ? 'border-pac3 bg-pac3-bg text-pac3 font-medium'
                    : 'border-neutral-300 text-neutral-700'
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wide mb-1 opacity-70">
                  {key === 'optionA' ? 'Option A' : 'Option B'}
                </span>
                {projQ[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-8">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`text-sm text-neutral-500 ${step === 0 ? 'invisible' : ''}`}
        >
          ← Retour
        </button>
        <span className="text-xs text-neutral-400">{step + 1} / 6</span>
        <button
          onClick={handleNext}
          disabled={!stepComplete || submitting}
          className="bg-pac3 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-40"
        >
          {submitting ? 'Génération...' : step === DIMENSIONS_ORDER.length - 1 ? 'Valider' : 'Suivant →'}
        </button>
      </div>
    </div>
  )
}
