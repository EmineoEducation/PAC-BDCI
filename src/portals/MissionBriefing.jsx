import { useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext.jsx'
import { markMissionSeen } from '../lib/api.js'

// Page de facilitation (23/07) — s'intercale entre le questionnaire Barnum
// (« qui tu crois être ») et la carte du festival (« ce que tu fais »).
// Rôle : mise en contexte didactique des enjeux du dispositif et du poste de
// volant·e, avant que l'étudiant·e soit lâché·e sur la carte sans repère.
// Ne se déclenche qu'une fois — cf. hasMissionSeen/markMissionSeen (src/lib/api.js)
// et le guard needsMission dans App.jsx.
export default function MissionBriefing() {
  const navigate = useNavigate()
  const { session } = useSession()

  function handleEnter() {
    markMissionSeen()
    navigate('/plan')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 font-body">
      <p className="text-xs tracking-wide text-ink-muted mb-1">Festival Hémisphères — briefing volant·e</p>
      <h1 className="font-display font-semibold text-2xl text-ink mb-1">Avant de prendre ton poste</h1>
      <p className="text-sm text-ink-muted mb-6">
        {session?.prenom ? `${session.prenom}, encore` : 'Encore'} deux minutes avant de rejoindre le site.
      </p>

      <p className="text-[15px] leading-relaxed text-ink mb-8">
        Ce n'est ni un examen, ni un test de personnalité. Ce que tu vas vivre ici va compter — mais
        pas forcément de la façon dont tu l'imagines.
      </p>

      <div className="space-y-4 mb-10">
        <BriefingCard icon={<IconEye />} title="Ce qui est observé">
          Pas la qualité de ce que tu écris, ni si ta réponse est « la bonne » — il n'y en a pas. Ce
          qui compte, c'est comment tu réagis quand un cadre est incomplet, qu'une info manque, ou
          qu'un·e collègue est sous pression. Ce sont exactement les situations que tu retrouveras en
          entreprise dans quelques semaines.
        </BriefingCard>

        <BriefingCard icon={<IconPin />} title="Ton poste : volant·e">
          Sur le site du festival, tu n'as pas d'affectation fixe : tu es volant·e, mobilisé·e là où
          besoin. Léa (direction), Marc (production) et Sami (communication) géreront chacun un
          moment du festival — à toi de t'adapter à chacun, à son rythme et à ses urgences.
        </BriefingCard>

        <BriefingCard icon={<IconChat />} title="Charlie, sur le site">
          Charlie coordonne l'équipe des volant·es. Tu le croiseras régulièrement depuis le plan du
          site — iel peut t'orienter, mais ne te dira jamais quoi répondre : à toi de jouer, comme sur
          le terrain.
        </BriefingCard>
      </div>

      <div className="flex items-center justify-between border-t border-rule pt-6">
        <p className="text-sm text-ink-muted italic">Le site t'attend.</p>
        <button
          onClick={handleEnter}
          className="bg-accent text-paper rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Rejoindre le site →
        </button>
      </div>
    </div>
  )
}

function BriefingCard({ icon, title, children }) {
  return (
    <div className="flex gap-4 border border-rule rounded-xl p-5 bg-white/50">
      <div className="shrink-0 w-9 h-9 rounded-full bg-accent-bg flex items-center justify-center text-accent">
        {icon}
      </div>
      <div>
        <p className="text-[15px] font-semibold text-ink mb-1">{title}</p>
        <p className="text-[14px] leading-relaxed text-ink-muted">{children}</p>
      </div>
    </div>
  )
}

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.3" r="2.4" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}
