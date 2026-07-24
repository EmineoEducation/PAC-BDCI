import { useNavigate } from 'react-router-dom'
import { useSession } from '../lib/SessionContext.jsx'
import { isPacUnlocked, nextPacToUnlock } from '../lib/progression.js'
import pacContent from '../data/pacContent.json'
import CharlieWidget from '../components/CharlieWidget.jsx'

// Coordonnées approximatives (en % de l'image) — à recaler précisément une fois
// le plan intégré en conditions réelles, par simple ajustement visuel des valeurs
// top/left/width/height ci-dessous. Basées sur PNG_Festival_Hemispheres.png (20/07).
const ZONE_POSITIONS = {
  pac1: { top: '30%', left: '15%', width: '24%', height: '32%' }, // Village associatif — Léa
  pac2: { top: '27%', left: '55%', width: '22%', height: '27%' }, // Régie technique — Marc
  pac3: { top: '5%', left: '37%', width: '25%', height: '28%' },  // Grande scène — tension Léa/Marc
  pac4: { top: '55%', left: '62%', width: '20%', height: '25%' }, // Espace presse — Sami
}

const COLOR_CLASSES = {
  green: 'border-pac1 bg-pac1-bg/70 text-pac1',
  blue: 'border-pac2 bg-pac2-bg/70 text-pac2',
  purple: 'border-pac3 bg-pac3-bg/70 text-pac3',
  orange: 'border-pac4 bg-pac4-bg/70 text-pac4',
}

export default function Portal2Map() {
  const navigate = useNavigate()
  const { session } = useSession()
  const completedPacs = session?.progression?.completedPacs || []
  // PAC en cours (ou prochain à débloquer) — sert à scoper le plafond des
  // relances spontanées de Charlie à 3 par PAC (null une fois les 4 terminés).
  const currentPacId = nextPacToUnlock(completedPacs)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-neutral-500">Festival Hémisphères — coordination</p>
          <p className="text-sm font-medium">
            {session?.prenom} {session?.nom} · {session?.formation} · campus {session?.campus}
          </p>
        </div>
        <span className="text-xs bg-neutral-900 text-white px-3 py-1 rounded-full">
          {completedPacs.length} / 4 PAC complétés
        </span>
      </div>

      <div className="relative w-full rounded-xl overflow-hidden border border-neutral-200" style={{ aspectRatio: '3 / 2' }}>
        <img src="/festival-map.png" alt="Plan du festival Hémisphères" className="w-full h-full object-cover" />

        {pacContent.pacs.map((pac) => {
          const unlocked = isPacUnlocked(pac.id, completedPacs)
          const pos = ZONE_POSITIONS[pac.id]
          return (
            <button
              key={pac.id}
              disabled={!unlocked}
              onClick={() => navigate(`/carnet/${pac.id}`)}
              className={`absolute rounded-lg border-2 flex flex-col items-center justify-center text-center px-2 transition
                ${unlocked ? COLOR_CLASSES[pac.color] + ' cursor-pointer hover:scale-[1.02]' : 'border-neutral-300 bg-white/50 text-neutral-400 opacity-60 cursor-not-allowed'}`}
              style={pos}
              title={unlocked ? `Ouvrir ${pac.mapZone}` : 'Verrouillé — à débloquer'}
            >
              <span className="text-xs font-medium">{pac.mapZone}</span>
              <span className="text-[11px]">{pac.id.toUpperCase()} · {pac.character}</span>
              {!unlocked && <span className="text-[10px] mt-1">🔒 Verrouillé</span>}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-neutral-500 mt-3">
        Les zones grisées se débloquent une fois le PAC précédent terminé.
      </p>

      {session?.id && <CharlieWidget sessionId={session.id} currentPacId={currentPacId} />}
    </div>
  )
}
