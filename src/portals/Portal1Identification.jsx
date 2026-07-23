import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../lib/api.js'
import { useSession } from '../lib/SessionContext.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Portal1Identification() {
  const navigate = useNavigate()
  const { session, setSession, loading } = useSession()
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', formation: '', campus: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Une session valide existe déjà (ex. retour le lendemain — le parcours se
  // déroule sur 2 jours, cf. dayMapping) : on reprend là où l'étudiant·e s'est
  // arrêté·e au lieu de le laisser recréer une session vierge via ce
  // formulaire, ce qui écraserait le portrait Barnum et les PAC déjà validés.
  useEffect(() => {
    if (!loading && session) {
      navigate(session.barnumProfile ? '/plan' : '/barnum', { replace: true })
    }
  }, [loading, session, navigate])

  if (loading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-paper font-body">
        <p className="text-sm text-ink-muted">Un instant...</p>
      </div>
    )
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.nom || !form.prenom || !form.email || !form.formation || !form.campus) {
      setError('Merci de remplir tous les champs.')
      return
    }
    if (!EMAIL_RE.test(form.email)) {
      setError('Cette adresse mail ne semble pas valide.')
      return
    }
    setSubmitting(true)
    try {
      const newSession = await createSession(form)
      setSession(newSession)
      // Le portrait Barnum n'est déclenché qu'une seule fois, à la toute première session.
      navigate(newSession.barnumProfile ? '/plan' : '/barnum')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper font-body">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white/70 rounded-xl border border-rule shadow-sm p-8"
      >
        <p className="text-xs tracking-wide text-ink-muted mb-1">Festival Hémisphères — 3ᵉ édition</p>
        <h1 className="font-display font-semibold text-xl text-ink mb-6">Bienvenue, coordinateur·rice</h1>

        <div className="space-y-4">
          <Field label="Nom" value={form.nom} onChange={(v) => update('nom', v)} />
          <Field label="Prénom" value={form.prenom} onChange={(v) => update('prenom', v)} />
          <Field label="Mail" type="email" value={form.email} onChange={(v) => update('email', v)} placeholder="prenom.nom@emineo.fr" />
          <Field label="Formation" value={form.formation} onChange={(v) => update('formation', v)} placeholder="ex. MSMC" />
          <Field label="Campus" value={form.campus} onChange={(v) => update('campus', v)} placeholder="ex. Bordeaux" />
        </div>

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full bg-accent text-paper rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? 'Un instant...' : 'Entrer dans le festival'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm text-ink-muted mb-1">{label}</label>
      <input
        type={type}
        className="w-full border border-rule rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-pac1/25 focus:border-accent"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
