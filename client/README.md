# CacheLab — client React

Depuis la racine, démarrer le backend avec `npm run build && npm start`, puis :

```bash
npm ci --prefix client
npm --prefix client run dev
npm --prefix client run build
```

Le formulaire propose CRUD, KEYS, INCR, DECR et métriques. Les valeurs sont du JSON ; le TTL facultatif est en secondes, ou `null` pour le retirer. Le code HTTP et le corps JSON sont affichés. Le proxy Vite de développement transmet `/keys` et `/metrics` à `127.0.0.1:3000` ; adapter vite.config.ts si nécessaire. Le build produit client/dist ; son hébergement nécessite un reverse proxy API. Voir le README principal pour les limites et la démonstration.
