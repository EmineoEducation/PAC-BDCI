// ==============================================================
//  LIVRAISON B01 - PAC BDCI - CORRECTIFS AVANT 1re SESSION
//  DEPOT       : EmineoEducation/PAC-BDCI
//  DESTINATION : api/send-bilan.js   (ecrase le fichier existant)
//  CORRECTIF   : echec bruyant si PORTFOLIO_FROM absente + maxDuration = 60
//  DATE        : 30/08/2026
// ==============================================================

// api/send-bilan.js
// Envoi du bilan PAC BDCI par email (Resend), avec mise en copie du référent
// campus résolu via le hub emineo-campus-rp.
//
// ADAPTÉ de api/send-portfolio.js (chaîne générique des 18 PAC, validée en
// production le 03/08). Ce qui est repris à l'identique : normalizeCampus,
// getCampusRPMap, logIncident, la résolution cc/reply-to, le traitement des
// pièces jointes base64, la limite de 4 Mo. Ce qui diverge, et pourquoi :
//
//   • markCompleted() / PORTAIL_URL — SUPPRIMÉ. La chaîne générique coche la
//     progression sur `https://{titre}-pac.vercel.app/api/progress`. BDCI n'a
//     pas de portail : la progression vit dans sa propre session Redis, écrite
//     par /api/respond.js. Appeler une URL inexistante ne ferait qu'ajouter
//     2,5 s de latence et un faux négatif dans les journaux.
//   • RNCP_BY_TITRE — SUPPRIMÉ. BDCI est un bilan interne, pas une
//     certification : aucun numéro n'existe et il ne faut surtout pas en
//     inventer un. Le pied de page n'affiche donc aucune mention RNCP.
//   • CORS — SUPPRIMÉ. Le front BDCI appelle sa propre API en même origine.
//
// Variables d'environnement Vercel requises (trois scopes, redéploiement sans
// cache après toute modification) :
//   RESEND_API_KEY                 clé Resend
//   PAC_BLOC_KEY                   'bdci:bc1' — sert au paramètre `titre` du hub
//                                  et à la clé d'incidents Redis
//   PORTFOLIO_FROM                 'PAC Emineo <no-reply@pac-emineo.cesacom-edu.net>'
//   PAC_FALLBACK_EMAIL             copie de repli si le campus n'est pas résolu
//   UPSTASH_REDIS_REST_URL/TOKEN   déjà présentes (journalisation best-effort)

const PAC_BLOC_KEY = process.env.PAC_BLOC_KEY || 'bdci:bc1'
const [TITRE_RAW] = PAC_BLOC_KEY.split(':')
const TITRE_CODE = (TITRE_RAW || 'bdci').toUpperCase()

const PAC_FALLBACK_EMAIL = process.env.PAC_FALLBACK_EMAIL || ''
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

const CAMPUS_RP_HUB = 'https://emineo-campus-rp.vercel.app/api/campus-rp'
const INCIDENTS_KEY = `${PAC_BLOC_KEY}:incidents`

// Minuscules, sans accents, espaces internes réduits — les identifiants du
// registre RP contiennent des espaces (« le mans », « la rochelle ») sans forme
// canonique unique. C'est ce qui rend la saisie libre du nom de ville viable.
function normalizeCampus(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ')
}

async function getCampusRPMap() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const r = await fetch(CAMPUS_RP_HUB + '?titre=' + TITRE_CODE, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) throw new Error('hub non-OK: ' + r.status)
    const data = await r.json()
    const map = {}
    for (const c of (data.campuses || [])) {
      const emails = (c.rp || []).map((p) => p.email).filter(Boolean)
      if (c.id) map[normalizeCampus(c.id)] = emails
      if (c.label) map[normalizeCampus(c.label)] = emails
    }
    return { map, hubOk: true }
  } catch (e) {
    console.warn('Hub campus-rp injoignable:', e.message)
    return { map: {}, hubOk: false }
  }
}

async function logIncident(event, fields) {
  const incident = { event, timestamp: new Date().toISOString(), ...fields }
  console.warn(event + ':', JSON.stringify(incident))
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return
  try {
    // Commande dans le CORPS, jamais dans l'URL : email et nom sont des données
    // personnelles qui n'ont rien à faire dans les journaux d'accès.
    await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['RPUSH', INCIDENTS_KEY, JSON.stringify(incident)]),
    })
  } catch (err) {
    console.warn('logIncident redis error:', err.message)
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Méthode ${req.method} non supportée.` })
  }

  const resendKey = process.env.RESEND_API_KEY
  // ── B01 · Plus de repli sur onboarding@resend.dev ────────────────────────
  // Cette adresse de bac a sable Resend ne delivre QU'AU titulaire du compte.
  // Avec l'ancien repli, une variable PORTFOLIO_FROM oubliee sur Vercel faisait
  // partir chaque bilan dans le vide en repondant `sent: true` : l'etudiant
  // voyait une confirmation, personne ne recevait rien. Un echec visible vaut
  // mieux qu'une reussite mensongere.
  const from = process.env.PORTFOLIO_FROM

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { email, studentName, campus, scopeLabel, bilanHTML, attachments, pdfAttempted } = body || {}

    if (!email || !bilanHTML) {
      return res.status(400).json({ error: 'Champs requis manquants : email, bilanHTML.' })
    }
    if (!resendKey) {
      console.error('RESEND_API_KEY non configurée — bilan non envoyé')
      return res.status(503).json({ error: 'RESEND_API_KEY non configurée', sent: false })
    }
    if (!from) {
      console.error('PORTFOLIO_FROM non configurée — bilan non envoyé (voir .env.example)')
      return res.status(503).json({
        error: "L'expéditeur des emails n'est pas configuré sur ce déploiement. Préviens le référent de campus — ton bilan est conservé, il pourra être renvoyé.",
        sent: false,
      })
    }

    const { map: campusRPMap, hubOk } = await getCampusRPMap()
    const normalized = normalizeCampus(campus)
    const resolved = normalized && campusRPMap[normalized]
    const campusResolved = !!(resolved && resolved.length)
    const cc = campusResolved ? resolved : (PAC_FALLBACK_EMAIL ? [PAC_FALLBACK_EMAIL] : [])
    const replyTo = cc.slice(0, 3)

    if (!hubOk) {
      await logIncident('hub_unreachable', { email, studentName, campusReceived: campus || '' })
    } else if (!campusResolved) {
      await logIncident('campus_unresolved', { email, studentName, campusReceived: campus || '' })
    }

    // Pièces jointes best-effort : une pièce malformée est ignorée plutôt que
    // de faire échouer l'envoi. Le bilan part sans son PDF, l'incident est tracé.
    const finalAttachments = Array.isArray(attachments)
      ? attachments
          .filter((a) => a && a.content && a.filename)
          .map((a) => ({ filename: String(a.filename), content: String(a.content) }))
      : []

    if (pdfAttempted && !finalAttachments.length) {
      await logIncident('pdf_render_failed', { email, studentName, scopeLabel: scopeLabel || '' })
    }

    const dateStr = new Date().toLocaleDateString('fr-FR')
    const prenom = studentName ? studentName.split(' ')[0] : 'Étudiant(e)'
    const scope = scopeLabel || 'Bilan'
    const subject = `Votre bilan PAC BDCI — ${scope.toLowerCase()}`

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'IBM Plex Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

        <tr><td style="background:#0B2B2D;padding:28px 32px;">
          <span style="font-size:22px;font-weight:700;color:#5DE298;letter-spacing:-0.5px;">Éminéo Education</span>
          <span style="font-size:13px;color:#E3FFF0;margin-left:12px;opacity:0.7;">PAC BDCI · Bilan de compétences interne</span>
        </td></tr>

        <tr><td style="padding:32px 32px 16px;">
          <p style="margin:0 0 12px;font-size:16px;color:#0B2B2D;">Bonjour ${escapeHtml(prenom)},</p>
          <p style="margin:0 0 12px;font-size:15px;color:#134547;line-height:1.6;">
            Voici votre <strong>${escapeHtml(scope.toLowerCase())}</strong>, établi le <strong>${dateStr}</strong>.
          </p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
            Ce document met en regard la manière dont vous vous décriviez au départ et les choix
            que vous avez réellement faits en situation. Il ne comporte ni note, ni classement :
            c'est un support de réflexion à emporter en entreprise.
          </p>
        </td></tr>

        <tr><td style="padding:0 32px;">
          <div style="height:3px;background:linear-gradient(90deg,#5DE298,#134547);border-radius:2px;"></div>
        </td></tr>

        <tr><td style="padding:24px 32px;">${bilanHTML}</td></tr>

        <tr><td style="padding:0 32px 24px;">
          <div style="background:#E3FFF0;border-left:4px solid #5DE298;padding:12px 16px;border-radius:0 6px 6px 0;">
            <p style="margin:0;font-size:12px;color:#134547;">
              ${replyTo.length
                ? 'Cet email est envoyé depuis une adresse technique, mais vous pouvez <strong>répondre directement</strong> à ce message : votre réponse arrivera à votre référent Éminéo.'
                : '⚠️ Cet email est envoyé depuis une adresse <strong>no-reply</strong>. Pour toute question, contactez directement votre référent Éminéo.'}
            </p>
          </div>
        </td></tr>

        <tr><td style="background:#0B2B2D;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#E3FFF0;opacity:0.6;text-align:center;">
            Éminéo Education · PAC BDCI · ${dateStr}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from,
        to: [email],
        cc,
        ...(replyTo.length ? { reply_to: replyTo } : {}),
        subject,
        html,
        ...(finalAttachments.length ? { attachments: finalAttachments } : {}),
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('Resend error:', resendData)
      await logIncident('resend_failed', { email, studentName, scopeLabel: scope })
      return res.status(200).json({ sent: false, campusResolved, resendError: resendData })
    }

    return res.status(200).json({ sent: true, campusResolved, id: resendData.id })
  } catch (err) {
    console.error('send-bilan handler error:', err)
    return res.status(500).json({ error: 'Erreur serveur', message: err.message, sent: false })
  }
}

// 4 Mo est la valeur maximale utile : Vercel refuse au niveau plateforme (413)
// tout corps de requête dépassant ~4,5 Mo, quelle que soit la valeur déclarée.
// La seule marge de manœuvre est côté client, sur le poids du PDF généré.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

// ── B01 · Duree maximale d'execution ───────────────────────────────────────
// Appel au hub campus/RP (2,5 s max) puis envoi Resend avec piece jointe PDF.
export const maxDuration = 60
