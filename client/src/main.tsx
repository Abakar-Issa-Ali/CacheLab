import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [method, setMethod] = useState("POST");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<number | null>(null);

  async function envoyer() {
    if (!key.trim()) {
      setResult("Veuillez saisir une clé.");
      return;
    }

    try {
      let body;

      if (method === "POST" || method === "PUT") {
        const parsedValue = JSON.parse(value);

        body =
          method === "POST"
            ? { key, value: parsedValue }
            : { value: parsedValue };
      }

      const url =
        method === "POST"
          ? "/keys"
          : `/keys/${encodeURIComponent(key)}`;

      const response = await fetch(url, {
        method,
        headers: body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();

      setStatus(response.status);

      try {
        setResult(
          text
            ? JSON.stringify(JSON.parse(text), null, 2)
            : "Opération réussie."
        );
      } catch {
        setResult(text);
      }
    } catch (error) {
      setStatus(null);
      setResult(
        error instanceof Error ? error.message : "Erreur inconnue"
      );
    }
  }

  return (
    <div className="container">
      <h1>CacheLab</h1>
      <p>Tester notre API REST</p>

      <label>Méthode HTTP</label>
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        <option value="POST">POST - Ajouter</option>
        <option value="GET">GET - Lire</option>
        <option value="PUT">PUT - Modifier</option>
        <option value="DELETE">DELETE - Supprimer</option>
      </select>

      <label>Clé</label>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Exemple : nom"
      />

      {(method === "POST" || method === "PUT") && (
        <>
          <label>Valeur JSON</label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'Exemple : "Fallou"'}
          />
        </>
      )}

      <button onClick={envoyer}>
        Envoyer {method}
      </button>

      <h2>Réponse du serveur</h2>

      {status !== null && (
        <p>
          Code HTTP : <strong>{status}</strong>
        </p>
      )}

      <pre>{result || "Aucune requête envoyée."}</pre>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);