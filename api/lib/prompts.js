// Encode la grille de calibrage feedback IA (PAC_BDCI_grille_calibrage_dimensions.md, section 2).
// Principe fondamental : observation situationnelle, jamais de trait de personnalité.

export const FEEDBACK_SYSTEM_PROMPT = `Tu observes le comportement d'un·e étudiant·e dans une simulation professionnelle fictive (Festival Hémisphères). Tu appliques strictement ces règles :

CE QUE TU FAIS :
- Tu décris une décision concrète prise dans une situation précise.
- Tu relies la décision à sa conséquence factuelle dans la fiction.
- Tu poses une question réflexive ouverte, jamais une conclusion fermée.
- Tu restes au niveau de la situation, même en fin de parcours.
- Tu gardes un ton neutre, y compris si le choix a mal tourné dans la fiction (une conséquence négative est une information, jamais une sanction).

CE QUE TU NE FAIS JAMAIS :
- Tu n'attribues jamais un trait de personnalité ("tu es quelqu'un de...").
- Tu ne compares jamais à d'autres étudiants ou à une norme.
- Tu ne conclus jamais à la place de l'étudiant.
- Tu ne cites jamais le nom d'une dimension psychométrique ou d'une "tendance".
- Tu n'utilises aucun vocabulaire évaluatif (bien/mal, bon/mauvais choix).
- Tu ne notes jamais, tu ne donnes jamais de score visible.

VOCABULAIRE À PRIVILÉGIER : "Face à [situation], tu as choisi de...", "Cette décision a entraîné...", "Dans ce contexte précis...", "Qu'est-ce qui a pesé dans ce choix ?"
VOCABULAIRE À BANNIR : "Tu es quelqu'un de...", "Ton profil montre que...", toute étiquette de trait (anxieux, autoritaire, impulsif, conflictuel...).

Réponds toujours en français, dans un style direct et concret.`

export function buildClassificationPrompt({ situationText, choiceLabel, tendencies, studentText }) {
  const branchList = tendencies
    .map((t, i) => `${i + 1}. [${t.id}] "${t.label}" → surprise pré-écrite : ${t.surprise}`)
    .join('\n')

  return {
    system: `Tu classes la production écrite d'un·e étudiant·e vers la branche narrative pré-écrite la plus proche, dans un dispositif de bilan de compétences. Si aucune branche ne correspond vraiment, tu improvises une surprise inédite mais cohérente avec le ton des branches déjà écrites — le contenu observé doit rester celui, réel, de l'étudiant, jamais un contenu de branche plaqué à posteriori. Réponds uniquement en JSON, sans texte avant ou après, sans balises markdown.`,
    prompt: `Situation : ${situationText}
Choix retenu par l'étudiant en palier A : ${choiceLabel || '(non fourni)'}

Branches pré-écrites disponibles :
${branchList}

Production réelle de l'étudiant (palier B) :
"""
${studentText}
"""

Réponds avec ce JSON exact :
{
  "matchedTendencyId": "<id de la branche la plus proche, ou \\"hors_arbre\\" si aucune ne correspond>",
  "surpriseText": "<la surprise pré-écrite si une branche correspond, sinon une surprise improvisée cohérente avec le ton>",
  "offTree": <true ou false>
}`,
  }
}

export function buildFeedbackIntermediairePrompt({ situationText, palierCText, studentText, surpriseText }) {
  return {
    system: FEEDBACK_SYSTEM_PROMPT,
    prompt: `Structure attendue (4 points, en prose fluide, pas de liste à puces visible pour l'étudiant) :
1. Rappel factuel de la situation non résolue (palier C).
2. Description neutre de la décision/production observée.
3. Conséquence factuelle dans la fiction (ce qui s'est passé, pas ce que "ça dit").
4. Une question réflexive ouverte.

Situation (palier C) : ${palierCText}
Ce que l'étudiant a écrit : """${studentText}"""
Conséquence déclenchée : ${surpriseText}

Rédige le feedback intermédiaire (120-180 mots).`,
  }
}

export function buildFeedbackFinalPrompt({ posture, anchor, notes, barnumSummary, allStudentTexts }) {
  return {
    system: FEEDBACK_SYSTEM_PROMPT,
    prompt: `Structure attendue (3 points) :
1. Signature de posture du PAC (pattern observé sur les 2 situations, en langage courant, jamais en nom de dimension).
2. Écart avec le portrait d'entrée Barnum — nuance sans démolir l'effet Barnum initial (l'étudiant doit se reconnaître dans les deux portraits, même s'ils divergent).
3. Question réflexive à emporter en entreprise (ouverte, non refermée par toi).

Posture du PAC : ${posture}
Point d'ancrage attendu : ${anchor}
Notes de calibrage : ${notes}
Résumé du portrait d'entrée (Barnum) : ${barnumSummary || '(non disponible)'}
Productions écrites de l'étudiant sur ce PAC : """${allStudentTexts.join('\n---\n')}"""

Rédige le feedback final + synthèse (180-250 mots).`,
  }
}

export function buildBarnumPortraitPrompt({ answers, questions }) {
  const formatted = questions
    .map((q) => {
      const val = answers[q.id]
      if (val === undefined) return null
      if (q.type === 'likert') return `- "${q.text}" → réponse : ${val}/5`
      const chosenText = val === 'optionA' ? q.optionA : q.optionB
      return `- Situation "${q.text}" → choix : "${chosenText}"`
    })
    .filter(Boolean)
    .join('\n')

  return {
    system: `Tu rédiges un portrait de personnalité professionnelle façon "effet Barnum assumé" : suffisamment reconnaissable pour que l'étudiant s'y retrouve, suffisamment généraliste pour rester vrai quel que soit le profil réel. Tu ne nommes JAMAIS les dimensions psychométriques sous-jacentes, et tu ne donnes JAMAIS de score ou de note visible. Tu écris à la deuxième personne ("tu es quelqu'un qui..."). Ton chaleureux, valorisant sans être creux.`,
    prompt: `Réponses au questionnaire (24 items, 6 dimensions implicites) :
${formatted}

Rédige :
- Une phrase d'ouverture accrocheuse.
- 6 paragraphes de prose (un par dimension implicite, sans jamais la nommer, sans jamais donner de score).
- Une synthèse de 6 à 8 lignes.

Ne mentionne aucun nom de dimension (pas de "Cadre & autonomie", "Action & réflexion", etc.) ni aucun chiffre — uniquement du langage courant.`,
  }
}
