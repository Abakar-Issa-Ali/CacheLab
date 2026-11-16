const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createKeyValueServer } = require("../dist/src/server.js");

const server = createKeyValueServer();
let baseUrl;

// ==========================================
// DÉMARRAGE DU SERVEUR AVANT LES TESTS
// ==========================================

before(async () => {
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", resolve)
  );

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

// ==========================================
// ARRÊT DU SERVEUR APRÈS LES TESTS
// ==========================================

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) =>
      error ? reject(error) : resolve()
    );
  });
});

// ==========================================
// TEST 1 : CRUD COMPLET
// ==========================================

test("POST, GET, PUT, and DELETE /keys perform the CRUD lifecycle", async () => {
  const created = await fetch(`${baseUrl}/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: "session:1",
      value: { user: "Alice" }
    }),
  });

  assert.equal(created.status, 201);

  assert.deepEqual(await created.json(), {
    key: "session:1",
    value: { user: "Alice" },
  });

  const read = await fetch(`${baseUrl}/keys/session%3A1`);

  assert.equal(read.status, 200);

  assert.deepEqual(await read.json(), {
    key: "session:1",
    value: { user: "Alice" },
  });

  const updated = await fetch(`${baseUrl}/keys/session%3A1`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "active" }),
  });

  assert.equal(updated.status, 200);

  assert.deepEqual(await updated.json(), {
    key: "session:1",
    value: "active"
  });

  const deleted = await fetch(`${baseUrl}/keys/session%3A1`, {
    method: "DELETE"
  });

  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), "");

  const missing = await fetch(`${baseUrl}/keys/session%3A1`);
  assert.equal(missing.status, 404);

  const missingDelete = await fetch(
    `${baseUrl}/keys/session%3A1`,
    { method: "DELETE" }
  );

  assert.equal(missingDelete.status, 404);
});

// ==========================================
// TEST 2 : DOUBLONS ET REQUÊTES INVALIDES
// ==========================================

test("reports duplicate creates, missing updates, and invalid request bodies", async () => {
  const createRequest = () =>
    fetch(`${baseUrl}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "duplicate",
        value: null
      }),
    });

  assert.equal((await createRequest()).status, 201);
  assert.equal((await createRequest()).status, 409);

  const missingUpdate = await fetch(`${baseUrl}/keys/absent`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "value" }),
  });

  assert.equal(missingUpdate.status, 404);

  const invalidBody = await fetch(`${baseUrl}/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(invalidBody.status, 400);
});

// ==========================================
// FONCTION UTILITAIRE
// ==========================================

function jsonRequest(method, body) {
  return {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

// ==========================================
// TEST 3 : VALIDATION DES CLÉS
// ==========================================

test("rejects invalid keys, malformed paths, bodies and media types", async () => {
  for (const body of [
    null,
    [],
    {},
    { key: "", value: 1 },
    { key: 1, value: 1 },
    { key: "missing-value" },
    { key: "é".repeat(513), value: 1 },
    { key: "control\n", value: 1 },
    { key: "..", value: 1 }
  ]) {
    assert.equal(
      (await fetch(
        `${baseUrl}/keys`,
        jsonRequest("POST", body)
      )).status,
      400
    );
  }

  assert.equal(
    (await fetch(`${baseUrl}/keys/%ZZ`)).status,
    400
  );

  assert.equal(
    (await fetch(`${baseUrl}/keys/%00`)).status,
    400
  );

  assert.equal(
    (await fetch(
      `${baseUrl}/keys/missing`,
      jsonRequest("PUT", {})
    )).status,
    400
  );

  const wrongType = await fetch(`${baseUrl}/keys`, {
    method: "POST",
    body: "{}"
  });

  assert.equal(wrongType.status, 415);

  assert.match(
    wrongType.headers.get("content-type"),
    /application\/json/
  );

  assert.equal(
    (await wrongType.json()).error,
    "Content-Type must be application/json"
  );
});

// ==========================================
// TEST 4 : CORPS DE REQUÊTE TROP GRAND
// ==========================================

test("rejects oversized bodies with a readable 413 JSON response", async () => {
  for (const method of ["POST", "PUT"]) {
    const response = await fetch(
      `${baseUrl}/keys${method === "PUT" ? "/large" : ""}`,
      jsonRequest(method, {
        key: "large",
        value: "x".repeat(1024 * 1024)
      })
    );

    assert.equal(response.status, 413);

    assert.deepEqual(await response.json(), {
      error: "Request body exceeds 1 MiB"
    });
  }
});

// ==========================================
// TEST 5 : ROUTES ET MÉTHODES HTTP
// CORRIGÉ POUR GET /keys
// ==========================================

test("returns route and method errors with Allow headers", async () => {
  assert.equal(
    (await fetch(`${baseUrl}/unknown`)).status,
    404
  );

  for (const [path, method, allow] of [
    ["/keys", "PATCH", "GET, POST"],
    ["/keys/a", "PATCH", "GET, PUT, DELETE"]
  ]) {
    const response = await fetch(baseUrl + path, {
      method
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), allow);
  }
});

// ==========================================
// TEST 6 : NOUVELLE FONCTIONNALITÉ KEYS
// ==========================================

test("GET /keys returns all stored keys", async () => {
  const key1 = "test-keys-1";
  const key2 = "test-keys-2";

  // Créer deux clés
  const create1 = await fetch(
    `${baseUrl}/keys`,
    jsonRequest("POST", {
      key: key1,
      value: "Fallou"
    })
  );

  const create2 = await fetch(
    `${baseUrl}/keys`,
    jsonRequest("POST", {
      key: key2,
      value: "Marseille"
    })
  );

  assert.equal(create1.status, 201);
  assert.equal(create2.status, 201);

  // Récupérer toutes les clés
  const response = await fetch(`${baseUrl}/keys`);

  assert.equal(response.status, 200);

  const data = await response.json();

  assert.ok(Array.isArray(data.keys));

  assert.ok(data.keys.includes(key1));
  assert.ok(data.keys.includes(key2));

  // Supprimer les clés utilisées pour ce test
  const delete1 = await fetch(
    `${baseUrl}/keys/${key1}`,
    { method: "DELETE" }
  );

  const delete2 = await fetch(
    `${baseUrl}/keys/${key2}`,
    { method: "DELETE" }
  );

  assert.equal(delete1.status, 204);
  assert.equal(delete2.status, 204);
});

// ==========================================
// TEST 7 : VALEURS JSON ET CLÉS ENCODÉES
// ==========================================

test("preserves JSON values and encoded keys", async () => {
  for (const [i, value] of [
    null,
    false,
    0,
    "",
    [1, { nested: true }]
  ].entries()) {
    const key = `clé/?:# ${i}`;

    assert.equal(
      (await fetch(
        `${baseUrl}/keys`,
        jsonRequest("POST", { key, value })
      )).status,
      201
    );

    const response = await fetch(
      `${baseUrl}/keys/${encodeURIComponent(key)}`
    );

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      key,
      value
    });
  }
});

// ==========================================
// TEST 8 : LIMITES DE STOCKAGE
// ==========================================

test("storage quotas reject writes atomically and deletion releases space", async () => {
  const limited = createKeyValueServer({
    maxEntries: 2,
    maxStorageBytes: 12
  });

  await new Promise((resolve, reject) => {
    limited.once("error", reject);
    limited.listen(0, "127.0.0.1", resolve);
  });

  const url =
    `http://127.0.0.1:${limited.address().port}/keys`;

  try {
    assert.equal(
      (await fetch(
        url,
        jsonRequest("POST", {
          key: "a",
          value: "1234"
        })
      )).status,
      201
    );

    assert.equal(
      (await fetch(
        url,
        jsonRequest("POST", {
          key: "b",
          value: "1234"
        })
      )).status,
      507
    );

    assert.equal(
      (await fetch(
        `${url}/a`,
        jsonRequest("PUT", {
          value: "x".repeat(20)
        })
      )).status,
      507
    );

    assert.deepEqual(
      await (await fetch(`${url}/a`)).json(),
      {
        key: "a",
        value: "1234"
      }
    );

    assert.equal(
      (await fetch(
        `${url}/a`,
        jsonRequest("PUT", { value: 0 })
      )).status,
      200
    );

    assert.equal(
      (await fetch(
        url,
        jsonRequest("POST", {
          key: "b",
          value: 0
        })
      )).status,
      201
    );

    assert.equal(
      (await fetch(
        url,
        jsonRequest("POST", {
          key: "c",
          value: 0
        })
      )).status,
      507
    );

    assert.equal(
      (await fetch(`${url}/a`, {
        method: "DELETE"
      })).status,
      204
    );

    assert.equal(
      (await fetch(
        url,
        jsonRequest("POST", {
          key: "c",
          value: 0
        })
      )).status,
      201
    );
  } finally {
    await new Promise((resolve, reject) =>
      limited.close((error) =>
        error ? reject(error) : resolve()
      )
    );
  }
});

// ==========================================
// TEST 9 : CONFIGURATION DES LIMITES
// ==========================================

test("validates server quota configuration", () => {
  for (const value of [
    0,
    -1,
    1.5,
    Infinity,
    NaN
  ]) {
    assert.throws(
      () => createKeyValueServer({
        maxEntries: value
      }),
      RangeError
    );

    assert.throws(
      () => createKeyValueServer({
        maxStorageBytes: value
      }),
      RangeError
    );
  }
});