import { useEffect, useState } from 'react'
import { fetchBilan, sendBilan, confirmBilanSent } from '../lib/api.js'
import { buildBilanPdf } from '../lib/pdfBilan.js'

// Déclencheur du bilan de journée, sur la carte du festival.
// N'apparaît QUE si une journée est complète (jour 1 = PAC1+PAC2,
// jour 2 = PAC3+PAC4) — la règle est tranchée côté serveur, ce composant se
// contente d'afficher ce que /api/bilan lui rend.
//
// Le PDF est rendu ici, dans le navigateur, puis transmis en base64 à
// /api/send-bilan : même schéma que la chaîne générique des 18 PAC pour sa
// carte visuelle. Aucune dépendance de rendu côté serverless.
// Garde anti-doublon locale. L'envoi est AUTOMATIQUE (voir plus bas) : sans
// cette garde, un simple retour sur la carte entre la fin de l'envoi et
// l'enregistrement serveur re-déclencherait un second email.
function sendGuardKey(scopeKey) {
  return `pacbdci_bilan_sent_${scopeKey}`
}

export default function BilanCard({ sessionId }) {
  const [bilan, setBilan] = useState(null)
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchBilan(sessionId)
      .then((data) => {
        if (cancelled || !data) return
        setBilan(data)
        if (data.alreadySent) setStatus('sent')
      })
      .catch(() => {
        // Silencieux : l'absence de bilan ne doit pas polluer la carte.
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Envoi AUTOMATIQUE dès qu'une journée est complète. Le bilan est un livrable
  // institutionnel : le référent campus doit le recevoir même si l'étudiant·e
  // ferme l'onglet en sortant de salle. Un envoi sur clic laissait cette
  // possibilité de perte sèche, sans rattrapage possible côté RP.
  useEffect(() => {
    if (!bilan || status !== 'idle' || bilan.alreadySent) return
    let guarded = false
    try {
      guarded = localStorage.getItem(sendGuardKey(bilan.scope.key)) === '1'
    } catch {
      // Stockage indisponible : on retombe sur le seul garde-fou serveur.
    }
    if (guarded) {
      setStatus('sent')
      return
    }
    handleSend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilan])

  async function handleSend() {
    if (!bilan) return
    setStatus('sending')
    setError(null)
    // Posée AVANT la tentative, retirée en cas d'échec : mieux vaut un envoi
    // manquant et rattrapable qu'un doublon dans la boîte du référent.
    try {
      localStorage.setItem(sendGuardKey(bilan.scope.key), '1')
    } catch { /* stockage indisponible */ }

    // Le PDF est un « best-effort » : si son rendu échoue, le bilan part quand
    // même en corps d'email plutôt que de ne pas partir du tout. L'incident est
    // journalisé côté serveur via pdfAttempted.
    let attachments = []
    try {
      const { base64, filename } = await buildBilanPdf({
        text: bilan.text,
        axes: bilan.axes,
        withToile: bilan.withToile,
        scopeLabel: bilan.scope.label,
        student: bilan.student,
        productions: bilan.productions || [],
      })
      attachments = [{ filename, content: base64 }]
    } catch (err) {
      console.warn('Rendu PDF impossible :', err)
    }

    const bilanHTML = bilan.text
      .split(/\n\s*\n/)
      .map((p) => `<p style="margin:0 0 14px;font-size:14.5px;color:#134547;line-height:1.7;">${escapeHtml(p.trim())}</p>`)
      .join('')

    try {
      const studentName = [bilan.student.prenom, bilan.student.nom].filter(Boolean).join(' ')
      const res = await sendBilan({
        email: bilan.student.email,
        studentName,
        campus: bilan.student.campus,
        scopeLabel: bilan.scope.label,
        bilanHTML,
        attachments,
        pdfAttempted: true,
      })
      if (!res.sent) throw new Error("L'envoi n'a pas abouti.")
      await confirmBilanSent({ sessionId, scopeKey: bilan.scope.key })
      setStatus('sent')
    } catch (err) {
      try {
        localStorage.removeItem(sendGuardKey(bilan.scope.key))
      } catch { /* stockage indisponible */ }
      setError(err.message || 'Envoi impossible.')
      setStatus('error')
    }
  }

  if (!bilan) return null

  return (
    <div className="mt-6 border border-rule rounded-xl p-5 bg-white/60">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-md">
          <p className="text-[15px] font-semibold text-ink mb-1">{bilan.scope.label}</p>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {bilan.withToile
              ? 'Ta note de transmission est prête, accompagnée du graphique qui met en regard ce que tu décrivais au départ et ce que tu as fait en situation.'
              : 'Ta note de transmission pour cette journée est prête. Le graphique comparatif, lui, demande les quatre demi-journées.'}
          </p>
        </div>

        {status === 'sent' && (
          <p className="text-[13.5px] text-ink-muted italic shrink-0">
            Envoyé à {bilan.student.email}
          </p>
        )}
        {status === 'sending' && (
          <p className="text-[13.5px] text-ink-muted italic shrink-0">Envoi en cours…</p>
        )}
        {status === 'error' && (
          <button
            onClick={handleSend}
            className="shrink-0 bg-accent text-paper rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Réessayer
          </button>
        )}
      </div>

      {error && <p className="text-[13px] text-red-700 mt-3">{error}</p>}
    </div>
  )
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
