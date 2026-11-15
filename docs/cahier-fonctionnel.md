# Cahier des charges fonctionnel — brouillon à valider

Objectif : cache clé/valeur en mémoire, manipulé par API REST, réalisé par trois étudiants. Cette description reflète le code et la demande de reprise ; elle doit être confrontée au PDF officiel.

| Besoin | Critère d'acceptation |
|---|---|
| Créer | POST /keys avec key et value : 201 ; doublon : 409 |
| Lire | GET /keys/:key : 200 et valeur ; absente : 404 |
| Modifier | PUT /keys/:key avec value : 200 ; absente : 404 |
| Supprimer | DELETE /keys/:key : 204 ; absente : 404 |
| Refuser les entrées invalides | Erreur JSON explicite 400, 413 ou 415 |
| Borner le stockage | 507 si quota dépassé, données existantes conservées |
| Vérifier le moteur | Tests automatisés de CRUD, collisions et redimensionnements |

Valeurs JSON, y compris null, false, zéro et chaîne vide, acceptées. Pas de liste globale obligatoire, persistance, TTL ou authentification implémentée. Périmètre complémentaire, utilisateurs cibles détaillés et validation finale : à confirmer par l'équipe avec le sujet.
