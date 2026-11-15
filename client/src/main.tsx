import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Method = 'POST' | 'GET' | 'PUT' | 'DELETE';
type HistoryItem = { method: Method; key: string; status: number; time: string };
function App() {
  const [method, setMethod] = useState<Method>('POST');
  const [key, setKey] = useState('nom');
  const [value, setValue] = useState('"Fallou"');
  const [result, setResult] = useState('Aucune requête envoyée.');
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim()) { setResult('La clé est obligatoire.'); setStatus(null); return; }
    let parsed: unknown;
    if (method === 'POST' || method === 'PUT') {
      try { parsed = JSON.parse(value); } catch { setResult('Valeur JSON invalide. Exemple : "Fallou", 42 ou {"prix":100}'); setStatus(null); return; }
    }
    const url = method === 'POST' ? '/keys' : `/keys/${encodeURIComponent(key)}`;
    const body = method === 'POST' ? { key, value: parsed } : method === 'PUT' ? { value: parsed } : undefined;
    setLoading(true);
    try {
      const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const raw = await response.text();
      let formatted = raw || '(réponse vide)';
      if (raw) { try { formatted = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* display plain text */ } }
      setResult(formatted); setStatus(response.status);
      setHistory(old => [{ method, key, status: response.status, time: new Date().toLocaleTimeString('fr-FR') }, ...old].slice(0, 8));
    } catch (error) {
      setResult(`Impossible de contacter le serveur : ${error instanceof Error ? error.message : String(error)}\nVérifie que le backend fonctionne sur le port 3000.`); setStatus(null);
    } finally { setLoading(false); }
  }
  return <div className="shell"><header><div className="brand"><div className="brand-icon">▦</div><div><strong>CacheLab</strong><small>Console de gestion du cache</small></div></div><span className="badge">CLIENT WEB · TYPESCRIPT</span></header><main><div className="heading"><span className="eyebrow">DÉMONSTRATION API REST</span><h1>Explorez votre cache<br/><em>en temps réel.</em></h1><p>Testez votre moteur de stockage clé/valeur développé en TypeScript, sans Redis ni Map native.</p></div><div className="grid"><section className="panel"><div className="panel-top"><div><span className="step">01 / REQUÊTE</span><h2>Envoyer une opération</h2></div><span className="dot">● API REST</span></div><form onSubmit={submit}><label>Méthode HTTP</label><div className="methods">{(['POST','GET','PUT','DELETE'] as Method[]).map(m => <button type="button" key={m} onClick={() => setMethod(m)} className={method === m ? 'active '+m.toLowerCase() : ''}>{m}</button>)}</div><label htmlFor="key">Clé</label><input id="key" value={key} onChange={e=>setKey(e.target.value)} placeholder="ex. produit:100"/><label>Endpoint</label><div className="endpoint">{method === 'POST' ? '/keys' : `/keys/${encodeURIComponent(key || ':key')}`}</div>{(method === 'POST' || method === 'PUT') && <><label htmlFor="value">Valeur (JSON)</label><textarea id="value" value={value} onChange={e=>setValue(e.target.value)} rows={5} spellCheck={false}/><span className="hint">Exemples : "Fallou" · 42 · {`{"prix": 100}`}</span></>}<button className="submit" disabled={loading}>{loading ? 'Envoi en cours…' : `Exécuter ${method}`} <span>↗</span></button></form></section><section className="panel response"><div className="panel-top"><div><span className="step">02 / RÉPONSE</span><h2>Résultat du serveur</h2></div>{status !== null && <span className={'status '+(status < 400 ? 'ok' : 'bad')}>HTTP {status}</span>}</div><pre>{result}</pre><div className="history"><h3>Historique des requêtes</h3>{history.length ? history.map((h,i)=><div className="history-row" key={i}><span className={'verb '+h.method.toLowerCase()}>{h.method}</span><span className="history-key">{h.key}</span><span className={h.status < 400 ? 'success' : 'failure'}>{h.status}</span><time>{h.time}</time></div>) : <p className="empty">Vos requêtes apparaîtront ici.</p>}</div></section></div><footer>CacheLab · Projet pédagogique · Node.js + TypeScript + HashMap personnalisée</footer></main></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
