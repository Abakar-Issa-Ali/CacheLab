# CacheLab — Client Web

Interface React + TypeScript pour tester l'API REST CacheLab.

## Démarrage

Démarrer d'abord le serveur backend CacheLab sur le port `3000`.

Puis, dans ce dossier :

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée par Vite (généralement http://localhost:5173).

## Fonctionnalités

- POST `/keys` : créer une clé/valeur
- GET `/keys/:key` : lire une valeur
- PUT `/keys/:key` : modifier une valeur
- DELETE `/keys/:key` : supprimer une clé
- Historique local des requêtes et affichage des réponses HTTP

La valeur est saisie au format JSON : `"Fallou"`, `123`, `true`, ou `{"prix": 100}`.

Le proxy Vite redirige `/keys` vers `http://localhost:3000` pendant le développement. Si le backend utilise un autre port, modifier `vite.config.ts`.

Ce client est un outil de démonstration complémentaire ; le moteur de cache reste dans le backend.
