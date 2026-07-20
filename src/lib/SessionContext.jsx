import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getStoredSessionId, fetchSession } from './api.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const id = getStoredSessionId()
    if (!id) {
      setSession(null)
      setLoading(false)
      return
    }
    try {
      const s = await fetchSession(id)
      setSession(s)
    } catch (err) {
      console.warn('Session introuvable ou expirée, retour au portail 1.', err)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <SessionContext.Provider value={{ session, setSession, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession doit être utilisé sous SessionProvider')
  return ctx
}
