// Rendu PDF du bilan PAC BDCI — jsPDF, côté client.
//
// Le rendu est fait dans le navigateur puis transmis en base64 à
// /api/send-bilan, exactement comme la chaîne générique des 18 PAC procède
// pour sa carte visuelle. Avantage : aucune dépendance de rendu côté
// serverless, et un poids de fichier minuscule car la toile est dessinée en
// vectoriel (pas de rasterisation canvas).
//
// Deux formes selon la portée :
//   • jour 1 → note de transmission seule + encart signalant que la toile
//     comparative n'est établie qu'au terme des quatre demi-journées.
//   • complet → note de transmission + toile superposée (entrée / observé).

// jsPDF est chargé à la demande : il ne sert qu'aux deux moments de bilan du
// parcours, il n'a rien à faire dans le bundle principal que chaque étudiant·e
// télécharge dès la page d'identification.
let jsPDFCtor = null
async function loadJsPDF() {
  if (!jsPDFCtor) ({ jsPDF: jsPDFCtor } = await import('jspdf'))
  return jsPDFCtor
}

const INK = [11, 43, 45]      // #0B2B2D
const DEEP = [19, 69, 71]     // #134547
const MINT = [93, 226, 152]   // #5DE298
const GREY = [110, 110, 110]
const RULE = [214, 214, 214]

const PAGE_W = 210
const PAGE_H = 297
const M = 20                  // marge
const CONTENT_W = PAGE_W - M * 2

function header(doc, subtitle) {
  doc.setFillColor(...INK)
  doc.rect(0, 0, PAGE_W, 26, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...MINT)
  doc.text('Éminéo Education', M, 13)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(227, 255, 240)
  doc.text('PAC BDCI · Bilan de compétences interne', M, 19)
  if (subtitle) {
    doc.setFontSize(8.5)
    doc.text(subtitle, PAGE_W - M, 19, { align: 'right' })
  }
}

function footer(doc, page, total) {
  doc.setDrawColor(...RULE).setLineWidth(0.2)
  doc.line(M, PAGE_H - 16, PAGE_W - M, PAGE_H - 16)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY)
  doc.text('Ce document ne comporte ni note, ni score, ni classement.', M, PAGE_H - 11)
  doc.text(`${page} / ${total}`, PAGE_W - M, PAGE_H - 11, { align: 'right' })
}

// Découpe la note en paragraphes et les pose en flux, avec saut de page.
function flowText(doc, text, startY, onNewPage) {
  doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...DEEP)
  let y = startY
  const paragraphs = String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, CONTENT_W)
    for (const line of lines) {
      if (y > PAGE_H - 28) {
        onNewPage()
        y = 40
        doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...DEEP)
      }
      doc.text(line, M, y)
      y += 5.4
    }
    y += 3.6
  }
  return y
}

// ── Toile superposée ───────────────────────────────────────────────────────
// Axe orienté du pôle bas (centre) vers le pôle haut (extérieur). Le tracé
// d'entrée est en pointillé, le comportement observé en trait plein : l'écart
// entre les deux est le livrable, pas la forme de chaque tracé pris isolément.
function drawToile(doc, axes, cx, cy, radius) {
  const n = axes.length
  if (n < 3) return

  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const point = (i, value) => {
    const r = (radius * (value - 1)) / 4
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]
  }

  // Grille : 4 anneaux + rayons
  doc.setDrawColor(...RULE).setLineWidth(0.15)
  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4
    const pts = []
    for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))])
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      doc.line(a[0], a[1], b[0], b[1])
    }
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, 5)
    doc.line(cx, cy, x, y)
  }

  const polygon = (values, dashed, color, width) => {
    doc.setDrawColor(...color).setLineWidth(width)
    doc.setLineDashPattern(dashed ? [1.4, 1.2] : [], 0)
    for (let i = 0; i < n; i++) {
      const a = point(i, values[i])
      const b = point((i + 1) % n, values[(i + 1) % n])
      doc.line(a[0], a[1], b[0], b[1])
    }
    doc.setLineDashPattern([], 0)
  }

  polygon(axes.map((a) => a.entry), true, GREY, 0.5)
  polygon(axes.map((a) => a.observed), false, DEEP, 0.9)

  // Points du tracé observé
  doc.setFillColor(...DEEP)
  axes.forEach((a, i) => {
    const [x, y] = point(i, a.observed)
    doc.circle(x, y, 0.9, 'F')
  })

  // Libellés du pôle extérieur — alignés selon la position angulaire
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK)
  axes.forEach((a, i) => {
    const ang = angle(i)
    const lx = cx + (radius + 7) * Math.cos(ang)
    const ly = cy + (radius + 7) * Math.sin(ang)
    const cos = Math.cos(ang)
    const align = cos > 0.25 ? 'left' : cos < -0.25 ? 'right' : 'center'
    const lines = doc.splitTextToSize(a.labelHigh, 34)
    lines.forEach((line, k) => doc.text(line, lx, ly + k * 3.2, { align }))
  })
}

function legend(doc, y) {
  doc.setLineDashPattern([1.4, 1.2], 0).setDrawColor(...GREY).setLineWidth(0.5)
  doc.line(M, y, M + 10, y)
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY)
  doc.text('Ce que je décrivais au départ', M + 13, y + 1)

  doc.setDrawColor(...DEEP).setLineWidth(0.9)
  doc.line(M + 82, y, M + 92, y)
  doc.setTextColor(...DEEP)
  doc.text('Ce que j\'ai fait en situation', M + 95, y + 1)
}

// Table de lecture : chaque axe et ses deux pôles, sans aucun chiffre affiché.
function axisTable(doc, axes, startY) {
  let y = startY
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK)
  doc.text('Lecture des axes', M, y)
  y += 5
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY)
  doc.text('Plus le tracé s\'éloigne du centre, plus il penche vers le terme de droite.', M, y)
  y += 6

  for (const a of axes) {
    doc.setDrawColor(...RULE).setLineWidth(0.15)
    doc.line(M, y - 3.4, PAGE_W - M, y - 3.4)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GREY)
    doc.text(a.labelLow, M, y)
    doc.setTextColor(...INK)
    doc.text(a.labelHigh, PAGE_W - M, y, { align: 'right' })
    doc.setTextColor(...RULE)
    doc.text('—', PAGE_W / 2, y, { align: 'center' })
    y += 4.2

    // Ancrage : les situations qui ont produit ce point. Décision actée —
    // « chaque point relié à une situation concrète, jamais un chiffre nu ».
    // Ce sont des titres de situation, jamais un nom de tendance ni d'axe.
    if (a.situations?.length) {
      doc.setFont('helvetica', 'italic').setFontSize(7.2).setTextColor(...GREY)
      doc.text(a.situations.join('  ·  '), M, y)
      y += 2.4
    }
    y += 4.4
  }
  return y
}

// Encart du jour 1 : signale l'absence de toile et pourquoi elle vaut la peine
// d'aller au bout. Formulé comme une information, jamais comme une injonction.
function encartJour1(doc, y) {
  const h = 30
  doc.setFillColor(227, 255, 240)
  doc.rect(M, y, CONTENT_W, h, 'F')
  doc.setFillColor(...MINT)
  doc.rect(M, y, 1.6, h, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
  doc.text('La suite du bilan', M + 6, y + 8)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...DEEP)
  const txt =
    'Cette note porte sur la première journée. À l\'issue des deux journées, un second document ' +
    'met en regard, sur un même graphique, la façon dont je me décrivais au départ et les choix ' +
    'que j\'ai réellement faits. Cette comparaison demande les quatre demi-journées : c\'est en ' +
    'confrontant plusieurs situations que l\'écart devient lisible.'
  doc.splitTextToSize(txt, CONTENT_W - 12).forEach((line, i) => {
    doc.text(line, M + 6, y + 14 + i * 4.4)
  })
  return y + h + 8
}


// ── Annexe : les productions de l'apprenant, verbatim ──────────────────────
// Le RP doit pouvoir lire ce qui a été réellement écrit, pas seulement la
// synthèse. Rien n'est reformulé ni corrigé ici : c'est la matière brute, et
// c'est ce qui donne au document son poids de livrable.
function annexe(doc, productions, onNewPage) {
  onNewPage()
  let y = 42

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
  doc.text('Annexe \u2014 mes productions', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GREY)
  doc.text(
    'Reproduites telles que je les ai \u00e9crites, sans correction ni reformulation.',
    M,
    y + 6.5
  )
  y += 16

  const ensure = (needed) => {
    if (y + needed > PAGE_H - 26) {
      onNewPage()
      y = 40
    }
  }

  const block = (label, body) => {
    if (!body) return
    ensure(14)
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(...GREY)
    doc.text(label.toUpperCase(), M, y)
    y += 4.4
    doc.setFont('helvetica', 'normal').setFontSize(9.6).setTextColor(...DEEP)
    for (const para of String(body).split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)) {
      for (const line of doc.splitTextToSize(para, CONTENT_W - 4)) {
        ensure(6)
        doc.text(line, M + 4, y)
        y += 4.9
      }
      y += 2.2
    }
    y += 3
  }

  for (const pac of productions) {
    ensure(26)
    doc.setFillColor(...INK)
    doc.rect(M, y - 4.6, CONTENT_W, 8.4, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...MINT)
    doc.text(`Posture \u00ab ${pac.posture} \u00bb`, M + 3, y + 1.2)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(227, 255, 240)
    doc.text(pac.character, PAGE_W - M - 3, y + 1.2, { align: 'right' })
    y += 12

    for (const sit of pac.situations) {
      ensure(20)
      doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK)
      doc.text(sit.title, M, y)
      y += 6

      if (sit.choiceLabel) {
        ensure(8)
        doc.setFont('helvetica', 'italic').setFontSize(8.6).setTextColor(...GREY)
        doc.splitTextToSize(`Premier geste : ${sit.choiceLabel}`, CONTENT_W - 4).forEach((l) => {
          doc.text(l, M + 4, y)
          y += 4.4
        })
        y += 2.4
      }

      block('Production \u00e9crite', sit.palierBText)
      block('Premi\u00e8re r\u00e9action', sit.reaction1Text)
      block('Seconde r\u00e9action', sit.reaction2Text)
      y += 2
    }
    y += 4
  }
}

/**
 * Construit le PDF du bilan.
 * @returns {Promise<{ base64: string, filename: string }>}
 */
export async function buildBilanPdf({ text, axes = [], withToile, scopeLabel, student, productions = [] }) {
  const JsPDF = await loadJsPDF()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const pages = []
  const newPage = () => {
    doc.addPage()
    pages.push(doc.getNumberOfPages())
    header(doc, scopeLabel)
  }

  header(doc, scopeLabel)
  pages.push(1)

  const fullName = [student?.prenom, student?.nom].filter(Boolean).join(' ') || 'Étudiant·e'
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK)
  doc.text('Note de transmission', M, 42)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GREY)
  const meta = [fullName, student?.formation, student?.campus, new Date().toLocaleDateString('fr-FR')]
    .filter(Boolean)
    .join('  ·  ')
  doc.text(meta, M, 48.5)

  doc.setDrawColor(...MINT).setLineWidth(0.8)
  doc.line(M, 53, M + 28, 53)

  let y = flowText(doc, text, 62, newPage)

  if (!withToile) {
    if (y > PAGE_H - 70) {
      newPage()
      y = 40
    }
    encartJour1(doc, y + 4)
  } else if (axes.length >= 3) {
    newPage()
    y = 42
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
    doc.text('Ce que je disais, ce que j\'ai fait', M, y)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GREY)
    doc.text(
      'Deux tracés superposés. L\'écart entre eux est ce qui compte, pas la forme de chacun.',
      M,
      y + 6.5
    )
    drawToile(doc, axes, PAGE_W / 2, 120, 44)
    legend(doc, 184)
    axisTable(doc, axes, 198)
  }

  if (productions.length) annexe(doc, productions, newPage)

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    footer(doc, p, total)
  }

  const slug = fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'etudiant'

  return {
    base64: doc.output('datauristring').split(',')[1],
    filename: `bilan-pac-bdci-${slug}.pdf`,
  }
}
