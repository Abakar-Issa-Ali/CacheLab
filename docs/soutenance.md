# Préparation de la soutenance

## Expliquer le moteur

Nous avons choisi une HashMap pour retrouver une valeur directement à partir d'une clé, sans parcourir toutes les entrées. Notre stockage principal est un tableau de listes chaînées, jamais un Map JavaScript.

Le hachage, de type FNV-1a, commence à 0x811c9dc5. Pour chaque unité UTF-16, XOR puis multiplication par 0x01000193 avec Math.imul ; conversion non signée et modulo de la capacité. Il est déterministe, non cryptographique, et ne correspond pas exactement au FNV standard sur octets UTF-8.

Deux clés peuvent obtenir le même indice : c'est une collision. Le chaînage conserve ces clés dans une liste du bucket et compare leurs chaînes. Il simplifie insertion et suppression sans cases « supprimées » du sondage ouvert. Il coûte des nœuds et des pointeurs supplémentaires.

Avec des clés bornées et bien réparties, les chaînes restent courtes : recherche, mise à jour et suppression O(1) en moyenne ; insertion O(1) amorti. Dans le pire cas toutes les clés entrent dans une chaîne : O(n). Le hachage lui-même dépend de la longueur de la clé.

Le load factor est le nombre d'entrées divisé par le nombre de buckets. Au-delà de 0,75, la capacité double ; sous 0,25, elle diminue de moitié, minimum 16. Chaque clé est rehachée car le modulo change. Ce passage coûte O(n + capacité). Les deux seuils limitent les oscillations. Les tests vérifient collisions, seuils et conservation des valeurs.

## Expliquer les fonctions du service

TTL : échéance absolue, vérifiée à la lecture et par un timer. Une entrée expirée libère sa place et ses octets. PUT conserve l'échéance sauf TTL explicite ; INCR/DECR la conservent toujours. La RAM est rapide mais volatile ; le disque garde les données après arrêt.

Persistance : snapshot JSON écrit dans un fichier temporaire, synchronisé puis renommé. La mutation mémoire suit la réussite disque. Un fichier invalide bloque le démarrage pour éviter sa destruction silencieuse. Le rechargement ignore les expirations passées. Limites : réécriture complète, disque synchrone, un seul processus, pas de journal ni de réplication, pas de garantie absolue contre les coupures électriques.

Métriques : uniquement les lectures GET individuelles alimentent hits et misses. Une expiration lue compte comme miss. Le taux est hits/(hits+misses), et non la proportion de toutes les requêtes HTTP réussies. Les octets mesurent les données sérialisées, pas toute la RAM. Les compteurs sont remis à zéro au redémarrage.

## Expliquer les performances

Le générateur et le serveur sont deux processus locaux distincts. Préparation des données, 20 échauffements par opération, puis requêtes avec concurrence bornée. Le chronomètre couvre fetch jusqu'à consommation complète du corps. Les statuts sont contrôlés. P50 est la médiane ; P95 et P99 décrivent les requêtes lentes. Le débit est calculé sur le temps global, pas comme l'inverse de la moyenne sous concurrence.

La HashMap moyenne O(1) ne rend pas toute l'API O(1) : nettoyage TTL linéaire, sérialisation JSON, liste des clés et snapshots ajoutent du travail. Le réseau local, HTTP, ordonnanceur, runtime et GC expliquent l'écart avec un accès mémoire matériel. Les chiffres de référence du professeur sont des ordres de grandeur d'opérations différentes, pas un objectif imposé à notre API. Voir performances.md pour les mesures réelles et la référence.

## Démonstration reproductible

Terminal 1, depuis la racine :

```bash
npm ci
npm run build
CACHE_FILE=/tmp/cachelab-soutenance.json npm start
```

Choisir un fichier neuf ou conserver volontairement celui d'une séance précédente. Terminal 2 :

```bash
npm ci --prefix client
npm --prefix client run dev
```

Terminal 3 (clés distinctes d'une exécution à l'autre si nécessaire) :

```bash
curl -i -X POST localhost:3000/keys -H 'Content-Type: application/json' -d '{"key":"compteur","value":10}'
curl -i -X POST localhost:3000/keys/compteur/incr
curl -i -X POST localhost:3000/keys/compteur/decr
curl -i -X PUT localhost:3000/keys/compteur -H 'Content-Type: application/json' -d '{"value":42}'
curl -i localhost:3000/keys/compteur
curl -i localhost:3000/keys/absente
curl -i localhost:3000/metrics
curl -i -X POST localhost:3000/keys -H 'Content-Type: application/json' -d '{"key":"temporaire","value":"bonjour","ttl":1}'
sleep 2
curl -i localhost:3000/keys/temporaire
curl -i localhost:3000/keys
```

Arrêter le serveur avec Ctrl-C puis relancer exactement la même commande CACHE_FILE. Lire `compteur` : 42 est conservé, `temporaire` est absent. Afficher les métriques (compteurs remis à zéro avant les nouvelles lectures), puis :

```bash
curl -i -X DELETE localhost:3000/keys/compteur
npm test
npm run benchmark
```

Montrer aussi dans le client une valeur texte puis INCR pour expliquer l'erreur 400, et une clé absente pour l'erreur 404. Le frontend affiche le code HTTP et le JSON, TTL restant inclus pour une clé temporaire encore active.
