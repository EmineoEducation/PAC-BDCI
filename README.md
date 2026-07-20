# PAC BDCI — Festival Hémisphères

Application du Bilan de Compétences Interne (PAC BDCI) : Portrait Barnum d'entrée
+ 4 PAC (S'engager / Agir / Négocier / Recevoir), 2 situations chacun, feedback IA
en temps réel, dans l'univers du Festival Hémisphères.

Reconstruite intégralement le 20 juillet 2026 (l'ancien repo Barnum a été perdu) —
voir `PAC_BDCI_synthese_scenarisation.md` et `PAC_BDCI_grille_calibrage_dimensions.md`
pour toute la scénarisation et les règles de calibrage qui ont nourri ce code.

## Stack

- Frontend : React 19 + Vite + Tailwind v4 + React Router
- Backend : Vercel Serverless Functions (Node, ESM)
- IA : Claude Sonnet 5 (`claude-sonnet-5`) partout, Opus 4.8 en option pour la synthèse finale
- Stockage : Upstash Redis (une clé JSON par session, TTL 7 jours)

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis remplir les 3 clés (Anthropic, Upstash, Resend)
npm run dev                  # frontend seul, sur http://localhost:5173

# Pour tester les fonctions serverless en local (nécessite les clés remplies) :
npm i -g vercel
vercel dev
```

Sans les clés remplies, le frontend se lance mais les appels à `/api/*`
échoueront avec une erreur explicite — normal, il n'y a pas de mode mock côté
serveur (les retours de l'IA doivent rester réels, jamais simulés).

## ⚠️ Ce qui reste à faire avant mise en production

1. **Les 24 items du Portrait Barnum** (`src/data/barnumQuestions.js`) sont maintenant le contenu réel, retrouvé le 20/07 (6 dimensions × 3 Likert 1-5 + 1 projectif A/B). ⚠️ Ça fait 24 items, pas 48 comme mentionné dans la scénarisation d'origine — à confirmer avec Sylvain si une version plus longue existe ailleurs, ou si 24 est la version définitive. Le fichier source retrouvé calculait un score visible par dimension et affichait le nom de chaque dimension au résultat — volontairement **non repris** ici (contredit la grille de calibrage). Seules les questions ont été reprises ; le portrait reste généré par Claude en prose, sans score ni nom de dimension.
2. **Coordonnées des zones cliquables** du plan (`src/portals/Portal2Map.jsx`,
   objet `ZONE_POSITIONS`) sont approximatives — à ajuster à l'œil une fois
   déployé, en modifiant les valeurs `top/left/width/height` (en %).
3. **PDF de synthèse** (toile superposée + note de transmission en « je »,
   voir section 4 de `PAC_BDCI_grille_calibrage_dimensions.md`) — pas encore
   implémenté dans ce build.
4. **Anti-gaming** (Page Visibility API, ralentissement du temps pendant une
   perte de focus) — pas encore implémenté.
5. **Email de récap** (Resend) — dépendance installée, pas encore câblée.
6. Tester bout en bout un PAC complet une fois les clés d'environnement
   renseignées sur Vercel.

## Structure

```
src/
  portals/            Portal1Identification, BarnumQuestionnaire, Portal2Map, Portal3Carnet
  data/pacContent.json      Les 4 PAC × 2 situations, tendances, surprises (source : la scénarisation)
  data/barnumQuestions.js   Questionnaire d'entrée (placeholder, voir point 1 ci-dessus)
  lib/                 progression.js (logique de déblocage), api.js (appels client), SessionContext.jsx

api/
  session.js           Création / lecture de session
  barnum.js            Génération du portrait Barnum d'entrée
  respond.js           Classification palier B, surprise palier C, feedback intermédiaire/final
  lib/                 redis.js, anthropic.js, prompts.js (grille de calibrage encodée ici)
```

## Déploiement

```bash
git init && git add -A && git commit -m "PAC BDCI — reconstruction complète du 20/07"
git remote add origin <ton-repo-github>
git push -u origin main
```

Puis sur Vercel : importer le repo, renseigner les 3 variables d'environnement
(`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`),
et relier un store Upstash Redis au projet si ce n'est pas déjà fait.
