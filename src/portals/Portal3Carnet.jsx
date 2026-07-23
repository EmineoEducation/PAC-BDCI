import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext.jsx'
import { isPacUnlocked } from '../lib/progression.js'
import { fetchSynthese2, submitResponse } from '../lib/api.js'
import pacContent from '../data/pacContent.json'

const COLOR_TEXT = { green: 'text-pac1', blue: 'text-pac2', purple: 'text-pac3', orange: 'text-pac4' }
const COLOR_BG = { green: 'bg-pac1-bg', blue: 'bg-pac2-bg', purple: 'bg-pac3-bg', orange: 'bg-pac4-bg' }
// Littéraux COMPLETS uniquement : Tailwind ne génère que les classes écrites
// telles quelles dans le source — une classe fabriquée à l'exécution
// (`${base}/30`) serait absente du CSS compilé.
const COLOR_BORDER_SOFT = { green: 'border-pac1/30', blue: 'border-pac2/30', purple: 'border-pac3/30', orange: 'border-pac4/30' }
const COLOR_DOT = { green: 'bg-pac1', blue: 'bg-pac2', purple: 'bg-pac3', orange: 'bg-pac4' }

const BANNER_BY_PAC = {
  pac1: '/banners/pac1_village_associatif.png',
  pac2: '/banners/pac2_regie_technique.png',
  pac3: '/banners/pac3_grande_scene.png',
  pac4: '/banners/pac4_espace_presse.png',
}

// Garde-fous anti-soumission vide (permettent d'activer le bouton) — pas des
// contraintes de qualité rédactionnelle, cf. uiGuidelines dans pacContent.json.
const MIN_WORDS_B = 20
const MIN_WORDS_REACTION1 = 20
const MIN_WORDS_REACTION2 = 8

const [REACTION1_MIN, REACTION1_MAX] = pacContent.meta.reaction1WordRange
const [REACTION2_MIN, REACTION2_MAX] = pacContent.meta.reaction2WordRange

// Repère de temps purement indicatif — aucun verrou, juste un rappel du gabarit visé (3h30/PAC).
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

function countWords(str) {
  const t = str.trim()
  return t ? t.split(/\s+/).length : 0
}

// Brouillon local (localStorage) — rien n'est persisté côté serveur avant
// l'envoi de la réaction 2 (cf. handleSubmitReaction2). Sans ça, une coupure
// réseau, une mise en veille ou une fermeture accidentelle de l'onglet en
// cours de situation fait perdre tout le travail déjà écrit.
function draftStorageKey(pacId, situationId) {
  return `pacbdci_draft_${pacId}_${situationId}`
}

function loadDraft(pacId, situationId) {
  try {
    const raw = localStorage.getItem(draftStorageKey(pacId, situationId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(pacId, situationId, draft) {
  try {
    localStorage.setItem(draftStorageKey(pacId, situationId), JSON.stringify(draft))
  } catch {
    // Stockage plein/indisponible (navigation privée, etc.) — on continue sans bloquer la saisie.
  }
}

function clearDraft(pacId, situationId) {
  try {
    localStorage.removeItem(draftStorageKey(pacId, situationId))
  } catch {
    // rien à faire
  }
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

  // La situation qu'on VIENT de terminer reste épinglée le temps que
  // l'étudiant·e lise son feedback. Sans cet épinglage, la mise à jour de
  // session dans handleSubmitReaction2 faisait basculer immédiatement
  // activeSituation vers la situation suivante (écran incohérent après la
  // situation 1) — et vers undefined après la situation 2, ce qui remplaçait
  // l'écran par « Ce PAC est terminé » sans JAMAIS afficher le feedback
  // final (signature de posture, écart Barnum, question réflexive).
  const [doneSituationId, setDoneSituationId] = useState(null)

  // Première situation non encore répondue (progression réelle).
  const firstUnanswered = pac?.situations.find(
    (s) => !pacEntries.some((e) => e.situationId === s.id)
  )

  // Situation affichée = celle épinglée (feedback en cours de lecture),
  // sinon la première non répondue. Si l'épingle ne correspond pas à ce PAC
  // (changement d'URL), elle est ignorée.
  const pinnedSituation = doneSituationId
    ? pac?.situations.find((s) => s.id === doneSituationId)
    : null
  const activeSituation = pinnedSituation || firstUnanswered

  // Étapes : 'A' (choix) → 'B' (écriture) → 'reaction1' (synthèse 1 affichée + écriture)
  // → 'reaction2' (synthèse 2 générée + écriture) → 'done' (feedback).
  const [step, setStep] = useState('A')
  const [choiceLabel, setChoiceLabel] = useState(null)
  const [palierBText, setPalierBText] = useState('')
  const [reaction1Text, setReaction1Text] = useState('')
  const [reaction2Text, setReaction2Text] = useState('')
  const [synthese2Text, setSynthese2Text] = useState(null)
  const [matchedTendencyId, setMatchedTendencyId] = useState(null)
  const [surpriseText, setSurpriseText] = useState(null)
  const [loadingSynthese2, setLoadingSynthese2] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const elapsed = usePacElapsed(pacId)

  // Restauration d'un éventuel brouillon local à l'arrivée sur une situation.
  // On réinitialise d'abord tous les champs : le composant n'est PAS remonté
  // par React Router quand seul :pacId change dans l'URL, donc sans cette
  // remise à zéro les textes de la situation précédente resteraient affichés.
  useEffect(() => {
    setDraftRestored(false)
    setStep('A')
    setChoiceLabel(null)
    setPalierBText('')
    setReaction1Text('')
    setReaction2Text('')
    setSynthese2Text(null)
    setMatchedTendencyId(null)
    setSurpriseText(null)
    setLastResult(null)
    if (!activeSituation) return
    const draft = loadDraft(pacId, activeSituation.id)
    if (draft) {
      setStep(draft.step || 'A')
      setChoiceLabel(draft.choiceLabel ?? null)
      setPalierBText(draft.palierBText || '')
      setReaction1Text(draft.reaction1Text || '')
      setReaction2Text(draft.reaction2Text || '')
      setSynthese2Text(draft.synthese2Text ?? null)
      setMatchedTendencyId(draft.matchedTendencyId ?? null)
      setSurpriseText(draft.surpriseText ?? null)
    }
    setDraftRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacId, activeSituation?.id])

  // Sauvegarde continue (anti-rebond) du brouillon en cours, tant qu'il n'a
  // pas encore été transmis au serveur via handleSubmitReaction2.
  useEffect(() => {
    if (!activeSituation || !draftRestored) return
    if (step === 'done') return // déjà persisté côté serveur, brouillon effacé
    if (step === 'A' && !palierBText && !reaction1Text && !reaction2Text) return
    const timeout = setTimeout(() => {
      saveDraft(pacId, activeSituation.id, {
        step, choiceLabel, palierBText, reaction1Text, reaction2Text,
        synthese2Text, matchedTendencyId, surpriseText,
      })
    }, 400)
    return () => clearTimeout(timeout)
  }, [
    pacId, activeSituation?.id, draftRestored, step, choiceLabel,
    palierBText, reaction1Text, reaction2Text, synthese2Text, matchedTendencyId, surpriseText,
  ])

  if (!pac) return <p className="p-8 font-body">PAC introuvable.</p>
  if (!unlocked) {
    return (
      <div className="p-8 text-center font-body">
        <p className="text-ink-muted">Ce PAC n'est pas encore débloqué.</p>
        <button onClick={() => navigate('/plan')} className="mt-4 text-sm underline">Retour au plan</button>
      </div>
    )
  }

  const wcB = countWords(palierBText)
  const [minWordsB, maxWordsB] = activeSituation ? activeSituation.palierB.wordRange : [0, 0]
  const inRangeB = wcB >= minWordsB && wcB <= maxWordsB

  const wcR1 = countWords(reaction1Text)
  const inRangeR1 = wcR1 >= REACTION1_MIN && wcR1 <= REACTION1_MAX

  const wcR2 = countWords(reaction2Text)
  const inRangeR2 = wcR2 >= REACTION2_MIN && wcR2 <= REACTION2_MAX

  const bridge = activeSituation?.palierA.microChoiceBridges?.[choiceLabel]

  function handleChoice(label) {
    setChoiceLabel(label)
    setStep('B')
  }

  function handleSubmitB() {
    // Synthèse 1 = palierC.text, déjà écrit dans le contenu — aucun appel réseau ici.
    setStep('reaction1')
  }

  async function handleSubmitReaction1() {
    setLoadingSynthese2(true)
    try {
      const data = await fetchSynthese2({
        sessionId: session.id,
        pacId,
        situationId: activeSituation.id,
        choiceLabel,
        palierBText,
        reaction1Text,
      })
      setSynthese2Text(data.synthese2Text)
      setMatchedTendencyId(data.matchedTendencyId)
      setSurpriseText(data.surpriseText)
      setStep('reaction2')
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setLoadingSynthese2(false)
    }
  }

  async function handleSubmitReaction2() {
    setSubmitting(true)
    try {
      const result = await submitResponse({
        sessionId: session.id,
        pacId,
        situationId: activeSituation.id,
        choiceLabel,
        palierBText,
        matchedTendencyId,
        surpriseText,
        reaction1Text,
        synthese2Text,
        reaction2Text,
      })
      setLastResult(result)
      setStep('done')
      // Épingle la situation qui vient d'être terminée : l'écran de feedback
      // doit rester sur ELLE, même une fois session mise à jour ci-dessous.
      setDoneSituationId(activeSituation.id)
      clearDraft(pacId, activeSituation.id)

      // Remplace l'entrée existante (même pacId+situationId) si elle existe,
      // sinon l'ajoute — miroir de l'idempotence serveur (évite les doublons
      // qui fausseraient le compteur et le bilan).
      const dedupedEntries = [
        ...session.entries.filter(
          (e) => !(e.pacId === pacId && e.situationId === activeSituation.id)
        ),
        result.entry,
      ]

      if (result.pacCompleted) {
        const dedupedPacs = session.progression.completedPacs.includes(pacId)
          ? session.progression.completedPacs
          : [...session.progression.completedPacs, pacId]
        setSession({
          ...session,
          entries: dedupedEntries,
          progression: {
            ...session.progression,
            completedPacs: dedupedPacs,
          },
        })
      } else {
        setSession({ ...session, entries: dedupedEntries })
      }
    } catch (err) {
      alert(`Erreur : ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function goToNextSituation() {
    // Libère l'épingle : activeSituation redevient la première situation non
    // répondue, et l'effet de restauration remet tous les champs à zéro
    // (ou restaure un éventuel brouillon de la situation suivante).
    // step et lastResult sont remis à zéro DANS LE MÊME BATCH pour éviter un
    // flash d'une frame (les effets ne s'exécutent qu'après le rendu).
    setDoneSituationId(null)
    setStep('A')
    setLastResult(null)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 font-body">
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
              <p className="font-script text-[32px] leading-none text-accent">Mon carnet de bord</p>
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

                <h1 className="font-display font-semibold text-[28px] leading-tight mb-6 max-w-[16ch]">
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

                {/* Palier B — note d'action */}
                {(step === 'B' || step === 'reaction1' || step === 'reaction2' || step === 'done') && (
                  <div className="mt-7">
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mb-2">
                      Ta réponse
                    </p>
                    <p className="text-[15.5px] leading-relaxed max-w-[68ch] mb-3">
                      {activeSituation.palierB.livrable}
                    </p>
                    <textarea
                      value={palierBText}
                      onChange={(e) => setPalierBText(e.target.value)}
                      disabled={step !== 'B'}
                      placeholder="Écris ta réponse ici…"
                      className="w-full min-h-[170px] border border-rule rounded-[10px] p-4 text-[15.5px] leading-relaxed bg-white/60 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent disabled:bg-paper-side disabled:text-ink-muted"
                    />
                    {step === 'B' && (
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-[13px] ${inRangeB ? 'text-accent font-semibold' : 'text-ink-muted'}`}>
                          {wcB} mots · entre {minWordsB} et {maxWordsB}
                        </span>
                        <button
                          onClick={handleSubmitB}
                          disabled={wcB < MIN_WORDS_B}
                          className="bg-accent text-paper text-[14.5px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          Envoyer ma réponse
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Synthèse 1 (palier C, affiché tel quel) + Réaction 1 */}
                {(step === 'reaction1' || step === 'reaction2' || step === 'done') && (
                  <div className="mt-8">
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-accent mb-2 pt-5 border-t border-dashed border-rule">
                      Synthèse 1
                    </p>
                    <p className="text-[15.5px] leading-relaxed max-w-[68ch] bg-[#fbf7ee] border-l-[3px] border-pac1 rounded-r-lg px-4 py-3">
                      {activeSituation.palierC.text}
                    </p>

                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mt-5 mb-2">
                      Ta réponse
                    </p>
                    <textarea
                      value={reaction1Text}
                      onChange={(e) => setReaction1Text(e.target.value)}
                      disabled={step !== 'reaction1'}
                      placeholder="Écris ta réponse ici…"
                      className="w-full min-h-[140px] border border-rule rounded-[10px] p-4 text-[15.5px] leading-relaxed bg-white/60 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent disabled:bg-paper-side disabled:text-ink-muted"
                    />
                    {step === 'reaction1' && (
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-[13px] ${inRangeR1 ? 'text-accent font-semibold' : 'text-ink-muted'}`}>
                          {wcR1} mots · entre {REACTION1_MIN} et {REACTION1_MAX}
                        </span>
                        <button
                          onClick={handleSubmitReaction1}
                          disabled={wcR1 < MIN_WORDS_REACTION1 || loadingSynthese2}
                          className="bg-accent text-paper text-[14.5px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          {loadingSynthese2 ? 'Envoi...' : 'Envoyer ma réponse'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Synthèse 2 (improvisée) + Réaction 2 */}
                {(step === 'reaction2' || step === 'done') && (
                  <div className="mt-8">
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-accent mb-2 pt-5 border-t border-dashed border-rule">
                      Synthèse 2
                    </p>
                    <p className="text-[15.5px] leading-relaxed max-w-[68ch] bg-[#fbf7ee] border-l-[3px] border-pac1 rounded-r-lg px-4 py-3">
                      {synthese2Text}
                    </p>

                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted mt-5 mb-2">
                      Ta réponse
                    </p>
                    <textarea
                      value={reaction2Text}
                      onChange={(e) => setReaction2Text(e.target.value)}
                      disabled={step !== 'reaction2'}
                      placeholder="Écris ta réponse ici…"
                      className="w-full min-h-[90px] border border-rule rounded-[10px] p-4 text-[15.5px] leading-relaxed bg-white/60 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent disabled:bg-paper-side disabled:text-ink-muted"
                    />
                    {step === 'reaction2' && (
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-[13px] ${inRangeR2 ? 'text-accent font-semibold' : 'text-ink-muted'}`}>
                          {wcR2} mots · entre {REACTION2_MIN} et {REACTION2_MAX}
                        </span>
                        <button
                          onClick={handleSubmitReaction2}
                          disabled={wcR2 < MIN_WORDS_REACTION2 || submitting}
                          className="bg-accent text-paper text-[14.5px] font-semibold px-5 py-2.5 rounded-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                        >
                          {submitting ? 'Envoi...' : 'Envoyer ma réponse'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Retour */}
                {step === 'done' && lastResult && (
                  <div className="flex gap-4 items-start bg-accent-bg border border-accent-bg-strong rounded-[10px] p-5 mt-8">
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

                <NotesPersonnelles pacId={pacId} />
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
  const description = situation.palierA.microChoiceDescription

  if (options && options.length) {
    return (
      <div className="mt-4">
        {description && (
          <p className="text-[15px] text-ink-muted italic mb-3">{description}</p>
        )}
        <div className="flex flex-col gap-2">
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
      </div>
    )
  }
  return (
    <div className="mt-4">
      <p className="text-[15px] text-ink-muted italic mb-3">{description}</p>
      <button
        onClick={() => onChoose(description)}
        className="text-[14.5px] bg-accent text-paper px-4 py-2 rounded-[10px]"
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

function NotesPersonnelles({ pacId }) {
  const [open, setOpen] = useState(false)
  // Persistance strictement LOCALE (localStorage, une note par PAC) : l'espace
  // s'annonce « privé », donc rien n'est jamais transmis au serveur — mais
  // sans persistance, tout texte était perdu au moindre changement de page.
  const storageKey = `pacbdci_notes_${pacId}`
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, note)
      } catch {
        // Stockage indisponible — la saisie continue, simplement sans persistance.
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [storageKey, note])

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
        <p className="font-display font-bold uppercase text-[20px] leading-tight tracking-wide">
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
              <ul className={`border-l ${COLOR_BORDER_SOFT[pac.color]} pl-3.5 ml-0.5 space-y-1`}>
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
