# Cahier des charges techniques — brouillon à valider

Implémentation observée : Node.js >= 22, TypeScript strict, modules CommonJS et HTTP natif. Aucun paquet d'exécution. Le moteur générique utilise un tableau de buckets et des listes simplement chaînées, sans Map ni cache externe.

Hachage de type FNV-1a sur unités UTF-16, indice non signé modulo capacité, capacité initiale 16, croissance au-delà de 75 %, réduction sous 25 %, minimum 16. Les nœuds sont réutilisés au redimensionnement. Détails et complexités : README.

Le serveur possède le stockage et sa comptabilité de volume. Les quotas par défaut sont 10 000 entrées, 16 MiB sérialisés, clés de 1 024 octets et requêtes de 1 MiB. Erreurs JSON, validation du média, délais et écoute locale encadrent le MVP ; le plafond de RAM réel n'est pas garanti.

Validation : compilation TypeScript, tests Node unitaires/intégration et benchmark reproductible. Déploiement distant, authentification, persistance, contraintes d'infrastructure et critères supplémentaires du professeur : à définir ou confirmer, sans engagement implicite dans ce brouillon.
