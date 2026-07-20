// Questionnaire Portrait Barnum — contenu réel retrouvé le 20/07/2026
// (24 items : 6 dimensions × 3 Likert 1-5 + 1 projectif A/B).
// Note : le fichier source d'origine calculait un score visible et affichait
// le nom de chaque dimension au résultat — volontairement NON repris ici,
// car ça contredit la grille de calibrage (jamais de score visible, jamais
// de nom de dimension affiché). Seules les questions sont reprises ; le
// portrait reste généré par Claude en prose, via /api/barnum.js.

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

export const DIMENSION_META = {
  cadre_autonomie: { title: 'Cadre & autonomie', desc: 'Comment vous situez-vous face aux consignes et à la marge de manœuvre ?' },
  action_reflexion: { title: 'Action & réflexion', desc: 'Comment entrez-vous dans l\'action quand il faut démarrer ?' },
  exigence_pragmatisme: { title: 'Exigence & pragmatisme', desc: 'Comment arbitrez-vous entre qualité, finition et efficacité ?' },
  stabilite_adaptabilite: { title: 'Stabilité & adaptabilité', desc: 'Comment réagissez-vous quand la situation échappe à votre contrôle ?' },
  relation_autonomie: { title: 'Relation & autonomie', desc: 'Comment vous situez-vous entre coopération et travail en solo ?' },
  visibilite_discretion: { title: 'Visibilité & discrétion', desc: 'Comment vous positionnez-vous par rapport à l\'exposition de votre travail ?' },
}

export const BARNUM_QUESTIONS = [
  // Cadre & autonomie
  { id: 'q1_1', type: 'likert', dimension: 'cadre_autonomie', text: 'Je suis plus efficace quand les attentes sont posées clairement.' },
  { id: 'q1_2', type: 'likert', dimension: 'cadre_autonomie', text: 'Je préfère avoir de la latitude sur la méthode, même si l\'objectif est défini de façon large.' },
  { id: 'q1_3', type: 'likert', dimension: 'cadre_autonomie', text: 'J\'ai tendance à vérifier les règles du jeu avant de me lancer.' },
  { id: 'q1_p', type: 'projectif', dimension: 'cadre_autonomie', text: 'On te confie une mission avec un objectif large mais sans mode d\'emploi. Tu commences par :', optionA: 'Prendre le temps de clarifier exactement ce qu\'on attend de toi.', optionB: 'Démarrer avec ce que tu as compris et ajuster en route.' },

  // Action & réflexion
  { id: 'q2_1', type: 'likert', dimension: 'action_reflexion', text: 'Je passe facilement de l\'intention à l\'action.' },
  { id: 'q2_2', type: 'likert', dimension: 'action_reflexion', text: 'Quand quelque chose déraille, je préfère recadrer la situation avant de continuer.' },
  { id: 'q2_3', type: 'likert', dimension: 'action_reflexion', text: 'Je me sens à l\'aise pour démarrer avec une information incomplète.' },
  { id: 'q2_p', type: 'projectif', dimension: 'action_reflexion', text: 'Tu dois rendre quelque chose dans 2h et il te manque des informations. Tu :', optionA: 'Fais une version avec ce que tu as, quitte à la corriger ensuite.', optionB: 'Prends 30 min pour rassembler ce qui manque avant de commencer.' },

  // Exigence & pragmatisme
  { id: 'q3_1', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je préfère livrer quelque chose de propre, même si cela prend plus de temps.' },
  { id: 'q3_2', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je peux transmettre une version imparfaite si elle fait avancer le travail.' },
  { id: 'q3_3', type: 'likert', dimension: 'exigence_pragmatisme', text: 'Je sais ajuster mon niveau d\'exigence selon l\'enjeu.' },
  { id: 'q3_p', type: 'projectif', dimension: 'exigence_pragmatisme', text: 'Tu as 80% d\'un livrable prêt. Le délai ne peut pas bouger. Tu :', optionA: 'Livres tel quel en signalant clairement ce qui manque.', optionB: 'Continues la nuit s\'il le faut pour que ce soit complet.' },

  // Stabilité & adaptabilité
  { id: 'q4_1', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Je supporte assez bien de ne pas tout contrôler immédiatement.' },
  { id: 'q4_2', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Quand un imprévu arrive, mon premier réflexe est de chercher à reprendre la main.' },
  { id: 'q4_3', type: 'likert', dimension: 'stabilite_adaptabilite', text: 'Je m\'adapte plus vite que je ne m\'inquiète.' },
  { id: 'q4_p', type: 'projectif', dimension: 'stabilite_adaptabilite', text: 'En pleine tâche, un changement de cap te tombe dessus sans explication. Tu :', optionA: 'Demandes d\'abord pourquoi avant d\'ajuster ta trajectoire.', optionB: 'T\'adaptes et comprends le sens du changement en avançant.' },

  // Relation & autonomie
  { id: 'q5_1', type: 'likert', dimension: 'relation_autonomie', text: 'Dans un groupe professionnel, je prends facilement ma place.' },
  { id: 'q5_2', type: 'likert', dimension: 'relation_autonomie', text: 'Je préfère souvent régler les choses seul avant de solliciter quelqu\'un.' },
  { id: 'q5_3', type: 'likert', dimension: 'relation_autonomie', text: 'Je suis à l\'aise pour recevoir du feedback sur mon travail.' },
  { id: 'q5_p', type: 'projectif', dimension: 'relation_autonomie', text: 'Tu butes sur un problème depuis 45 min. Tu :', optionA: 'Demandes de l\'aide même si tu n\'as pas encore tout essayé.', optionB: 'Continues seul jusqu\'à avoir vraiment fait le tour avant d\'en parler.' },

  // Visibilité & discrétion
  { id: 'q6_1', type: 'likert', dimension: 'visibilite_discretion', text: 'Je suis à l\'aise quand mon travail est visible et évalué.' },
  { id: 'q6_2', type: 'likert', dimension: 'visibilite_discretion', text: 'Je préfère que mon travail parle pour moi plutôt que de le mettre en avant moi-même.' },
  { id: 'q6_3', type: 'likert', dimension: 'visibilite_discretion', text: 'Je peux prendre la parole sans difficulté quand la situation l\'exige.' },
  { id: 'q6_p', type: 'projectif', dimension: 'visibilite_discretion', text: 'Tu as contribué fortement à un projet collectif. Au moment du bilan, tu :', optionA: 'Mets en avant ta contribution sans hésiter.', optionB: 'Laisses le résultat collectif parler, sans te mettre au premier plan.' },
]
