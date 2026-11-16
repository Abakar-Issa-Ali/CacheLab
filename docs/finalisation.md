# Compte rendu de finalisation — 16 novembre 2026

## État Git et sauvegarde

Base : `mehdi-integration-api`, avec modifications locales préexistantes. Branche dédiée : `feature/cachelab-finalisation`. Le patch initial est sauvegardé dans `/tmp/cachelab-before.patch` et les sources locales sont conservées dans le commit `8eadac3`. Aucun changement direct sur main ou la branche Mehdi, aucune fusion et aucun push.

Commits suivants : `ab247b6` (fonctionnalités, interface et tests), `15fb4e4` (documentation et mesures). Les fichiers dist précédemment suivis ont été retirés de l'index, puis sont générés uniquement par TypeScript et ignorés par Git.

## Fonctionnalités réalisées

- CRUD existant et KEYS conservés ; HashMap personnalisée inchangée après sauvegarde du travail initial.
- INCR/DECR avec validation du type, bornes numériques et quotas ; conservation du TTL.
- TTL en secondes, fractions acceptées, échéance absolue, expiration à l'accès et nettoyage périodique sans requête.
- Persistance JSON configurable, remplacement par renommage atomique, synchronisation du fichier temporaire, refus des mutations en cas d'échec disque.
- Restauration des valeurs et échéances, exclusion des expirations passées, validation du snapshot et des quotas sans écrasement au démarrage.
- Métriques : hits/misses des GET individuels, clés actives, octets sérialisés, capacité et hit rate.
- Client React conservant le formulaire existant : nouvelles opérations, TTL, statuts et résultats JSON ; correction de la syntaxe URL et du proxy Vite.
- Benchmark HTTP séparant le processus serveur du générateur, avec statistiques complètes, concurrence et volumes configurables ; microbenchmark moteur conservé.

## Fichiers

Créés : `src/cache.ts`, `test/features.test.js`, `scripts/benchmark-http.js`, `docs/benchmark-http.jsonl`, `docs/benchmark-disk.jsonl`, `docs/soutenance.md`, `docs/finalisation.md`.

Modifiés pendant la finalisation : `.gitignore`, `package.json`, `src/server.ts`, `src/index.ts`, `client/src/main.tsx`, `client/src/style.css`, `client/vite.config.ts`, `README.md`, `client/README.md`, `docs/performances.md`.

Les changements initiaux sur `src/hash-map.ts` et `test/api.test.js` ont été sauvegardés, sans suppression des tests. Fichiers compilés retirés du suivi : `dist/src/hash-map.js`, `dist/src/server.js` (restent produits par build).

## Routes disponibles

POST `/keys`, GET `/keys`, GET/PUT/DELETE `/keys/:key`, POST `/keys/:key/incr`, POST `/keys/:key/decr`, GET `/metrics`. Le README précise les corps, statuts et politiques de TTL.

## Vérifications exécutées

- Référence : 16 tests réussis, 0 échec. Le premier essai sandbox refusait les sockets (`EPERM`) ; la même commande avec accès aux sockets locales réussit.
- Version finale : `npm test`, 26 tests réussis, 0 échec, aucun ignoré. Compilation TypeScript strict comprise.
- Build React : `npm --prefix client run build`, réussi.
- Tests HTTP : CRUD, liste, opérations concurrentes INCR, erreurs, quotas, TTL et métriques ; sauvegarde et redémarrage d'une instance HTTP.
- Nettoyage automatique observé sans lecture après création, libération des quotas vérifiée ; échecs de persistance vérifiés au niveau module et HTTP.
- Vérification supplémentaire avec processus CLI : démarrage de `dist/src/index.js`, écriture via le proxy Vite, arrêt et redémarrage du processus, lecture de la valeur restaurée 42.
- Proxy Vite : page HTML servie, `/keys` et `/metrics` transmises à l'API. Pas de session de validation visuelle dans un navigateur automatisé ; le contrôle du frontend porte sur sa compilation et la communication HTTP réelle.
- Clone local propre de la branche dans `/tmp/cachelab-clean-verification`, installation avec les deux lockfiles, 26 tests réussis (0 échec) et build frontend réussi. Les fichiers dist sont générés à partir des sources du clone sans fichiers compilés préexistants.
- `git diff --check` exécuté sans erreur.

## Mesures réelles

Sans persistance : 100/1 000 clés initiales, concurrences 1/10, 200 mesures par opération et scénario, 5 600 succès, 0 échec. Moyennes observées : 0,686 à 11,335 ms ; débits : 451,785 à 2 673,044 req/s selon le scénario. Ces intervalles ne sont pas une agrégation de percentiles.

Avec persistance : 100 clés initiales, concurrence 1, 100 mesures par opération, 700 succès, 0 échec. Moyennes de 1,831 à 3,798 ms. Série exécutée pendant d'autres vérifications : comparaison avec la série mémoire non contrôlée.

Microbenchmark HashMap : insertion/recherche totales médianes pour 100 clés 0,0893/0,0266 ms ; 1 000 clés 0,3641/0,1688 ms ; 10 000 clés 4,2443/2,0943 ms. Les tableaux HTTP complets, min/max et percentiles, la méthode et la comparaison au document du professeur figurent dans `docs/performances.md`.

## Limites et démarrage

Aucune fonctionnalité du périmètre demandé n'est laissée sous forme d'extrait non intégré. Limites assumées : snapshots synchrones complets et balayages linéaires, un seul processus par fichier, pas d'authentification ni de réplication, pas de garantie absolue en cas de panne électrique. Les expirations en mémoire sont retirées du snapshot à la prochaine mutation ; leurs échéances empêchent toute restauration indue.

```bash
npm ci
npm run build
npm start
# Autre terminal
npm ci --prefix client
npm --prefix client run dev
# Validation
npm test
npm --prefix client run build
npm run benchmark
```

Pour choisir le fichier : `CACHE_FILE=/tmp/demo-cache.json npm start`. Le guide `docs/soutenance.md` fournit les commandes curl, l'explication du moteur et la démonstration de redémarrage.
