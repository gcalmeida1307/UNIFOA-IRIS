import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { nativeLogin } from './auth';

type Mode = 'login' | 'request' | 'activate' | 'reset';
type Module = { id: string; name: string };
type Artifact = { qr_data_uri: string; secret: string };

export function NativeOnboarding() {
  const [mode, setMode] = useState<Mode>('login');
  const [modules, setModules] = useState<Module[]>([]);
  const [module, setModule] = useState('');
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [otp, setOtp] = useState('');
  const [code, setCode] = useState(''), [token, setToken] = useState(''), [confirmation, setConfirmation] = useState('');
  const [artifact, setArtifact] = useState<Artifact>();
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { void api<Module[]>('/auth/domains').then(items => { setModules(items); setModule(items[0]?.id ?? ''); }).catch(() => undefined); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') {
        const result = await nativeLogin(identifier, password, otp);
        if (result.requires_2fa) { setError('Informe o código de seis dígitos do aplicativo autenticador.'); return; }
        if (result.requires_activation) { setMode('activate'); setCode(identifier.toUpperCase()); setError('Informe a matrícula e o token de ativação.'); return; }
        if (result.requires_password_reset) { setMode('reset'); setCode(identifier.toUpperCase()); return; }
        location.reload(); return;
      }
      if (mode === 'request') {
        const result = await api<{ request_code: string }>('/auth/requests', { method: 'POST', body: JSON.stringify({ name, email, requested_module: module, scopes: [module] }) });
        setMessage(`Solicitação ${result.request_code} registrada. Aguarde a análise da conta AG000001 e receba a matrícula e o token por um canal seguro.`);
      } else if (mode === 'reset') {
        if (password !== confirmation) throw new Error('A confirmação da senha não confere.');
        await api('/auth/password/reset', { method: 'POST', body: JSON.stringify({ user_code: code, reset_token: token, new_password: password }) });
        setMessage('Senha redefinida. Volte ao login.'); setPassword(''); setConfirmation('');
      } else if (mode === 'activate' && !artifact) {
        if (password !== confirmation) throw new Error('A confirmação da senha não confere.');
        setArtifact(await api<Artifact>('/auth/activation', { method: 'POST', body: JSON.stringify({ user_code: code, activation_token: token, new_password: password }) }));
        setPassword(''); setConfirmation('');
      } else {
        await api('/auth/activation/2fa', { method: 'POST', body: JSON.stringify({ user_code: code, activation_token: token, code: otp }) });
        setMessage('Conta ativada. Volte ao login.'); setArtifact(undefined);
      }
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true); setError('');
    try { setArtifact(await api<Artifact>('/auth/activation/resume', { method: 'POST', body: JSON.stringify({ user_code: code, activation_token: token }) })); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  const switchMode = (next: Mode) => { setMode(next); setError(''); setMessage(''); setArtifact(undefined); setPassword(''); setConfirmation(''); };
  return <main className="login-screen"><section className="login-panel"><div className="login-mark"><img src="/lumina.svg" alt="" /></div>
    <h1>{({ login: 'Entre no LUMINA', request: 'Solicite acesso', activate: 'Ative sua conta', reset: 'Redefina sua senha' })[mode]}</h1>
    <p>{error || message || ({ login: 'Use sua matrícula ou e-mail, senha e código do autenticador.', request: 'A conta administradora aprova o módulo solicitado.', activate: 'Use matrícula e token recebidos da administração.', reset: 'Use o token de recuperação fornecido pela administração.' })[mode]}</p>
    <form onSubmit={event => void submit(event)}>
      {mode === 'login' && <><label>Matrícula ou e-mail<input value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" required /></label><label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label><label>Código 2FA<input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label></>}
      {mode === 'request' && <><label>Nome completo<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required /></label><label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label><label>Módulo solicitado<select value={module} onChange={event => setModule(event.target.value)} required>{modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
      {['activate', 'reset'].includes(mode) && <><label>Matrícula<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} pattern="[A-Z]{2}[0-9]{6}" required /></label><label>Token<input value={token} onChange={event => setToken(event.target.value)} required /></label></>}
      {(mode === 'reset' || mode === 'activate' && !artifact) && <><label>Nova senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirmar senha<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required /></label></>}
      {mode === 'activate' && artifact && <><p>Cadastre o QR no aplicativo autenticador. Guarde o segredo somente se precisar cadastrá-lo manualmente.</p><img src={artifact.qr_data_uri} alt="QR para configurar autenticação em duas etapas" width={190} /><code>{artifact.secret}</code><label>Código do autenticador<input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label></>}
      <button className="button primary login-button" type="submit" disabled={busy || mode === 'request' && !module}>{busy ? 'Aguarde...' : ({ login: 'Entrar', request: 'Enviar solicitação', activate: artifact ? 'Confirmar 2FA' : 'Criar senha e configurar 2FA', reset: 'Redefinir senha' })[mode]}</button>
      {mode === 'activate' && !artifact && <button type="button" className="button ghost" disabled={busy || !code || !token} onClick={() => void resume()}>Já criei a senha: recuperar QR</button>}
    </form>
    {mode === 'login' ? <div className="onboarding-links"><button onClick={() => switchMode('request')}>Solicitar conta</button><button onClick={() => switchMode('activate')}>Ativar conta</button><button onClick={() => switchMode('reset')}>Redefinir senha</button></div> : <button className="button ghost" onClick={() => switchMode('login')}>Voltar ao login</button>}
  </section></main>;
}

export function NativeAccountSetup({ user }: { user: { user_code: string; must_change_password: boolean; two_factor_enabled: boolean } }) {
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [artifact, setArtifact] = useState<Artifact>(), [otp, setOtp] = useState(''), [error, setError] = useState('');
  async function savePassword(event: FormEvent) {
    event.preventDefault(); setError('');
    try { if (password !== confirmation) throw new Error('A confirmação não confere.'); await api('/auth/password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: password }) }); location.reload(); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function prepare2FA() { try { setArtifact(await api<Artifact>('/auth/2fa/setup', { method: 'POST' })); } catch (reason) { setError((reason as Error).message); } }
  async function enable2FA() { try { await api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: otp }) }); location.reload(); } catch (reason) { setError((reason as Error).message); } }
  return <main className="login-screen"><section className="login-panel"><h1>Proteja sua conta</h1><p>{error || `Matrícula ${user.user_code}: conclua as etapas antes de acessar os módulos.`}</p>
    {user.must_change_password ? <form onSubmit={event => void savePassword(event)}><label>Senha atual<input type="password" value={current} onChange={event => setCurrent(event.target.value)} required /></label><label>Nova senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Confirmar senha<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label><button className="button primary" type="submit">Trocar senha inicial</button></form> : <div className="setup-2fa"><button className="button primary" onClick={() => void prepare2FA()}>Configurar 2FA</button>{artifact && <><img src={artifact.qr_data_uri} alt="QR do autenticador" width={190} /><code>{artifact.secret}</code><label>Código do autenticador<input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} /></label><button className="button primary" disabled={otp.length !== 6} onClick={() => void enable2FA()}>Validar 2FA</button></>}</div>}
  </section></main>;
}

type AccessRequest = { id: string; request_code: string; name: string; email: string; requested_module: string; requested_scopes: string[] };
export function AdminAccess() {
  const [requests, setRequests] = useState<AccessRequest[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [activation, setActivation] = useState<{ user_code: string; activation_token: string; expires_at: number }>();
  const load = () => { void api<{ requests: AccessRequest[] }>('/auth/requests').then(data => setRequests(data.requests)).catch(reason => setError(reason.message)); };
  useEffect(load, []);
  async function decide(item: AccessRequest, approve: boolean) {
    setBusy(true); setError(''); setActivation(undefined);
    try {
      const result = await api<{ user_code: string; activation_token: string; expires_at: number }>('/auth/requests/' + item.id + '/decision', { method: 'POST', body: JSON.stringify({ approve, scopes: approve ? [item.requested_module] : [], note: '' }) });
      if (approve) setActivation(result);
      load();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel admin-access"><h3>Solicitações de acesso</h3><p>Somente AG000001 aprova contas e entrega o token por um canal seguro.</p>{error && <p role="alert">{error}</p>}
    {activation && <div className="activation-token"><strong>Entregue estes dados ao usuário agora; o token aparece uma única vez.</strong><p>Matrícula: <code>{activation.user_code}</code></p><p>Token: <code>{activation.activation_token}</code></p><p>Válido até {new Date(activation.expires_at * 1000).toLocaleString('pt-BR')}.</p></div>}
    {!requests.length && <p>Nenhuma solicitação pendente.</p>}
    {requests.map(item => <div className="access-request" key={item.id}><strong>{item.name}</strong><span>{item.email} · {item.requested_module} · {item.request_code}</span><button className="button primary" disabled={busy} onClick={() => void decide(item, true)}>Aprovar</button><button className="button secondary" disabled={busy} onClick={() => void decide(item, false)}>Rejeitar</button></div>)}
  </section>;
}

export function AdminThemes({ domain }: { domain: string }) {
  const [data, setData] = useState<{ totalQueries: number; topThemes: Array<{ theme: string; consultations: number; useful: number; poor: number; abstained: number }> }>();
  useEffect(() => { let active = true; void api<typeof data>('/analytics/themes?domain=' + encodeURIComponent(domain)).then(value => { if (active) setData(value); }).catch(() => undefined); return () => { active = false; }; }, [domain]);
  return <section className="panel admin-access"><h3>Assuntos consultados · últimos 30 dias</h3><p>{data?.totalQueries ?? 0} consultas documentais no módulo. Só aparecem termos repetidos; perguntas e nomes de usuários não são exibidos.</p>
    {!data?.topThemes.length && <p>Ainda não há temas repetidos.</p>}
    {data?.topThemes.map(item => <div className="access-request" key={item.theme}><strong>{item.theme}</strong><span>{item.consultations} consultas · {item.useful} úteis · {item.poor} para revisar · {item.abstained} sem evidência suficiente</span></div>)}
  </section>;
}
