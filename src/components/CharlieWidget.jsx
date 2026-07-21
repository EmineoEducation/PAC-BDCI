import { useEffect, useRef, useState } from 'react'
import { fetchCharlieHistory, sendCharlieMessage } from '../lib/api.js'

// Charlie n'existe que sur la carte (Portail 2) — jamais pendant l'écriture des
// paliers, jamais dans le carnet de bord (cf. PAC_BDCI, chantier UX 20/07).
export default function CharlieWidget({ sessionId }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

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
    <div className="fixed bottom-5 right-5 z-50 font-[var(--font-body)]">
      {open && (
        <div className="w-80 h-96 bg-paper border border-rule rounded-xl shadow-xl flex flex-col mb-3 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-rule bg-paper-side shrink-0">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <p className="text-[13.5px] font-semibold">Charlie · coordination générale</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {!loaded && <p className="text-[13px] text-ink-muted italic">Un instant...</p>}
            {history.map((m, i) => (
              <div key={i} className={`text-[14px] leading-relaxed ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span
                  className={`inline-block max-w-[85%] px-3 py-2 rounded-[10px] text-left ${
                    m.role === 'user' ? 'bg-accent text-[var(--color-paper)]' : 'bg-accent-bg text-ink'
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
              className="bg-accent text-[var(--color-paper)] text-[13px] font-semibold px-3 py-2 rounded-lg disabled:opacity-40 shrink-0"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-accent text-[var(--color-paper)] rounded-full w-14 h-14 shadow-lg flex items-center justify-center text-2xl hover:opacity-90 transition-opacity"
        title={open ? 'Fermer la discussion avec Charlie' : 'Parler à Charlie'}
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}
