# Audit et bilan de reprise — 15 novembre 2026

Avant modification : branche `feature/cache-backend`, dépôt propre, aucun changement existant écrasé. Aucun fichier supprimé, aucun commit ni push effectué.

## Ce qui fonctionnait

Le moteur manuel stockait déjà les données sans `Map` ni bibliothèque externe. Les listes chaînées, mises à jour, suppressions, hachage non signé, seuils de charge et réinsertions lors des redimensionnements étaient corrects. Les responsabilités étaient déjà séparées entre moteur, serveur et lancement. Les quatre endpoints, doublons, valeurs nulles, erreurs JSON et restriction à l'interface locale existaient. Aucune réécriture du moteur ou changement de framework n'était nécessaire.

La compilation et les quatre tests initiaux ont passé après autorisation des sockets locales ; le premier lancement dans le bac à sable avait échoué avec `listen EPERM`, sans défaut applicatif identifié.

## Problèmes traités

- Le volume cumulé du cache était illimité : ajout de plafonds en nombre d'entrées et octets sérialisés, avec refus atomique et libération du quota après suppression/remplacement.
- Les clés n'avaient pas de limite explicite ; ajout de validation partagée entre création et routes individuelles.
- Le type de contenu n'était pas contrôlé : ajout du statut 415.
- Le lecteur utilisait une itération susceptible de détruire le flux lors du dépassement de taille : conservation du flux lors de la sortie de l'itérateur, drainage et fermeture de la connexion après réponse 413. Le JSON d'erreur est vérifié par intégration.
- Délais HTTP et plafond de connexions rendus explicites.
- Les tests initiaux ne prouvaient pas la collision ni la réduction effective de capacité : ajout de collisions vérifiées, suppression aux trois positions, lecture de la capacité et vérification des seuils exacts.
- Ajout des cas de validation, valeurs JSON falsy, clés encodées, méthodes, quotas et configuration invalide.
- README initial trop succinct : installation, algorithmes, complexités, API, limites et documentation pédagogique ajoutés.

## Vérification et limites

Validation réellement exécutée : `npm test` compile TypeScript et passe 15 tests (7 tests moteur et 8 tests API/configuration), sans échec ni test ignoré. `npm run benchmark` a également compilé puis mesuré les trois volumes ; résultats dans `performances.md`. `git diff --check` ne signale aucune erreur d'espacement. Les limites de mémoire sont des quotas de données sérialisées, pas des mesures de heap. Le hachage déterministe n'empêche pas des collisions construites volontairement. L'accès distant sécurisé et les fonctions Redis avancées ne sont pas réalisés.

Le PDF officiel n'a été trouvé ni dans le dépôt ni dans les emplacements Documents et pièces jointes examinés. Les trois livrables pédagogiques absents ont été ajoutés comme brouillons à valider ; la conformité exhaustive au sujet ne peut être certifiée sans celui-ci.

## Découpage de commits proposé

1. `fix(api): bound cache storage and validate request payloads`
2. `test(cache): cover collisions resizing and HTTP failure cases`
3. `perf(cache): add repeatable insertion and lookup benchmark`
4. `docs: explain cache algorithms API and project deliverables`

Propositions uniquement : aucun commit ni push automatique.
