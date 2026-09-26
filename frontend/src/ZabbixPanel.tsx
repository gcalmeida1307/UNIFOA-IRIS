import { useState } from 'react';
import { api } from './api';
export function ZabbixPanel() {
  const [host, setHost] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ host: string; capturedAt: string; problems: Array<{ eventid: string; name: string; severity: string; clock: string }> }>();
  async function read() { setBusy(true); setError(''); setResult(undefined); try { setResult(await api('/integrations/zabbix/problems?host=' + encodeURIComponent(host.trim()))); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="panel"><h3>Problemas do Zabbix</h3><p>Consulta de leitura pelo nome exato do host cadastrado.</p><label className="field">Host<input value={host} onChange={e => setHost(e.target.value)} placeholder="servidor.exemplo" /></label><button className="button primary" disabled={busy || !host.trim()} onClick={() => void read()}>{busy ? 'Consultando…' : 'Consultar problemas'}</button>{error && <p role="alert">{error}</p>}{result && <><p>{result.host} · consulta em {new Date(result.capturedAt).toLocaleString('pt-BR')}</p>{!result.problems.length && <p>Nenhum problema ativo retornado.</p>}{result.problems.map(p => <div className="access-request" key={p.eventid}><strong>{p.name}</strong><span>Severidade {p.severity} · {new Date(Number(p.clock) * 1000).toLocaleString('pt-BR')} · Evento {p.eventid}</span></div>)}<p>Os alertas descrevem sintomas. A causa raiz exige métricas, cronologia e confirmação.</p></>}</section>;
}
