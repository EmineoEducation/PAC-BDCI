import { Routes, Route, Navigate } from 'react-router-dom'
import Portal1Identification from './portals/Portal1Identification.jsx'
import BarnumQuestionnaire from './portals/BarnumQuestionnaire.jsx'
import Portal2Map from './portals/Portal2Map.jsx'
import Portal3Carnet from './portals/Portal3Carnet.jsx'
import { useSession } from './lib/SessionContext.jsx'

function RequireSession({ children, needsBarnum }) {
  const { session, loading } = useSession()

  if (loading) return <div className="p-8 text-sm text-neutral-500">Chargement...</div>
  if (!session) return <Navigate to="/" replace />
  if (needsBarnum && !session.barnumProfile) return <Navigate to="/barnum" replace />
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
        path="/plan"
        element={
          <RequireSession needsBarnum>
            <Portal2Map />
          </RequireSession>
        }
      />
      <Route
        path="/carnet/:pacId"
        element={
          <RequireSession needsBarnum>
            <Portal3Carnet />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
