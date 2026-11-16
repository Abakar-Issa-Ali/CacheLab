const { createKeyValueServer } = require("../dist/src/server");
const options = JSON.parse(process.env.CACHELAB_BENCH_OPTIONS);
const server = createKeyValueServer(options);
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.listen(0, "127.0.0.1", () =>
  process.send({ port: server.address().port }),
);
function stop() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on("message", stop);
process.on("disconnect", stop);
process.on("SIGTERM", stop);
