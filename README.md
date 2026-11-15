# CacheLab

CacheLab est un cache clé/valeur en mémoire, développé par trois étudiants en Mastère Développement Avancé & DevOps à La Plateforme. Le moteur utilise notre table de hachage avec chaînage séparé : aucun `Map`, Redis ou moteur de cache externe ne réalise le stockage.

## Installation et lancement

Node.js 22 ou supérieur et npm sont nécessaires. Aucune dépendance d'exécution ; TypeScript et les types Node sont des dépendances de développement.

```bash
npm ci
npm run build
npm start
```

Le serveur écoute exclusivement sur `127.0.0.1:3000`. Pour choisir un autre port : `PORT=3001 npm start`. `PORT=0` laisse le système attribuer un port, affiché au démarrage.

```bash
npm test
npm run benchmark
```

Les tests compilent le projet puis utilisent le runner Node et de vrais serveurs HTTP locaux sur des ports éphémères. L'environnement doit autoriser l'ouverture de sockets locales. Le benchmark mesure uniquement le moteur de stockage.

## Architecture

- `src/hash-map.ts` : moteur générique `HashMap<Value>` et listes chaînées.
- `src/server.ts` : création du serveur HTTP, validation, quotas, routes et erreurs JSON. Chaque serveur possède son propre stockage.
- `src/index.ts` : validation du port et lancement sur l'interface locale.
- `test/hash-map.test.js` : opérations, collisions et seuils de redimensionnement.
- `test/api.test.js` : CRUD HTTP, validation, erreurs et quotas.
- `scripts/benchmark.js` : mesures reproductibles à 100, 1 000 et 10 000 clés.
- `docs/` : audit, mesures et brouillons des livrables pédagogiques.

## Fonctionnement de la HashMap

Chaque case du tableau contient la tête d'une liste `{ key, value, next }`. La fonction de hachage utilise un calcul de type FNV-1a : XOR puis multiplication 32 bits sur chaque unité UTF-16 de la clé (`charCodeAt`). Il ne s'agit donc pas du FNV-1a standard sur octets UTF-8, ni d'un hachage cryptographique. La conversion non signée `>>> 0` garantit un indice positif avant le modulo de la capacité.

`set` parcourt la chaîne : il remplace la valeur si la clé existe, sinon insère en tête. `get` et `has` comparent les clés, ce qui distingue les collisions. `has` permet aussi de distinguer une valeur `undefined` d'une absence dans le moteur générique ; l'API accepte uniquement les valeurs JSON.

`delete` reconnecte le précédent au suivant, ou remplace la tête. Le compteur diminue uniquement si une clé existe. Les entrées supprimées deviennent récupérables par le ramasse-miettes de JavaScript ; la libération effective n'est pas immédiate.

La capacité commence à 16. Une insertion nouvelle dépassant 75 % d'occupation double la capacité. Une suppression passant sous 25 % la divise par deux, sans descendre sous 16. L'écart entre les seuils évite les redimensionnements répétés autour d'un même seuil. `resize` recalcule les indices et réutilise les nœuds : le pointeur `next` est sauvegardé avant de déplacer chaque entrée. Le nombre d'entrées ne change pas. `size` et `capacity` sont des accesseurs en lecture seule.

Pour des clés de longueur bornée et une bonne répartition, recherche, modification et suppression sont en O(1) en moyenne, et insertion en O(1) amorti. Un redimensionnement coûte O(n + capacité), avec recalcul des hachages. Une collision pathologique peut rendre une opération O(n). Le hachage coûte O(longueur de clé). L'espace est O(n + capacité + données), avec deux tableaux momentanément pendant un redimensionnement. Le plafond HTTP borne les clés ; la HashMap seule n'impose pas de quota.

## API REST

Les requêtes POST/PUT doivent avoir `Content-Type: application/json`. Une valeur peut être un objet, tableau, nombre, booléen, chaîne ou `null`. L'absence du champ `value` est refusée.

| Méthode | Chemin | Réponse |
|---|---|---|
| POST | `/keys` | 201 `{ "key": "...", "value": ... }`, 409 si doublon |
| GET | `/keys/:key` | 200 `{ "key": "...", "value": ... }`, 404 si absente |
| PUT | `/keys/:key` | 200 même format, 404 si absente |
| DELETE | `/keys/:key` | 204 sans corps, 404 si absente |

`GET /keys` optionnel n'est pas implémenté (405). Les méthodes non autorisées répondent 405 avec `Allow`, les routes inconnues 404. Les erreurs ont la forme `{ "error": "message" }` : 400 pour une requête invalide, 413 pour un corps trop grand, 415 pour un type de contenu incorrect, 507 lorsque le cache est plein, 500 en cas d'erreur interne inattendue.

```bash
curl -i -X POST http://127.0.0.1:3000/keys \
  -H 'Content-Type: application/json' \
  -d '{"key":"session:1","value":{"user":"Alice"}}'
curl -i http://127.0.0.1:3000/keys/session%3A1
curl -i -X PUT http://127.0.0.1:3000/keys/session%3A1 \
  -H 'Content-Type: application/json' -d '{"value":"active"}'
curl -i -X DELETE http://127.0.0.1:3000/keys/session%3A1
```

Encoder la clé avec `encodeURIComponent` côté client, notamment pour `/`, `?`, `#` ou les espaces. Les clés sont sensibles à la casse ; les espaces ne sont pas supprimés et aucune normalisation Unicode n'est appliquée. Les clés vides, les caractères de contrôle ASCII et les clés `.` ou `..` sont refusés (ces dernières sont normalisées dans les URL).

## Protections et limites du MVP

- Clés : maximum 1 024 octets UTF-8 ; corps JSON : maximum 1 MiB pour POST et PUT.
- Par serveur : maximum 10 000 entrées et 16 MiB cumulés de clés UTF-8 + valeurs JSON sérialisées. Un refus conserve les données précédentes ; remplacer une valeur ou supprimer une clé ajuste le quota.
- Ces octets sont un indicateur de volume, **pas une limite exacte de la RAM** : objets JavaScript, nœuds, tableaux, buffers de requêtes et sérialisation consomment aussi de la mémoire. Les JSON contenant de nombreux petits objets peuvent avoir un surcoût important.
- `createKeyValueServer({ maxEntries, maxStorageBytes })` permet d'adapter les quotas ; les deux valeurs doivent être des entiers positifs sûrs.
- Délai de réception : 15 s, en-têtes : 10 s ; vérification des délais selon la cadence interne de Node. Maximum 100 connexions simultanées. Ce n'est pas une limitation du débit par client.
- Pas d'authentification : toute personne pouvant joindre le serveur peut lire, modifier ou supprimer les données. L'écoute locale est conservée ; avant toute exposition distante, prévoir authentification, TLS et contrôle de débit via une infrastructure adaptée.
- Aucune persistance, expiration TTL, éviction ou réplication. Un redémarrage perd toutes les données ; un cache plein refuse les écritures dépassant les quotas. Ces fonctions ne sont pas annoncées comme réalisées.

## Livrables pédagogiques et bilan

Le fichier officiel `CacheLab-1.pdf` était introuvable lors de la reprise : la conformité complète au sujet reste à vérifier avec ce document. Voir [l'audit](docs/audit.md) et les [mesures réelles](docs/performances.md).

Les cahiers des charges et la note de cadrage étaient absents. Des brouillons décrivant l'état technique observable sont désormais disponibles : [fonctionnel](docs/cahier-fonctionnel.md), [technique](docs/cahier-technique.md), [cadrage et planification](docs/cadrage-planification.md). Ils restent à relire avec le sujet et à valider par l'équipe ; aucun budget, responsable ou calendrier d'équipe n'est inventé.
