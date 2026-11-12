const SERVER_URL = process.env.CACHELAB_URL ?? "http://localhost:3000";
const message = process.argv[2] ?? "Hi server";

async function main() {
  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: message,
    });

    console.log(`Status : ${response.status}`);
    console.log("server response:", await response.json());
  } catch {
    console.error(`Server unavailable at ${SERVER_URL}. Is it running (npm start) ?`);
  }
}

main();