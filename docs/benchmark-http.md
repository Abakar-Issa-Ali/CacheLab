# Benchmark HTTP et analyse des latences — 16 novembre 2026

## Résultats actuels : scénario léger

Commande réellement exécutée :

```bash
npm run benchmark -- --scenario light --mode both --json benchmarks/results/light-both.json --csv benchmarks/results/light-both.csv
```

Environnement exporté : Node v22.22.2, linux 6.17.0-35-generic x64, Intel(R) Celeron(R) N5095 @ 2.00GHz. Date UTC de départ : 2026-11-16T21:16:01.971Z. Horloge : performance.now().

100 requêtes mesurées par opération et par mode, concurrence 1, 100 clés de fond, 20 préchauffages. Les **1 600 requêtes ont réussi**, zéro erreur HTTP et zéro erreur réseau. Préparation, préchauffage et nettoyage exclus. Aucun autre test/build du projet n'a été lancé en parallèle de cette série ; la charge globale de la machine n'est pas contrôlée.

[JSON complet](../benchmarks/results/light-both.json) · [CSV complet](../benchmarks/results/light-both.csv)

Toutes les latences sont en millisecondes. Le tableau présente les valeurs arrondies ; les exports conservent la précision calculée.

| Mode | Opération | Clés avant→après | Min | Max | Moyenne | P50 | P95 | P99 | RPS |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
|memory|SET|120→220|1.286|3.898|1.982|1.865|2.828|3.807|502.849|
|memory|GET|100→100|0.724|3.639|1.463|1.372|2.339|2.627|682.067|
|memory|PUT|100→100|1.595|4.960|2.373|2.212|3.540|4.758|420.732|
|memory|DELETE|200→100|0.914|3.584|1.505|1.441|2.161|2.763|663.138|
|memory|KEYS|100→100|0.792|7.408|1.631|1.309|3.039|5.070|611.941|
|memory|INCR|100→100|0.683|4.129|0.920|0.853|1.211|1.366|1084.164|
|memory|DECR|100→100|0.817|8.740|1.479|1.238|2.895|3.359|674.855|
|memory|METRICS|100→100|0.632|4.754|1.191|1.060|1.754|3.615|838.232|
|disk|SET|120→220|1.520|9.742|2.151|1.928|2.765|5.499|464.339|
|disk|GET|100→100|0.681|3.737|1.040|0.998|1.480|1.619|958.877|
|disk|PUT|100→100|1.466|6.308|1.947|1.753|2.876|4.710|513.056|
|disk|DELETE|200→100|0.877|4.204|1.345|1.234|2.041|2.734|742.486|
|disk|KEYS|100→100|0.569|3.869|1.214|1.199|1.743|3.409|821.995|
|disk|INCR|100→100|1.120|6.920|1.677|1.444|2.629|5.101|595.270|
|disk|DECR|100→100|0.981|5.359|1.397|1.280|1.914|3.241|714.233|
|disk|METRICS|100→100|0.526|2.320|0.751|0.677|1.049|1.936|1327.222|

## Lire les résultats

Une instance fraîche est créée pour chaque opération. Le préfixe de clés est stable (`bench-cachelab-`), sans TTL. SET est le POST existant ; chaque insertion est unique. DELETE a ses propres clés préparées et ne mesure pas des suppressions répétées en 404. PUT/INCR/DECR utilisent une clé numérique existante ; leurs requêtes restent valides sous concurrence. KEYS mesure exactement 100 clés dans cette série, contrairement à l'ancien script où les opérations successives partageaient une instance.

Les quotas sont calculés pour contenir volume + requêtes + préchauffage, et 256 octets sérialisés par entrée possible : nos clés courtes et valeurs numériques restent très en dessous. Les données ne sont jamais ajoutées à une instance utilisateur. Le serveur est un vrai processus Node séparé, joint par TCP loopback ; ses propres timers TTL sont conservés.

Le chronomètre haute résolution couvre l'appel HTTP, la sérialisation du petit corps éventuel et la réception complète de la réponse. Le temps global comprend l'ordonnancement du générateur pendant la phase mesurée ; le débit est N × 1000 / durée globale en ms. Les erreurs sont incluses dans latences et débit et décomptées séparément. Les réponses HTTP sont contrôlées par statut attendu ; les erreurs réseau, timeouts et lectures tronquées forment une catégorie distincte. Un échec de préparation arrête l'exécution plutôt que de produire une série supposée valide.

Percentiles par rang supérieur : trier les N latences, puis indice `ceil(p × N) − 1`. P50 utilise donc la valeur centrale inférieure pour N pair ; P95 et P99 donnent le seuil atteint par au moins 95 % et 99 % des mesures. Une série de 100 points est insuffisante pour caractériser précisément une queue de distribution. Répéter les mesures et observer les distributions avant de définir un objectif de performance.

## RAM, disque, HashMap et HTTP

La [référence du professeur, publiée par jboner](https://gist.github.com/jboner/2841832), consultée le 16 novembre 2026, donne des ordres de grandeur historiques : environ 100 ns pour une référence en mémoire principale (0,0001 ms), 150 µs pour une lecture aléatoire SSD de 4 KiB (0,15 ms) et 10 ms pour un déplacement de tête de disque. Ces chiffres concernent des opérations matérielles différentes ; ce ne sont pas des objectifs de latence HTTP.

Une opération de notre HashMap exécute du JavaScript : hachage de caractères, indice de bucket et parcours éventuel d'une chaîne. Elle n'est pas un unique accès RAM. La complexité moyenne O(1) du moteur ne donne pas un nombre de nanosecondes et n'englobe ni balayage TTL, ni JSON, ni HTTP.

Une requête locale ajoute le client fetch, TCP, les buffers, le parseur HTTP, l'ordonnancement des deux processus, la logique du cache, la sérialisation et la lecture du corps. KEYS renvoie une liste dont la taille dépend du volume ; METRICS effectue un nettoyage avant de lire les compteurs. Ces opérations ont des coûts distincts des GET individuels.

Une écriture HTTP avec persistance ajoute la sérialisation de tout le snapshot, une écriture temporaire, fsync et un renommage, de façon synchrone dans le processus API. Les mesures dépendent donc du nombre de clés et du système de fichiers. Les snapshots utilisent le répertoire temporaire de la machine ; il peut être sur SSD, HDD, tmpfs ou dans un conteneur. Le mode nommé disk désigne la persistance fichier réelle du projet, pas la garantie de mesurer une latence de disque physique isolée.

Certaines moyennes sont plus faibles en mode disk dans ce passage. GET/KEYS/METRICS n'écrivent pas sur disque. Les variations entre processus, le JIT, le GC, les caches système et l'ordre mémoire puis disque suffisent à rendre cette courte comparaison bruitée. Même des écritures peuvent paraître plus rapides dans ce passage ; aucune conclusion d'accélération par la persistance n'est justifiée. Pour une comparaison plus robuste, répéter des séries mémoire/disque en alternant leur ordre, à paramètres et charge machine identiques.

## Commandes de soutenance et limites

```bash
npm run build
npm test
npm run benchmark -- --requests 100 --concurrency 1 --mode both --json /tmp/demo.json --csv /tmp/demo.csv
npm run benchmark -- --requests 1000 --concurrency 10 --operations GET,KEYS,METRICS
npm run benchmark -- --scenario heavy --mode memory
npm run benchmark:hashmap
```

La charge élevée reste explicite : 10 000 requêtes par opération, concurrence 50. La préparation de DELETE nécessite des milliers d'écritures, et les snapshots complets rendent le mode disque potentiellement lent avant même la mesure. Les tests automatisés n'exécutent que des micro-scénarios HTTP de deux requêtes. Aucun résultat moyen/élevé ne doit être déduit des chiffres du scénario léger.

Aucune dépendance ni route API ajoutée. Les scripts npm existants sont conservés. Les exports sont écrits en fin d'exécution ; une interruption brutale peut empêcher leur génération. Les fichiers de destination existants sont remplacés. Le benchmark ne mesure pas l'occupation CPU/RAM, n'imite pas un réseau distant, ne garantit pas un débit de production et ne fournit pas d'intervalle de confiance.

## Vérification supplémentaire de la concurrence

Commande exécutée après les tests, sans autre build/test du projet en parallèle :

```bash
npm run benchmark -- --requests 20 --concurrency 10 --volume 10 --mode both --json benchmarks/results/concurrency-smoke.json --csv benchmarks/results/concurrency-smoke.csv
```

320 requêtes réussies, zéro erreur. Ce passage vérifie le fonctionnement concurrent ; ses 20 points par opération ne constituent pas une caractérisation fiable du P99 (ici il coïncide avec le maximum). Il ne correspond pas au scénario moyen complet de 1 000 requêtes. [JSON](../benchmarks/results/concurrency-smoke.json) · [CSV](../benchmarks/results/concurrency-smoke.csv).

| Mode | Opération | Moyenne ms | P95 ms | RPS |
|---|---|---:|---:|---:|
|memory|SET|20.026|29.362|436.203|
|memory|GET|9.519|13.331|782.972|
|memory|PUT|13.355|20.055|645.585|
|memory|DELETE|7.965|12.609|1005.512|
|memory|KEYS|9.560|13.067|856.591|
|memory|INCR|9.213|13.719|799.592|
|memory|DECR|7.809|12.182|1017.088|
|memory|METRICS|7.254|11.679|1120.842|
|disk|SET|13.751|21.993|638.793|
|disk|GET|9.168|15.992|913.921|
|disk|PUT|12.406|22.487|715.180|
|disk|DELETE|7.138|12.604|1089.107|
|disk|KEYS|7.164|10.890|1147.361|
|disk|INCR|11.531|19.187|683.845|
|disk|DECR|8.730|14.168|943.486|
|disk|METRICS|6.630|11.489|1249.140|

## Microbenchmark HashMap rejoué

`npm run benchmark:hashmap` a été exécuté séparément après les mesures HTTP. Même matériel et version de Node, 5 échauffements puis médiane de 21 passages. Durées totales pour toutes les clés ; aucune requête HTTP ni sauvegarde fichier.

| Clés | Insertion totale ms | Recherche totale ms |
|---:|---:|---:|
|100|0,0831|0,0248|
|1000|0,3302|0,1523|
|10000|3,9827|1,9062|

Diviser une durée totale par le nombre de clés donne un coût amorti dans ce microbenchmark, pas la latence individuelle instrumentée de chaque opération. Les redimensionnements sont inclus dans l'insertion. Les écarts avec HTTP illustrent le coût de la chaîne complète de traitement ; ce ne sont pas des rapports universels de vitesse.

## Vérification de la mission

- `npm run build` : réussi.
- `npm test` : **37 tests réussis, 0 échec**, dont les 26 préexistants et 11 tests du benchmark ; aucun test ignoré.
- CLI : aide, scénarios, remplacements de paramètres, variables historiques, valeurs invalides et code de sortie vérifiés.
- Statistiques : moyenne, min/max, P50/P95/P99 et débit vérifiés sur un jeu connu.
- Erreurs : statuts inattendus, connexion refusée, timeout et erreur de lecture du corps testés ; compteurs séparés et concurrence bornée vérifiés.
- Exports : génération JSON/CSV, métadonnées, échappement CSV et cohérence des quatre fichiers réellement produits vérifiés.
- Mesures HTTP : **1 920 succès et 0 échec** sur les deux passages, hors préparation/préchauffage.
- `benchmark:hashmap` et `git diff --check` exécutés.

Fichiers créés : `scripts/benchmark-support.js`, `scripts/benchmark-worker.js`, `test/benchmark.test.js`, ce document et les quatre exports dans `benchmarks/results/`. Fichiers modifiés pour cette mission : `scripts/benchmark-http.js` et `README.md`. Aucun fichier source du moteur, du serveur ou du frontend n'est modifié par cette mission ; aucun fichier dist n'est édité directement. Le script npm benchmark existant transmet déjà les arguments au script après compilation et a été conservé, ainsi que tous les autres scripts.

Branche dédiée : `feature/http-benchmark-analysis`. Aucun push ni fusion. Les scénarios moyen et élevé sont configurés et leur validation CLI est testée ; ils n'ont pas été exécutés intégralement dans cette mission, qui demandait une petite charge réelle. Toutes les fonctionnalités demandées sont intégrées ; les limites de mesure et les scénarios non mesurés sont explicités ci-dessus.
