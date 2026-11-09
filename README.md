# CacheLab

**CacheLab** est un système de cache clé/valeur développé en **Node.js et TypeScript**, dans le cadre de notre Mastère Développement Avancé & DevOps à La Plateforme.

L'objectif est de comprendre le fonctionnement d'un système de cache en mémoire, inspiré de Redis, en développant notre propre structure de données.

Ce projet est réalisé en équipe de trois développeurs.

## 1. Objectif du projet

CacheLab permet de stocker temporairement des informations dans la mémoire RAM afin de les récupérer rapidement sans interroger systématiquement une base de données.

Nous avons développé une table de hachage personnalisée (**HashMap**) et une API REST permettant d'effectuer les opérations CRUD.

Le moteur de stockage n'utilise ni Redis ni la structure `Map` native de JavaScript.

## 2. Technologies utilisées

- **Node.js** : environnement d'exécution JavaScript.
- **TypeScript** : langage utilisé pour le développement.
- **API REST** : communication avec le système de cache.
- **HashMap personnalisée** : stockage des données en mémoire.
- **Git et GitHub** : gestion du code source et collaboration.

## 3. Fonctionnalités développées

Les fonctionnalités principales sont opérationnelles :

| Fonctionnalité | Description |
|---|---|
| Création | Ajouter une paire clé/valeur |
| Lecture | Récupérer la valeur associée à une clé |
| Modification | Modifier une valeur existante |
| Suppression | Supprimer une clé |
| Vérification | Vérifier l'existence d'une clé |
| Redimensionnement | Adapter automatiquement la capacité de la table |

Les quatre opérations CRUD de l'API ont été testées manuellement avec `curl`.

## 4. Fonctionnement de notre HashMap

Nous avons développé notre propre table de hachage en TypeScript.

Elle repose sur un tableau de stockage appelé `buckets`.

Chaque information est représentée par une entrée contenant :

```typescript
type Entry<Value> = {
  key: string;
  value: Value;
  next: Entry<Value> | undefined;
};
```

### Fonction de hachage

Pour déterminer où stocker une clé, nous utilisons une fonction de hachage inspirée de l'algorithme FNV-1a.

Cette fonction transforme une clé en un indice du tableau.

### Gestion des collisions

Deux clés différentes peuvent produire le même indice.

Nous utilisons le **chaînage séparé** pour gérer cette situation.

Chaque emplacement peut contenir une liste chaînée de plusieurs entrées.

### Gestion de la mémoire

La table possède initialement 16 emplacements.

Deux seuils permettent d'adapter sa capacité :

- **75 %** : la capacité est doublée si une nouvelle insertion dépasse ce seuil.
- **25 %** : la capacité peut être divisée par deux après des suppressions.

La capacité ne descend jamais sous 16 emplacements.

### Complexité algorithmique

| Opération | Complexité moyenne |
|---|---|
| Insertion | O(1) amorti |
| Recherche | O(1) |
| Modification | O(1) |
| Suppression | O(1) amorti |
| Redimensionnement | O(n) |

Ces estimations supposent une bonne répartition des clés et une longueur de clé bornée. Dans le pire cas, les opérations de recherche peuvent atteindre O(n).

## 5. Installation du projet

### Prérequis

Il faut disposer de Node.js et npm.

Vérifier les versions :

```bash
node --version
npm --version
```

### Récupérer le projet

Cloner le dépôt de l'équipe :

```bash
git clone https://github.com/Abakar-Issa-Ali/CacheLab.git
```

Entrer dans le dossier :

```bash
cd CacheLab
```

Récupérer la branche contenant le développement backend :

```bash
git fetch origin
git switch --track origin/feature/cache-backend
```

Si la branche existe déjà localement :

```bash
git switch feature/cache-backend
git pull
```

### Installer les dépendances

```bash
npm ci
```

## 6. Démarrer le serveur

Depuis la racine du projet :

```bash
npm run dev
```

Si ce script n'est pas disponible, consulter les scripts définis dans `package.json` :

```bash
npm run
```

Le serveur utilisé lors de nos tests était accessible à l'adresse :

```text
http://localhost:3000
```

**Important :** conserver le terminal du serveur ouvert pendant les tests.

Ouvrir un deuxième terminal pour envoyer les requêtes HTTP.

## 7. Tester l'API avec curl

Les commandes suivantes permettent de vérifier les quatre opérations CRUD.

### Test 1 : Ajouter une clé (POST)

```bash
curl -i -X POST http://localhost:3000/keys \
  -H "Content-Type: application/json" \
  -d '{"key":"nom","value":"Fallou"}'
```

Résultat observé :

```text
HTTP/1.1 201 Created
```

Cela confirme que le serveur a accepté la création.

### Test 2 : Récupérer une valeur (GET)

```bash
curl -i http://localhost:3000/keys/nom
```

Résultat observé :

```json
{
  "key": "nom",
  "value": "Fallou"
}
```

Code HTTP :

```text
200 OK
```

### Test 3 : Modifier une valeur (PUT)

```bash
curl -i -X PUT http://localhost:3000/keys/nom \
  -H "Content-Type: application/json" \
  -d '{"value":"Moussa"}'
```

Vérifier la modification :

```bash
curl -i http://localhost:3000/keys/nom
```

Résultat observé :

```json
{
  "key": "nom",
  "value": "Moussa"
}
```

### Test 4 : Supprimer une clé (DELETE)

```bash
curl -i -X DELETE http://localhost:3000/keys/nom
```

Vérifier ensuite que la clé n'existe plus :

```bash
curl -i http://localhost:3000/keys/nom
```

Résultat attendu :

```text
HTTP/1.1 404 Not Found
```

Les tests CRUD ont été réalisés manuellement. Le code HTTP exact de la suppression doit être vérifié dans l'implémentation.

## 8. Tester plusieurs insertions

Pour tester l'ajout de plusieurs données, ouvrir un terminal pendant que le serveur fonctionne.

Exécuter :

```bash
for i in $(seq 1 100); do
  curl -s -o /dev/null -X POST http://localhost:3000/keys \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"produit-$i\",\"value\":\"valeur-$i\"}"
done
```

Cette commande envoie 100 requêtes de création.

Pour vérifier une donnée :

```bash
curl -i http://localhost:3000/keys/produit-100
```

Résultat attendu :

```json
{
  "key": "produit-100",
  "value": "valeur-100"
}
```

Ce test vérifie la récupération après plusieurs insertions. Il ne constitue pas, à lui seul, un test complet de performance ou de collisions.

## 9. Tests complémentaires à réaliser

Pour valider complètement notre moteur de stockage, nous devons également vérifier :

- Les collisions entre plusieurs clés.
- Le redimensionnement de la HashMap.
- La conservation des données après redimensionnement.
- La suppression dans une liste chaînée.
- Les recherches de clés inexistantes.
- Le comportement avec un grand nombre de données.
- Les temps de réponse.

Ces vérifications permettront de mieux évaluer la fiabilité et les performances de notre implémentation.

## 10. Travail en équipe avec Git

Chaque développeur travaille sur sa propre branche.

Exemple :

```bash
git switch -c feature/nom-fonctionnalite
```

Après modification du code :

```bash
git add .
git commit -m "feat: implement new functionality"
```

Envoyer la branche :

```bash
git push -u origin feature/nom-fonctionnalite
```

Les modifications sont ensuite proposées à l'équipe au moyen d'une Pull Request.

Il est recommandé de faire relire le code avant de le fusionner dans la branche principale.

## 11. État actuel du projet

| Élément | État |
|---|---|
| Structure HashMap | Implémentée |
| Fonction de hachage | Implémentée |
| Gestion des collisions | Implémentée |
| Redimensionnement automatique | Implémenté |
| API REST CRUD | Fonctionnelle |
| Tests manuels CRUD | Réalisés |
| Tests approfondis des algorithmes | À compléter |
| Mesures de performance | À réaliser |

## 12. Équipe

Projet réalisé par trois étudiants en Mastère Développement Avancé & DevOps à La Plateforme.

Les contributions et responsabilités de chaque membre sont suivies sur GitHub.

---

**CacheLab — Projet pédagogique de développement backend et d'algorithmique.**
