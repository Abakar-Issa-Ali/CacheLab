import { createCacheLabServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
const server = createCacheLabServer();

server.listen(port, () => {
  console.log(`Serveur CacheLab démarré sur http://localhost:${port}`);
});