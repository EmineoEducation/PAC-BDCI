// Questionnaire Portrait Barnum — 48 items (6 dimensions × 6 Likert 1-5 + 2 projectifs A/B).
// Passage de 24 à 48 items le 04/08/2026 : les 24 items d'origine (retrouvés le
// 20/07) sont conservés MOT POUR MOT, les 24 nouveaux sont calibrés sur leur
// registre. Aucun item n'est importé d'un instrument validé (Big Five, DISC…) :
// ce serait contradictoire avec « pas un test psychométrique », et ces échelles
// sont pour partie sous licence.
//
// Le fichier source d'origine calculait un score visible et affichait le nom de
// chaque dimension au résultat — volontairement NON repris, car ça contredit la
// grille de calibrage (jamais de score visible, jamais de nom de dimension
// affiché). Le portrait reste généré en prose via /api/barnum.js.

export const LIKERT_SCALE = [1, 2, 3, 4, 5]
export const LIKERT_ENDPOINT_LABELS = { low: 'Pas du tout d\'accord', high: 'Tout à fait d\'accord' }

export const DIMENSIONS_ORDER = [
  'cadre_autonomie',
  'action_reflexion',
  'exigence_pragmatisme',
  'stabilite_adaptabilite',
  'relation_autonomie',
  'visibilite_discretion',
]

// DIMENSION_META : usage INTERNE uniquement (jamais affiché à l'étudiant).
// Les noms de dimension et leurs descriptions révèlent l'axe mesuré, ce qui
// contredit le principe fondateur du dispositif (« ne jamais nommer les
// dimensions à l'étudiant », grille de calibrage §2.1). Conservé ici pour la
// lisibilité du code / le back-office, mais NE PLUS l'afficher côté étudiant.
export const DIMENSION_META = {
  cadre_autonomie: { title: 'Cadre & autonomie', desc: 'Comment vous situez-vous face aux consignes et à la marge de manœuvre ?' },
  action_reflexion: { title: 'Action & réflexion', desc: 'Comment entrez-vous dans l\'action quand il faut démarrer ?' },
  exigence_pragmatisme: { title: 'Exigence & pragmatisme', desc: 'Comment arbitrez-vous entre qualité, finition et efficacité ?' },
  stabilite_adaptabilite: { title: 'Stabilité & adaptabilité', desc: 'Comment réagissez-vous quand la situation échappe à votre contrôle ?' },
  relation_autonomie: { title: 'Relation & autonomie', desc: 'Comment vous situez-vous entre coopération et travail en solo ?' },
  visibilite_discretion: { title: 'Visibilité & discrétion', desc: 'Comment vous positionnez-vous par rapport à l\'exposition de votre travail ?' },
}

// POLARITÉ DES AXES — usage INTERNE uniquement (back-office, toile du PDF).
// Convention : chaque dimension est bipolaire et se lit de `low` vers `high`.
// Pour un item Likert, `reverse: true` signifie que l'ACCORD penche vers le pôle
// `low` : la valeur doit alors être inversée (6 - valeur) au moment d'agréger.
// Pour un item projectif, `highOption` désigne l'option qui penche vers `high`.
//
// Cette métadonnée n'est PAS nécessaire à la génération du portrait d'entrée
// (Claude lit le texte de l'item et en déduit le sens tout seul). Elle existe
// pour la toile superposée du PDF, qui a besoin d'une position numérique
// déterministe par dimension — le score restant un artefact de mise en forme
// interne, jamais affiché à l'étudiant.
export const DIMENSION_POLES = {
  cadre_autonomie: { low: 'Cadre', high: 'Autonomie' },
  action_reflexion: { low: 'Action', high: 'Réflexion' },
  exigence_pragmatisme: { low: 'Exigence', high: 'Pragmatisme' },
  stabilite_adaptabilite: { low: 'Stabilité', high: 'Adaptabilité' },
  relation_autonomie: { low: 'Relation', high: 'Autonomie' },
  visibilite_discretion: { low: 'Visibilité', high: 'Discrétion' },
}

// Intitulés NEUTRES effectivement affichés à l'étudiant, dans l'ordre de
// DIMENSIONS_ORDER. Ils ne révèlent aucun axe mesuré : l'étudiant répond
// spontanément sans savoir ce qui est observé (condition de l'effet Barnum
// et de l'observation non biaisée). L'accroche reste générale et invariante.
export const NEUTRAL_STEP_META = {
  title: 'Ta manière de travailler',
  desc: 'Réponds spontanément, comme tu te vois vraiment — il n\'y a pas de bonne ou de mauvaise réponse.',
}

export const BARNUM_QUESTIONS = [
  // ── Cadre & autonomie ────────────────────────────────────────────────────
  { id: 'q1_1', type: 'likert', dimension: 'cadre_autonomie', reverse: true, text: 'Je suis plus efficace quand les attentes sont posées clairement.' },
  { id: 'q1_2', type: 'likert', dimension: 'cadre_autonomie', text: 'Je préfère avoir de la latitude sur la méthode, même si l\'objectif est défini de façon large.' },
  { id: 'q1_3', type: 'likert', dimension: 'cadre_autonomie', reverse: true, text: 'J\'ai tendance à vérifier les règles du jeu avant de me lancer.' },
  { id: 'q1_4', type: 'likert', dimension: 'cadre_autonomie', text: 'Je me sens capable d\'avancer même quand personne ne m\'a dit exactement comment faire.' },
  { id: 'q1_5', type: 'likert', dimension: 'cadre_autonomie', text: 'Il m\'arrive de redéfinir moi-même le périmètre d\'une mission quand il me semble mal posé.' },
  { id: 'q1_6', type: 'likert', dimension: 'cadre_autonomie', text: 'Je m\'accommode bien d\'une consigne qui laisse plusieurs interprétations possibles.' },
  { id: 'q1_p', type: 'projectif', dimension: 'cadre_autonomie', highOption: 'optionB', text: 'On te confie une mission avec un objectif large mais sans mode d\'emploi. Tu commences par :', optionA: 'Prendre le temps de clarifier exactement ce qu\'on attend de toi.', optionB: 'Démarrer avec ce que tu as compris et ajuster en route.' },
  { id: 'q1_p2', type: 'projectif', dimension: 'cadre_autonomie', highOption: 'optionB', text: 'Ton responsable part en déplacement et te laisse un dossier accompagné d\'une note de trois lignes. Tu :', optionA: 'Attends son retour pour valider ta compréhension avant d\'engager quoi que ce soit.', optionB: 'Poses tes propres hypothèses par écrit et avances dessus.' },

  // ── Action & réflexion ───────────────────────────────────────────────────
  { id: 'q2_1', type: 'likert', dimension: 'action_reflexion', reverse: true, text: 'Je passe facilement de l\'intention à l\'action.' },
  { id: 'q2_2', type: 'likert', dimension: 'action_reflexion', text: 'Quand quelque chose déraille, je préfère recadrer la situation avant de continuer.' },
  { id: 'q2_3', type: 'likert', dimension: 'action_reflexion', reverse: true, text: 'Je me sens à l\'aise pour démarrer avec une information incomplète.' },
  { id: 'q2_4', type: 'likert', dimension: 'action_reflexion', text: 'Avant de me lancer, j\'aime avoir une idée assez nette de là où je vais.' },
  { id: 'q2_5', type: 'likert', dimension: 'action_reflexion', text: 'Je préfère poser deux ou trois questions de plus plutôt que de démarrer sur une intuition.' },
  { id: 'q2_6', type: 'likert', dimension: 'action_reflexion', text: 'Je repère souvent des difficultés que d\'autres ne découvrent qu\'en cours de route.' },
  { id: 'q2_p', type: 'projectif', dimension: 'action_reflexion', highOption: 'optionB', text: 'Tu dois rendre quelque chose dans 2h et il te manque des informations. Tu :', optionA: 'Fais une version avec ce que tu as, quitte à la corriger ensuite.', optionB: 'Prends 30 min pour rassembler ce qui manque avant de commencer.' },
  { id: 'q2_p2', type: 'projectif', dimension: 'action_reflexion', highOption: 'optionB', text: 'Une réunion se termine sur une décision que tu trouves floue. Dans l\'heure qui suit, tu :', optionA: 'Commences à travailler dessus — la clarté viendra en faisant.', optionB: 'Écris ta propre reformulation et la fais valider avant d\'aller plus loin.' },

  // ── Exigence & pragmatisme ───────────────────────────────────────────────
  { id: 'q3_1', type: 'likert', dimension: 'exigence_pragmatisme', reverse: true, text: 'Je préfère livrer quelque chose de propre, même si cela prend plus de temps.' },
  { id: 'q3_2', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je peux transmettre une version imparfaite si elle fait avancer le travail.' },
  { id: 'q3_3', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je sais ajuster mon niveau d\'exigence selon l\'enjeu.' },
  { id: 'q3_4', type: 'likert', dimension: 'exigence_pragmatisme', reverse: true, text: 'Un détail négligé dans un document me gêne, même si personne d\'autre ne le remarque.' },
  { id: 'q3_5', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je préfère un travail utile tout de suite à un travail parfait plus tard.' },
  { id: 'q3_6', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je sais renoncer à une finition quand le temps manque, sans que cela me pèse.' },
  { id: 'q3_p', type: 'projectif', dimension: 'exigence_pragmatisme', highOption: 'optionA', text: 'Tu as 80% d\'un livrable prêt. Le délai ne peut pas bouger. Tu :', optionA: 'Livres tel quel en signalant clairement ce qui manque.', optionB: 'Continues la nuit s\'il le faut pour que ce soit complet.' },
  { id: 'q3_p2', type: 'projectif', dimension: 'exigence_pragmatisme', highOption: 'optionA', text: 'Tu relis le document d\'un collègue avant envoi : le fond est bon, la forme est inégale. Tu :', optionA: 'Signales les deux ou trois points qui gênent vraiment la lecture, et laisses le reste.', optionB: 'Reprends l\'ensemble pour que le document soit homogène.' },

  // ── Stabilité & adaptabilité ─────────────────────────────────────────────
  { id: 'q4_1', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Je supporte assez bien de ne pas tout contrôler immédiatement.' },
  { id: 'q4_2', type: 'likert', dimension: 'stabilite_adaptabilite', reverse: true, text: 'Quand un imprévu arrive, mon premier réflexe est de chercher à reprendre la main.' },
  { id: 'q4_3', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Je m\'adapte plus vite que je ne m\'inquiète.' },
  { id: 'q4_4', type: 'likert', dimension: 'stabilite_adaptabilite', reverse: true, text: 'J\'ai besoin d\'un minimum de régularité dans mes journées pour être à mon meilleur.' },
  { id: 'q4_5', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Changer de priorité en cours de journée ne me déstabilise pas.' },
  { id: 'q4_6', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Je trouve assez vite un plan B quand le premier ne tient plus.' },
  { id: 'q4_p', type: 'projectif', dimension: 'stabilite_adaptabilite', highOption: 'optionB', text: 'En pleine tâche, un changement de cap te tombe dessus sans explication. Tu :', optionA: 'Demandes d\'abord pourquoi avant d\'ajuster ta trajectoire.', optionB: 'T\'adaptes et comprends le sens du changement en avançant.' },
  { id: 'q4_p2', type: 'projectif', dimension: 'stabilite_adaptabilite', highOption: 'optionB', text: 'À trois jours d\'une échéance, toute l\'organisation prévue est remise à plat. Tu :', optionA: 'Cherches à préserver ce qui peut l\'être du plan initial.', optionB: 'Repars d\'une page blanche avec les nouvelles contraintes.' },

  // ── Relation & autonomie ─────────────────────────────────────────────────
  { id: 'q5_1', type: 'likert', dimension: 'relation_autonomie', reverse: true, text: 'Dans un groupe professionnel, je prends facilement ma place.' },
  { id: 'q5_2', type: 'likert', dimension: 'relation_autonomie', text: 'Je préfère souvent régler les choses seul avant de solliciter quelqu\'un.' },
  { id: 'q5_3', type: 'likert', dimension: 'relation_autonomie', reverse: true, text: 'Je suis à l\'aise pour recevoir du feedback sur mon travail.' },
  { id: 'q5_4', type: 'likert', dimension: 'relation_autonomie', text: 'J\'avance mieux quand je peux travailler sans avoir à me coordonner en permanence.' },
  { id: 'q5_5', type: 'likert', dimension: 'relation_autonomie', text: 'Je préfère présenter quelque chose d\'abouti plutôt que d\'associer les autres en cours de route.' },
  { id: 'q5_6', type: 'likert', dimension: 'relation_autonomie', text: 'Il m\'arrive de trancher seul sur des sujets que d\'autres auraient soumis au groupe.' },
  { id: 'q5_p', type: 'projectif', dimension: 'relation_autonomie', highOption: 'optionB', text: 'Tu butes sur un problème depuis 45 min. Tu :', optionA: 'Demandes de l\'aide même si tu n\'as pas encore tout essayé.', optionB: 'Continues seul jusqu\'à avoir vraiment fait le tour avant d\'en parler.' },
  { id: 'q5_p2', type: 'projectif', dimension: 'relation_autonomie', highOption: 'optionB', text: 'Un dossier avance mal parce qu\'une autre personne tarde à te répondre. Tu :', optionA: 'Vas la voir pour comprendre ce qui bloque de son côté.', optionB: 'Réorganises ton travail pour ne plus dépendre de sa réponse.' },

  // ── Visibilité & discrétion ──────────────────────────────────────────────
  { id: 'q6_1', type: 'likert', dimension: 'visibilite_discretion', reverse: true, text: 'Je suis à l\'aise quand mon travail est visible et évalué.' },
  { id: 'q6_2', type: 'likert', dimension: 'visibilite_discretion', text: 'Je préfère que mon travail parle pour moi plutôt que de le mettre en avant moi-même.' },
  { id: 'q6_3', type: 'likert', dimension: 'visibilite_discretion', reverse: true, text: 'Je peux prendre la parole sans difficulté quand la situation l\'exige.' },
  { id: 'q6_4', type: 'likert', dimension: 'visibilite_discretion', text: 'Je n\'éprouve pas le besoin qu\'on souligne ce que j\'ai fait.' },
  { id: 'q6_5', type: 'likert', dimension: 'visibilite_discretion', text: 'En réunion, j\'attends souvent d\'avoir quelque chose de solide à dire avant d\'intervenir.' },
  { id: 'q6_6', type: 'likert', dimension: 'visibilite_discretion', text: 'Je suis plus à l\'aise dans un rôle d\'appui que sur le devant de la scène.' },
  { id: 'q6_p', type: 'projectif', dimension: 'visibilite_discretion', highOption: 'optionB', text: 'Tu as contribué fortement à un projet collectif. Au moment du bilan, tu :', optionA: 'Mets en avant ta contribution sans hésiter.', optionB: 'Laisses le résultat collectif parler, sans te mettre au premier plan.' },
  { id: 'q6_p2', type: 'projectif', dimension: 'visibilite_discretion', highOption: 'optionB', text: 'Une réussite d\'équipe à laquelle tu as beaucoup contribué est présentée devant la direction. Tu :', optionA: 'Prends la parole pour expliquer la partie que tu as portée.', optionB: 'Laisses la personne qui présente dérouler, sans intervenir.' },
]
