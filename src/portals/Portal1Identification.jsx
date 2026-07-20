import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../lib/api.js'
import { useSession } from '../lib/SessionContext.jsx'

const FORMATIONS = ['MSMC', 'CDRH', 'MMD', 'MDO']

export default function Portal1Identification() {
  const navigate = useNavigate()
  const { setSession } = useSession()
  const [form, setForm] = useState({ nom: '', prenom: '', formation: '', campus: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.nom || !form.prenom || !form.formation || !form.campus) {
      setError('Merci de remplir tous les champs.')
      return
    }
    setSubmitting(true)
    try {
      const session = await createSession(form)
      setSession(session)
      // Le portrait Barnum n'est déclenché qu'une seule fois, à la toute première session.
      navigate(session.barnumProfile ? '/plan' : '/barnum')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-xl border border-neutral-200 shadow-sm p-8"
      >
        <p className="text-xs tracking-wide text-neutral-500 mb-1">Festival Hémisphères — 3ᵉ édition</p>
        <h1 className="text-xl font-medium text-neutral-900 mb-6">Bienvenue, coordinateur·rice</h1>

        <div className="space-y-4">
          <Field label="Nom" value={form.nom} onChange={(v) => update('nom', v)} />
          <Field label="Prénom" value={form.prenom} onChange={(v) => update('prenom', v)} />

          <div>
            <label className="block text-sm text-neutral-700 mb-1">Formation</label>
            <select
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              value={form.formation}
              onChange={(e) => update('formation', e.target.value)}
            >
              <option value="">Sélectionner...</option>
              {FORMATIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <Field label="Campus" value={form.campus} onChange={(v) => update('campus', v)} placeholder="ex. LYO" />
        </div>

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Un instant...' : 'Entrer dans le festival'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm text-neutral-700 mb-1">{label}</label>
      <input
        type="text"
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
