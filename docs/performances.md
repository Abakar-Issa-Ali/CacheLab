# Mesures HTTP — 16 novembre 2026

Commande exécutée : `npm run benchmark`. Node v22.22.2, Linux x64, Intel Celeron N5095 @ 2.00GHz. Serveur séparé du générateur, loopback, sans persistance pour cette série. 20 échauffements et 200 requêtes mesurées par ligne. Volumes initiaux 100/1000 ; concurrences 1/10. Les scénarios successifs partagent leurs données : POST augmente le volume et DELETE utilise des clés supplémentaires préparées hors mesure.

Toutes les 5 600 requêtes mesurées ont obtenu le statut attendu (zéro échec). Les échantillons sont courts et le JIT/la charge peuvent expliquer qu'un volume supérieur ait une latence inférieure : ceci ne prouve pas une accélération avec le volume. Les résultats bruts sont conservés dans [benchmark-http.jsonl](benchmark-http.jsonl).

| Clés initiales | Concurrence | Opération | Moy. ms | Min | Max | P50 | P95 | P99 | req/s |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 | GET | 1.895 | 0.786 | 9.723 | 1.616 | 4.565 | 7.493 | 526.774 |
| 100 | 1 | POST | 2.211 | 1.237 | 7.718 | 2.056 | 3.586 | 5.254 | 451.785 |
| 100 | 1 | PUT | 1.807 | 1.132 | 5.863 | 1.622 | 2.81 | 4.921 | 552.978 |
| 100 | 1 | KEYS | 1.444 | 0.769 | 8.293 | 1.349 | 1.969 | 2.571 | 691.865 |
| 100 | 1 | INCR | 1.227 | 0.691 | 4.897 | 1.128 | 1.947 | 2.57 | 814.466 |
| 100 | 1 | DECR | 1.064 | 0.647 | 6.449 | 0.943 | 1.611 | 2.938 | 939.08 |
| 100 | 1 | DELETE | 1.232 | 0.587 | 8.47 | 1.227 | 1.698 | 2.162 | 810.991 |
| 100 | 10 | GET | 9.602 | 4.261 | 30.485 | 8.208 | 17.728 | 29.119 | 1021.156 |
| 100 | 10 | POST | 11.335 | 2.986 | 20.547 | 10.938 | 17.386 | 19.805 | 873.842 |
| 100 | 10 | PUT | 10.758 | 4.29 | 23.791 | 9.731 | 15.862 | 21.592 | 914.996 |
| 100 | 10 | KEYS | 6.121 | 2.46 | 8.856 | 5.935 | 8.299 | 8.68 | 1602.761 |
| 100 | 10 | INCR | 6.382 | 2.122 | 9.993 | 6.378 | 9.155 | 9.915 | 1545.819 |
| 100 | 10 | DECR | 6.702 | 1.787 | 13.593 | 6.134 | 11.72 | 13.168 | 1474.998 |
| 100 | 10 | DELETE | 3.902 | 1.266 | 6.248 | 3.667 | 5.717 | 6.091 | 2519.422 |
| 1000 | 1 | GET | 0.686 | 0.42 | 7.27 | 0.573 | 1.203 | 1.58 | 1454.587 |
| 1000 | 1 | POST | 1.46 | 0.963 | 6.19 | 1.345 | 2.061 | 2.888 | 684.445 |
| 1000 | 1 | PUT | 1.654 | 0.941 | 11.809 | 1.468 | 2.556 | 5.79 | 604.306 |
| 1000 | 1 | KEYS | 1.196 | 0.711 | 4.776 | 1.032 | 2.213 | 2.97 | 835.485 |
| 1000 | 1 | INCR | 1.239 | 0.603 | 15.618 | 1.044 | 2.011 | 3.299 | 806.628 |
| 1000 | 1 | DECR | 0.882 | 0.587 | 4.421 | 0.776 | 1.353 | 1.496 | 1131.888 |
| 1000 | 1 | DELETE | 0.719 | 0.308 | 5.514 | 0.668 | 1.188 | 1.585 | 1389.099 |
| 1000 | 10 | GET | 5.71 | 1.515 | 14.936 | 4.569 | 11.992 | 12.88 | 1731.146 |
| 1000 | 10 | POST | 6.677 | 2.129 | 12.105 | 6.532 | 9.444 | 11.865 | 1484.701 |
| 1000 | 10 | PUT | 6.991 | 2.907 | 12.553 | 6.679 | 10.874 | 12.492 | 1406.365 |
| 1000 | 10 | KEYS | 4.992 | 1.934 | 15.159 | 4.086 | 9.277 | 11.889 | 1911.323 |
| 1000 | 10 | INCR | 5.146 | 1.37 | 14.278 | 4.227 | 10.687 | 13.829 | 1919.542 |
| 1000 | 10 | DECR | 4.629 | 1.314 | 9.153 | 4.376 | 8.33 | 9.026 | 2130.359 |
| 1000 | 10 | DELETE | 3.672 | 1.132 | 8.157 | 3.329 | 5.957 | 8.045 | 2673.044 |

La durée couvre une réponse HTTP complète, y compris consommation du corps ; le débit utilise le temps global. Les percentiles utilisent le rang supérieur. Les requêtes échouées sont incluses dans latences et débit, mais décomptées séparément. Les 200 points limitent la précision du P99. Ne pas utiliser ces chiffres comme SLA.

## Comparaison aux ordres de grandeur

La [référence de jboner / Jeff Dean](https://gist.github.com/jboner/2841832), consultée le 16 novembre 2026, indique notamment environ 100 ns pour une référence en mémoire principale, 150 µs pour une lecture aléatoire SSD de 4 KiB, et 10 ms pour un déplacement de tête disque. Ce sont des opérations et matériels différents, pas des objectifs HTTP. Notre GET passe par fetch, TCP loopback, le parseur HTTP, le hachage, le runtime JS, la sérialisation JSON et l'ordonnancement de deux processus. Comparer directement sa durée à un unique accès RAM serait trompeur.

La persistance ajoute une sérialisation complète, une écriture de fichier et un fsync. La série principale ne mesure pas ce coût. Pour le mesurer séparément : `BENCH_PERSIST=1 BENCH_VOLUMES=100 BENCH_CONCURRENCY=1 BENCH_REQUESTS=100 npm run benchmark`. Les balayages TTL et snapshots rendent les écritures du service linéaires, indépendamment de la complexité moyenne du moteur HashMap.

Le microbenchmark historique du moteur reste disponible avec `npm run benchmark:hashmap`. Il exclut HTTP et disque et ne remplace donc pas les mesures ci-dessus.

## Série avec persistance réellement exécutée

Commande : `BENCH_PERSIST=1 BENCH_VOLUMES=100 BENCH_CONCURRENCY=1 BENCH_REQUESTS=100 npm run benchmark`. Même machine ; 20 échauffements puis 100 mesures par opération, soit 700 réussites et zéro échec. Cette série a été lancée pendant les vérifications de build/tests : elle documente le comportement disque mais ne constitue pas une comparaison contrôlée isolant uniquement le coût disque. [Résultats bruts](benchmark-disk.jsonl).

| Opération | Moy. ms | P95 ms | P99 ms | req/s |
|---|---:|---:|---:|---:|
| GET | 3.232 | 7.515 | 8.725 | 308.668 |
| POST | 3.798 | 6.48 | 8.552 | 262.935 |
| PUT | 3.731 | 7.264 | 11.388 | 267.601 |
| KEYS | 1.831 | 2.28 | 2.655 | 545.529 |
| INCR | 2.523 | 4.291 | 7.584 | 396.086 |
| DECR | 3.061 | 5.205 | 7.614 | 326.5 |
| DELETE | 1.935 | 2.769 | 4.707 | 516.393 |

## Microbenchmark HashMap rejoué

`npm run benchmark:hashmap` : 5 échauffements et médiane de 21 passages, durées totales pour toutes les clés (pas par accès).

| Clés | Insertion ms | Recherche ms |
|---:|---:|---:|
|100|0,0893|0,0266|
|1000|0,3641|0,1688|
|10000|4,2443|2,0943|
