# Mesures du moteur — 15 novembre 2026

Commande réellement exécutée : `npm run benchmark`.
Environnement rapporté : Node v22.22.2, Linux x64, Intel Celeron N5095 @ 2.00GHz.

| Clés | Insertion totale médiane (ms) | Recherche totale médiane (ms) |
|---:|---:|---:|
| 100 | 0,0890 | 0,0271 |
| 1 000 | 0,3350 | 0,1637 |
| 10 000 | 3,7365 | 1,8883 |

Le script préconstruit des clés distinctes, effectue cinq passages d'échauffement puis vingt et un passages mesurés sur des HashMap neuves. Chaque passage insère puis lit toutes les clés ; le nombre d'entrées et la somme des valeurs lues sont vérifiés hors du chronométrage. Chaque colonne donne la médiane de ses mesures, avec redimensionnements inclus dans l'insertion.

Ce microbenchmark local ne mesure ni HTTP, ni quotas, ni latence réseau, ni consommation de mémoire. JIT, ramasse-miettes, charge machine et faible durée des petits essais influencent les résultats. Les valeurs ne constituent ni une garantie de débit ni une preuve de complexité, et ne couvrent pas les collisions adversariales. Relancer la commande pour comparer dans un environnement identique.
