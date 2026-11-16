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

Les tests compilent le projet puis utilisent le runner Node et de vrais serveurs HTTP locaux sur des ports éphémères. L'environnement doit autoriser l'ouverture de sockets locales. Le benchmark principal mesure HTTP ; `benchmark:hashmap` conserve les mesures du moteur seul.

## Architecture

- `src/hash-map.ts` : moteur générique `HashMap<Value>` et listes chaînées.
- `src/cache.ts` : TTL, quotas, persistance, restauration, compteurs et opérations numériques.
- `src/server.ts` : création du serveur HTTP, validation, quotas, routes et erreurs JSON. Chaque serveur possède son propre stockage.
- `src/index.ts` : validation du port et lancement sur l'interface locale.
- `test/hash-map.test.js` : opérations, collisions et seuils de redimensionnement.
- `test/api.test.js` : CRUD HTTP, validation, erreurs et quotas.
- `scripts/benchmark.js` : microbenchmark HashMap ; `scripts/benchmark-http.js` : orchestration HTTP ; `benchmark-support.js` : statistiques/CLI/exports ; `benchmark-worker.js` : serveur isolé.
- `docs/` : audit, mesures et brouillons des livrables pédagogiques.

## Fonctionnement de la HashMap

Chaque case du tableau contient la tête d'une liste `{ key, value, next }`. La fonction de hachage utilise un calcul de type FNV-1a : XOR puis multiplication 32 bits sur chaque unité UTF-16 de la clé (`charCodeAt`). Il ne s'agit donc pas du FNV-1a standard sur octets UTF-8, ni d'un hachage cryptographique. La conversion non signée `>>> 0` garantit un indice positif avant le modulo de la capacité.

`set` parcourt la chaîne : il remplace la valeur si la clé existe, sinon insère en tête. `get` et `has` comparent les clés, ce qui distingue les collisions. `has` permet aussi de distinguer une valeur `undefined` d'une absence dans le moteur générique ; l'API accepte uniquement les valeurs JSON.

`delete` reconnecte le précédent au suivant, ou remplace la tête. Le compteur diminue uniquement si une clé existe. Les entrées supprimées deviennent récupérables par le ramasse-miettes de JavaScript ; la libération effective n'est pas immédiate.

La capacité commence à 16. Une insertion nouvelle dépassant 75 % d'occupation double la capacité. Une suppression passant sous 25 % la divise par deux, sans descendre sous 16. L'écart entre les seuils évite les redimensionnements répétés autour d'un même seuil. `resize` recalcule les indices et réutilise les nœuds : le pointeur `next` est sauvegardé avant de déplacer chaque entrée. Le nombre d'entrées ne change pas. `size` et `capacity` sont des accesseurs en lecture seule.

Pour des clés de longueur bornée et une bonne répartition, recherche, modification et suppression sont en O(1) en moyenne, et insertion en O(1) amorti. Un redimensionnement coûte O(n + capacité), avec recalcul des hachages. Une collision pathologique peut rendre une opération O(n). Le hachage coûte O(longueur de clé). L'espace est O(n + capacité + données), avec deux tableaux momentanément pendant un redimensionnement. Le plafond HTTP borne les clés ; la HashMap seule n'impose pas de quota.

## API REST

| Méthode | Route | Résultat |
|---|---|---|
| POST | `/keys` | Créer `{key,value,ttl?}` : 201 ; doublon : 409 |
| GET | `/keys` | `{keys:[...]}` ; tableau vide si cache vide |
| GET | `/keys/:key` | `{key,value,expiresAt?,ttlRemaining?}` : 200 ou 404 |
| PUT | `/keys/:key` | Modifier `{value,ttl?}` : 200 ou 404 |
| DELETE | `/keys/:key` | Supprimer : 204 ou 404 |
| POST | `/keys/:key/incr` | Ajouter 1 : 200 ou 404 |
| POST | `/keys/:key/decr` | Soustraire 1 : 200 ou 404 |
| GET | `/metrics` | Hits, misses, clés actives, octets, quota, taux de réussite |

POST `/keys` et PUT exigent `Content-Type: application/json`. Les opérations numériques n'exigent pas de corps. Une valeur peut être tout JSON contenant uniquement des nombres finis. Les chaînes numériques, booléens et null ne sont pas convertis par INCR/DECR. Les décimaux sont acceptés ; les résultats hors de ±`Number.MAX_SAFE_INTEGER`, non finis ou inchangés par perte de précision sont refusés (400).

Encoder les clés avec `encodeURIComponent`, notamment `/`, `?`, `#` et les espaces. Les clés sont sensibles à la casse, sans normalisation Unicode. Maximum 1 024 octets UTF-8 ; caractères de contrôle et segments `.` et `..` refusés. Corps limité à 1 MiB. Erreurs JSON `{error:"..."}` : 400 validation, 404 absence/route, 405 méthode avec `Allow`, 409 doublon, 413 taille, 415 média, 507 quota, 500 écriture disque impossible ou erreur interne.

## TTL

`ttl` est une durée positive en **secondes**, fractions acceptées (ex. `0.05`). Le serveur conserve une échéance absolue en millisecondes Unix (`expiresAt`) et renvoie `ttlRemaining` en secondes lorsque la clé expire. Sans TTL à la création, la clé est permanente. PUT sans `ttl` conserve l'échéance ; un nombre la remplace et `null` la retire. INCR/DECR conservent le TTL.

Expiration à l'accès et balayage périodique toutes les secondes ; une clé expirée est immédiatement inaccessible, même entre deux balayages. Liste, métriques et écritures purgent également les expirations et libèrent les quotas. Le nettoyage périodique s'arrête avec le serveur. Une expiration n'incrémente les misses que lors d'un GET individuel.

## Persistance et restauration

`npm start` utilise `data/cache.json`. Exemple : `CACHE_FILE=/tmp/demo-cache.json PORT=3001 npm start`. Le fichier contient une version et les entrées avec échéances absolues ; les octets sont recalculés au rechargement. Chaque mutation réussie écrit un snapshot dans un fichier temporaire voisin, synchronise ce fichier puis le renomme sur la destination. La mémoire n'est modifiée qu'après la sauvegarde ; un échec retourne 500 et conserve la valeur précédente.

Un fichier absent donne un cache vide. Un fichier invalide, illisible ou dépassant les quotas empêche le démarrage sans être écrasé : corriger le fichier ou choisir un autre chemin. Les entrées déjà expirées sont ignorées. Le nettoyage TTL libère la mémoire sans écrire seul sur disque ; les anciennes entrées expirées peuvent subsister dans le dernier snapshot, mais ne sont jamais restaurées comme actives. La prochaine mutation actualise le snapshot.

`createKeyValueServer({maxEntries,maxStorageBytes,persistencePath,cleanupIntervalMs})` permet de configurer une instance. Sans `persistencePath`, elle reste en mémoire (tests et benchmark par défaut). Les limites et l'intervalle sont des entiers positifs sûrs ; l'intervalle est au maximum 2 147 483 647 ms. Un seul processus doit utiliser un fichier donné.

## Métriques et limites

Seuls les GET `/keys/:key` valides comptent : clé active = hit, absente/expirée = miss. CRUD, INCR/DECR, KEYS, nettoyage et consultation des métriques ne changent pas ces compteurs. `hitRate = hits / (hits + misses) × 100`, arrondi à deux décimales, zéro sans lecture. Les compteurs repartent à zéro au redémarrage.

Quotas par défaut : 10 000 clés et 16 MiB de clés UTF-8 + valeurs JSON sérialisées. Ce volume exclut les métadonnées TTL et le surcoût des objets JS ; il ne mesure pas la RAM réelle. Les écritures refusées préservent la valeur et son TTL. Aucune éviction automatique hormis l'expiration.

Le moteur HashMap reste O(1) en moyenne pour une opération individuelle, mais les balayages TTL et KEYS sont linéaires. Les écritures du service balaient les expirations ; avec persistance elles sérialisent aussi tout le cache et bloquent la boucle Node pendant les accès disque synchrones. Cette solution simple convient à la démonstration, pas à une forte charge. Le renommage atomique évite un JSON partiellement remplacé ; aucune garantie de survie à une coupure électrique du répertoire n'est annoncée. Pas de verrou multiprocessus, journal, réplication, authentification ou TLS. Écoute locale uniquement ; 100 connexions maximum, délai requête 15 s, en-têtes 10 s.

## Frontend React

Dans un second terminal :

```bash
npm ci --prefix client
npm --prefix client run dev
```

Ouvrir l'adresse Vite affichée. Le formulaire conserve l'architecture React existante et propose CRUD, liste des clés, INCR/DECR, TTL et métriques, avec le statut HTTP et la réponse JSON. La valeur est du JSON (`123`, `"Alice"`, `{"a":1}`). Laisser le TTL vide pour conserver le comportement par défaut ; saisir `null` pour le retirer. Le TTL affiché dans la réponse est un instantané, pas un compte à rebours.

Le proxy de développement Vite transmet `/keys` et `/metrics` vers `127.0.0.1:3000`. Adapter `client/vite.config.ts` pour un autre port. `npm --prefix client run build` génère `client/dist`. En production, servir ces fichiers et configurer un reverse proxy pour ces deux routes ; `vite preview` ne fournit pas ce déploiement API.

## Tests, benchmarks et démonstration

```bash
npm test
npm --prefix client run build
npm run benchmark
npm run benchmark:hashmap
BENCH_VOLUMES=100,1000 BENCH_CONCURRENCY=1,10 BENCH_REQUESTS=200 npm run benchmark
BENCH_PERSIST=1 BENCH_VOLUMES=100 BENCH_CONCURRENCY=1 BENCH_REQUESTS=100 npm run benchmark
```

Le runner Node conserve les tests initiaux et couvre opérations numériques, TTL court, nettoyage sans requête, quotas, erreurs disque, métriques et redémarrage HTTP. Les tests utilisent des ports éphémères et des fichiers temporaires. Les environnements doivent autoriser les sockets locales. Les fichiers compilés sont générés depuis `src/` par TypeScript strict et exclus de Git.

## Benchmarks HTTP et analyse des latences

Le benchmark démarre automatiquement ses propres serveurs sur `127.0.0.1` et des ports éphémères : aucun serveur existant ni fichier de données utilisateur n'est modifié. Pour lancer l'application normalement : `npm run build && npm start`. L'application peut rester ouverte pendant le benchmark, mais sa charge peut influencer les résultats.

```bash
# Scénario A (par défaut) : 100 requêtes par opération, concurrence 1
npm run benchmark
# Scénario B : 1 000 requêtes par opération, concurrence 10
npm run benchmark -- --scenario medium
# Scénario C : 10 000 requêtes par opération, concurrence 50 (lancement explicite)
npm run benchmark -- --scenario heavy
# Paramètres personnalisés et exports pour la soutenance
npm run benchmark -- --requests 1000 --concurrency 10 --volume 100
npm run benchmark -- --requests 100 --concurrency 1 --mode both --json benchmarks/results/demo.json --csv benchmarks/results/demo.csv
# Restreindre les opérations ou changer le préchauffage
npm run benchmark -- --operations GET,KEYS,METRICS --volume 1000 --warmup 50
npm run benchmark -- --help
```

Les huit opérations sont SET (`POST /keys`), GET, PUT, DELETE, KEYS, INCR (`POST /keys/:key/incr`), DECR (`POST /keys/:key/decr`) et METRICS (`GET /metrics`). `POST` est accepté comme alias CLI de SET. `--requests` est le nombre mesuré **par opération, mode, volume et concurrence**, hors préchauffage. Les valeurs explicites remplacent les paramètres du scénario. Les variables historiques `BENCH_REQUESTS`, `BENCH_CONCURRENCY=1,10`, `BENCH_VOLUMES=100,1000` et `BENCH_PERSIST=1` restent utilisables ; les options CLI correspondantes ont priorité. La concurrence est bornée à 100, comme le plafond de connexions du serveur ; les scénarios proposés utilisent au plus 50. `--timeout` règle le délai client en ms (10 000 par défaut).

Chaque opération possède un **nouveau processus API et son propre jeu de données** : préfixe fixe `bench-cachelab-`, clés numériques, aucun TTL, quotas calculés pour la charge. `--volume` fixe les clés de fond. SET utilise une nouvelle clé par requête ; DELETE prépare une clé distincte par requête et pour le préchauffage ; les autres opérations utilisent des clés déjà présentes. KEYS mesure exactement `volume` clés. `keysBefore` et `keysAfter` indiquent le nombre réel de clés actives pendant chaque série ; SET augmente ce nombre et DELETE le diminue. Le tableau terminal les affiche aussi. Les autres opérations repartent de leur volume de fond initial.

Le préchauffage (20 requêtes par défaut), l'initialisation, les vérifications de nombre de clés et le nettoyage sont exclus des latences et du débit. Un échec de préparation/préchauffage arrête le benchmark avec un message explicite. Les processus et snapshots temporaires sont supprimés en fin d'opération, y compris en cas d'erreur gérée. Aucun scénario élevé ne tourne automatiquement pendant les tests : les intégrations du benchmark utilisent deux requêtes par opération.

L'horloge `performance.now()` couvre l'appel HTTP jusqu'à lecture complète du corps. Le générateur et le serveur ont des boucles d'événements distinctes. Le tableau affiche min/max/moyenne/P50/P95/P99 en **millisecondes**, requêtes, succès, erreurs HTTP (`HTTP`), erreurs réseau/timeout/lecture du corps (`Net`) et débit. Une réponse n'est réussie que si son statut correspond à celui attendu (201 pour SET, 204 pour DELETE, 200 ailleurs). Une erreur mesurée reste dans les latences et le débit ; le processus retourne un code non nul si une série contient des échecs. Des exemples d'erreurs et les statuts sont conservés dans le JSON. Si la vérification finale des clés échoue, les statistiques mesurées sont conservées, `keysAfter` vaut null et le JSON contient `postCheckError` ; le processus retourne également un code non nul. Les colonnes sont arrondies pour l'affichage ; les exports conservent la précision calculée.

Moyenne = somme des latences / nombre de requêtes. Percentiles par **rang supérieur** : trier les N latences et prendre l'élément à l'indice `ceil(p × N) − 1`. P50 est donc la médiane au rang supérieur (pour un N pair, la valeur centrale inférieure, sans interpolation). P95/P99 sont des seuils atteints par au moins 95 %/99 % des échantillons. Avec 100 requêtes, P99 est seulement la 99e valeur : multiplier les passages et augmenter les échantillons avant de conclure. RPS = nombre total de requêtes × 1 000 / durée globale de la phase mesurée ; sous concurrence, ce n'est pas l'inverse de la latence moyenne.

`--mode memory` mesure le cache sans snapshot, `--mode disk` active la persistance JSON réelle avec fsync et renommage, et `--mode both` enchaîne les deux avec la même configuration et des instances fraîches. Les snapshots vivent dans le répertoire temporaire du système : ses caractéristiques (SSD, HDD, tmpfs, conteneur) influencent les mesures et ne garantissent pas un accès à un disque physique. Alterner l'ordre des passages en relançant les modes séparément permet de limiter le biais d'ordre.

Les exports JSON et CSV contiennent date, version Node, OS/CPU, scénario, mode, volumes, concurrence, opérations, préchauffage, nombres de clés, mesures et erreurs. Le JSON ajoute la configuration, les quotas et les détails d'erreurs ; le CSV fournit une ligne par série, avec métadonnées répétées et échappement des virgules/guillemets. Les chemins sont créés si nécessaire, les fichiers de destination existants sont remplacés ; choisir des noms distincts pour JSON et CSV.

Le matériel, les versions de Node, le JIT, le GC, l'ordonnanceur, la charge concurrente, le stockage et le préchauffage font varier les résultats. Ces mesures loopback incluent HTTP, TCP, JSON et le runtime ; elles ne sont pas directement comparables à un accès RAM matériel ou au microbenchmark HashMap. Le service balaie les expirations à l'écriture et réécrit un snapshot complet en mode disque : augmenter fortement le volume peut rendre préparation et mesures coûteuses. Les tests rapides du benchmark sont dans `test/benchmark.test.js` et passent avec `npm test`.

Voir [les résultats actuels et leur interprétation](docs/benchmark-http.md) ainsi que [les mesures historiques](docs/performances.md), [le guide de soutenance et les commandes curl](docs/soutenance.md) et [le compte rendu de finalisation](docs/finalisation.md). Les anciens documents d'audit sont des archives de la reprise précédente ; leurs indications de fonctionnalités absentes ne décrivent plus cette version.
