import { useEffect, useState } from 'react';
import { api } from './api';
type User = { user_code: string; name: string; email: string; role: string; active: boolean; scopes: string[]; two_factor_enabled: boolean; session_count: number };
export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]), [days, setDays] = useState(90), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [artifact, setArtifact] = useState<Record<string, unknown>>();
  const load = async () => { const result = await api<{ users: User[]; inactivity: { inactive_lock_days: number } }>('/auth/users'); setUsers(result.users); setDays(result.inactivity.inactive_lock_days); };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  async function action(path: string, body: unknown = {}) {
    setBusy(true); setError(''); setArtifact(undefined);
    try { const result = await api<Record<string, unknown>>(path, { method: 'POST', body: JSON.stringify(body) }); if (result.activation_token || result.reset_token) setArtifact(result); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel admin-access"><h3>Usuários e recuperação de acesso</h3>
    {error && <p role="alert">{error}</p>}
    <label className="field">Bloquear por inatividade após quantos dias<input type="number" min={1} max={3650} value={days} onChange={e => setDays(Number(e.target.value))} /></label>
    <button className="button secondary" disabled={busy || days < 1 || days > 3650} onClick={() => void action('/auth/users/inactivity-policy', { inactive_lock_days: days })}>Salvar política</button>
    {artifact && <div className="activation-token"><p>Entregue o token ao titular por um canal seguro. Fechar esta tela remove a exibição.</p><pre>{JSON.stringify(artifact, null, 2)}</pre><button onClick={() => setArtifact(undefined)}>Ocultar token</button></div>}
    {users.map(user => <div className="access-request" key={user.user_code}><strong>{user.name} · {user.user_code}</strong><span>{user.email} · {user.active ? 'Ativo' : 'Bloqueado'} · 2FA {user.two_factor_enabled ? 'ativo' : 'pendente'}</span><small>Módulos: {user.scopes.join(', ')} · {user.session_count} sessões</small>
      {user.role !== 'admin' && <button className="button secondary" disabled={busy} onClick={() => void action('/auth/users/' + user.user_code + '/status', { active: !user.active, reason: 'Alterado pela administração' })}>{user.active ? 'Bloquear acesso' : 'Desbloquear acesso'}</button>}
      <button className="button secondary" disabled={busy || !user.active} onClick={() => void action('/auth/users/' + user.user_code + '/reset')}>Gerar recuperação</button>
      {!user.two_factor_enabled && <button className="button secondary" disabled={busy || !user.active} onClick={() => void action('/auth/users/' + user.user_code + '/activation')}>Reemitir ativação</button>}
    </div>)}
  </section>;
}
