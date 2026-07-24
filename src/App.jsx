import { Routes, Route, Navigate } from 'react-router-dom'
import Portal1Identification from './portals/Portal1Identification.jsx'
import BarnumQuestionnaire from './portals/BarnumQuestionnaire.jsx'
import MissionBriefing from './portals/MissionBriefing.jsx'
import Portal2Map from './portals/Portal2Map.jsx'
import Portal3Carnet from './portals/Portal3Carnet.jsx'
import { useSession } from './lib/SessionContext.jsx'
import { hasMissionSeen } from './lib/api.js'

function RequireSession({ children, needsBarnum, needsMission }) {
  const { session, loading } = useSession()

  if (loading) return <div className="p-8 text-sm text-neutral-500">Chargement...</div>
  if (!session) return <Navigate to="/" replace />
  if (needsBarnum && !session.barnumProfile) return <Navigate to="/barnum" replace />
  // Page de facilitation entre le questionnaire Barnum et la carte (23/07) :
  // se déclenche une seule fois, avant la toute première arrivée sur le plan.
  if (needsMission && !hasMissionSeen()) return <Navigate to="/mission" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Portal1Identification />} />
      <Route
        path="/barnum"
        element={
          <RequireSession>
            <BarnumQuestionnaire />
          </RequireSession>
        }
      />
      <Route
        path="/mission"
        element={
          <RequireSession needsBarnum>
            <MissionBriefing />
          </RequireSession>
        }
      />
      <Route
        path="/plan"
        element={
          <RequireSession needsBarnum needsMission>
            <Portal2Map />
          </RequireSession>
        }
      />
      <Route
        path="/carnet/:pacId"
        element={
          <RequireSession needsBarnum needsMission>
            <Portal3Carnet />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
