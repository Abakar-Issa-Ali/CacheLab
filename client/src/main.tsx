import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Operation =
  | "POST"
  | "GET"
  | "PUT"
  | "DELETE"
  | "KEYS"
  | "INCR"
  | "DECR"
  | "METRICS";

type Metrics = {
  hits: number;
  misses: number;
  totalKeys: number;
  storageBytes: number;
  maxStorageBytes: number;
  hitRate: number;
};

const operations: { value: Operation; label: string }[] = [
  { value: "POST", label: "SET - Ajouter" },
  { value: "GET", label: "GET - Lire" },
  { value: "PUT", label: "PUT - Modifier" },
  { value: "DELETE", label: "DELETE - Supprimer" },
  { value: "KEYS", label: "KEYS - Lister les clés" },
  { value: "INCR", label: "INCR - Incrémenter" },
  { value: "DECR", label: "DECR - Décrémenter" },
  { value: "METRICS", label: "METRICS - Statistiques" },
];

function App() {
  const [method, setMethod] = useState<Operation>("POST");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [ttl, setTtl] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  const refreshKeys = useCallback(async () => {
    try {
      const response = await fetch("/keys");

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data: unknown = await response.json();

      if (
        typeof data === "object" &&
        data !== null &&
        "keys" in data &&
        Array.isArray(data.keys)
      ) {
        setKeys(
          data.keys.filter(
            (item): item is string => typeof item === "string"
          )
        );
      }
    } catch (err) {
      console.error("Erreur de récupération des clés :", err);
    }
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const response = await fetch("/metrics");

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = (await response.json()) as Metrics;
      setMetrics(data);
    } catch (err) {
      console.error("Erreur de récupération des métriques :", err);
    }
  }, []);

  useEffect(() => {
    void refreshKeys();
    void refreshMetrics();
  }, [refreshKeys, refreshMetrics]);

  async function envoyer() {
    setError("");
    setResult("");
    setStatus(null);

    const needsKey = !["KEYS", "METRICS"].includes(method);

    if (needsKey && !key.trim()) {
      setError("Veuillez saisir une clé.");
      return;
    }

    let body: Record<string, unknown> | undefined;

    try {
      if (method === "POST" || method === "PUT") {
        if (!value.trim()) {
          setError("Veuillez saisir une valeur JSON.");
          return;
        }

        let parsedValue: unknown;

        try {
          parsedValue = JSON.parse(value);
        } catch {
          setError(
            'Valeur JSON invalide. Exemple : "Fallou", 10 ou {"nom":"Fallou"}'
          );
          return;
        }

        body =
          method === "POST"
            ? { key, value: parsedValue }
            : { value: parsedValue };

        if (ttl.trim()) {
          const parsedTtl = Number(ttl);

          if (!Number.isFinite(parsedTtl) || parsedTtl <= 0) {
            setError("Le TTL doit être un nombre positif de secondes.");
            return;
          }

          body.ttl = parsedTtl;
        }
      }

      let url = "/keys";
      let httpMethod = method;

      switch (method) {
        case "POST":
          url = "/keys";
          break;

        case "GET":
        case "PUT":
        case "DELETE":
          url = `/keys/${encodeURIComponent(key)}`;
          break;

        case "KEYS":
          url = "/keys";
          httpMethod = "GET";
          break;

        case "INCR":
          url = `/keys/${encodeURIComponent(key)}/incr`;
          httpMethod = "POST";
          break;

        case "DECR":
          url = `/keys/${encodeURIComponent(key)}/decr`;
          httpMethod = "POST";
          break;

        case "METRICS":
          url = "/metrics";
          httpMethod = "GET";
          break;
      }

      setLoading(true);

      const response = await fetch(url, {
        method: httpMethod,
        headers: body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();

      setStatus(response.status);

      let parsed: unknown = null;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      setResult(
        parsed === null
          ? "Opération effectuée."
          : JSON.stringify(parsed, null, 2)
      );

      if (!response.ok) {
        setError(`La requête a échoué (HTTP ${response.status}).`);
      }

      if (response.ok) {
        if (method === "KEYS") {
          await refreshKeys();
        } else if (method === "METRICS") {
          await refreshMetrics();
        } else {
          await Promise.all([refreshKeys(), refreshMetrics()]);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de contacter le serveur."
      );
    } finally {
      setLoading(false);
    }
  }

  function selectKey(selectedKey: string) {
    setKey(selectedKey);
    setMethod("GET");
    setResult("");
    setStatus(null);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} octets`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} Ko`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  }

  const needsKey = !["KEYS", "METRICS"].includes(method);
  const needsValue = method === "POST" || method === "PUT";

  return (
    <div className="container">
      <header>
        <h1>CacheLab</h1>
        <p>
          Tableau de bord du système de cache clé-valeur
        </p>
      </header>

      <section>
        <h2>Statistiques du cache</h2>

        {metrics ? (
          <div className="metrics-grid">
            <div className="metric-card">
              <h3>Clés actives</h3>
              <strong>{metrics.totalKeys}</strong>
            </div>

            <div className="metric-card">
              <h3>Hits</h3>
              <strong>{metrics.hits}</strong>
            </div>

            <div className="metric-card">
              <h3>Misses</h3>
              <strong>{metrics.misses}</strong>
            </div>

            <div className="metric-card">
              <h3>Hit rate</h3>
              <strong>{metrics.hitRate}%</strong>
            </div>

            <div className="metric-card">
              <h3>Stockage utilisé</h3>
              <strong>
                {formatBytes(metrics.storageBytes)}
              </strong>
            </div>

            <div className="metric-card">
              <h3>Stockage maximal</h3>
              <strong>
                {formatBytes(metrics.maxStorageBytes)}
              </strong>
            </div>
          </div>
        ) : (
          <p>Métriques indisponibles.</p>
        )}

        <button
          type="button"
          onClick={() => void refreshMetrics()}
          disabled={loading}
        >
          Actualiser les statistiques
        </button>
      </section>

      <section>
        <h2>Gestion des clés</h2>

        <label htmlFor="operation">
          Opération
        </label>

        <select
          id="operation"
          value={method}
          onChange={(e) =>
            setMethod(e.target.value as Operation)
          }
        >
          {operations.map((operation) => (
            <option
              key={operation.value}
              value={operation.value}
            >
              {operation.label}
            </option>
          ))}
        </select>

        {needsKey && (
          <>
            <label htmlFor="cache-key">
              Clé
            </label>

            <input
              id="cache-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Exemple : score"
            />
          </>
        )}

        {needsValue && (
          <>
            <label htmlFor="cache-value">
              Valeur JSON
            </label>

            <textarea
              id="cache-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={'Exemple : "Fallou", 10 ou {"nom":"Fallou"}'}
              rows={4}
            />

            <label htmlFor="cache-ttl">
              TTL en secondes (facultatif)
            </label>

            <input
              id="cache-ttl"
              type="number"
              min="0.001"
              step="any"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="Exemple : 60"
            />
          </>
        )}

        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={loading}
        >
          {loading ? "Chargement..." : `Exécuter ${method}`}
        </button>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <section>
        <h2>Clés enregistrées</h2>

        <button
          type="button"
          onClick={() => void refreshKeys()}
          disabled={loading}
        >
          Actualiser les clés
        </button>

        {keys.length === 0 ? (
          <p>Aucune clé enregistrée.</p>
        ) : (
          <ul className="keys-list">
            {keys.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => selectKey(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Réponse du serveur</h2>

        {status !== null && (
          <p>
            Code HTTP :{" "}
            <strong>{status}</strong>
          </p>
        )}

        <pre>
          {result || "Aucune requête envoyée."}
        </pre>
      </section>

      <footer>
        <p>
          CacheLab — Projet universitaire
        </p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);