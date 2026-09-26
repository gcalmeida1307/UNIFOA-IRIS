import 'dotenv/config';
import { createDecipheriv, createCipheriv, createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const apply = process.argv.includes('--apply');
const luminaEnvArg = process.argv.find(arg => arg.startsWith('--lumina-env='));
if (process.argv.some(arg => arg.startsWith('--') && !['--apply', '--dry-run'].includes(arg) && !arg.startsWith('--lumina-env='))) throw new Error('Use --lumina-env=CAMINHO, --dry-run ou --apply.');
const luminaEnv = luminaEnvArg ? parse(readFileSync(luminaEnvArg.slice('--lumina-env='.length))) : {};
if (luminaEnv.AUTH_MODE && luminaEnv.AUTH_MODE !== 'native') throw new Error('O .env do LUMINA precisa usar AUTH_MODE=native para migrar contas locais.');
if (process.env.AUTH_MODE !== 'native') throw new Error('Configure AUTH_MODE=native no .env do IRIS antes de importar contas.');
const sourceUrl = process.env.LUMINA_SOURCE_DATABASE_URL ?? luminaEnv.DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
const sourceKey = process.env.LUMINA_SOURCE_ENCRYPTION_KEY ?? luminaEnv.LUMINA_ENCRYPTION_KEY;
const targetKey = process.env.LUMINA_ENCRYPTION_KEY;
if (!sourceUrl || !targetUrl || !/^[a-f0-9]{64}$/i.test(sourceKey ?? '') || !/^[a-f0-9]{64}$/i.test(targetKey ?? '')) {
  throw new Error('Configure LUMINA_SOURCE_DATABASE_URL, DATABASE_URL, LUMINA_SOURCE_ENCRYPTION_KEY e LUMINA_ENCRYPTION_KEY apenas no ambiente local.');
}
const sourceDb = new URL(sourceUrl), targetDb = new URL(targetUrl);
if (sourceDb.pathname === targetDb.pathname && sourceDb.hostname === targetDb.hostname && sourceDb.port === targetDb.port) {
  throw new Error('Origem e destino precisam ser bancos diferentes.');
}
const source = new pg.Client({ connectionString: sourceUrl });
const target = new pg.Client({ connectionString: targetUrl });
const domainIds = new Set(['geral','medicina','direito','infraestrutura','financeiro','contabilidade','pessoas','secretaria','empresarial']);
function reveal(value) {
  if (typeof value !== 'string' || !value.startsWith('lumina:v1:')) throw new Error('Dado de identidade de origem incompatível.');
  const bytes = Buffer.from(value.slice(10), 'base64url');
  if (bytes.length < 29) throw new Error('Dado cifrado de origem inválido.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(sourceKey, 'hex'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
function protect(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(targetKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return 'lumina:v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function lookup(value) {
  return createHmac('sha256', Buffer.from(targetKey, 'hex')).update(value.trim().toLowerCase()).digest('hex');
}
try {
  await source.connect(); await target.connect();
  const sourceIdentity = (await source.query('SELECT current_database() AS name')).rows[0].name;
  const targetIdentity = (await target.query('SELECT current_database() AS name')).rows[0].name;
  if (sourceIdentity === targetIdentity && sourceDb.hostname === targetDb.hostname && sourceDb.port === targetDb.port) throw new Error('Origem e destino apontam para o mesmo banco.');
  const src = (await source.query('SELECT * FROM users ORDER BY user_code')).rows;
  const access = (await source.query('SELECT user_code,module_id FROM user_module_access')).rows;
  const existing = (await target.query('SELECT user_code,email_lookup FROM users')).rows;
  const usedCodes = new Set(existing.map(row => row.user_code));
  const usedEmails = new Set(existing.map(row => row.email_lookup));
  const byUser = new Map();
  for (const scope of access) {
    const list = byUser.get(scope.user_code) ?? [];
    list.push(scope.module_id); byUser.set(scope.user_code, list);
  }
  const prepared = src.map(row => {
    const email = reveal(row.email).trim().toLowerCase();
    const name = reveal(row.name);
    const scopes = byUser.get(row.user_code) ?? [];
    if (!/^[A-Z]{2}\d{6}$/.test(row.user_code) || !name || !email || !/^pbkdf2_sha256\$\d+\$[a-f0-9]{32}\$[a-f0-9]{64}$/i.test(row.password_hash)) throw new Error('Conta de origem incompatível; importação interrompida.');
    if ((row.user_code === 'AG000001') !== (row.role === 'admin' && scopes.length === 1 && scopes[0] === 'CORE')) throw new Error('Regra da conta administradora incompatível.');
    if (row.user_code !== 'AG000001' && (scopes.length !== 1 || !domainIds.has(scopes[0]))) throw new Error('Escopo de usuário incompatível com o IRIS.');
    if (usedCodes.has(row.user_code) || usedEmails.has(lookup(email))) throw new Error('Conta ou e-mail já existente no IRIS; nenhuma conta foi importada.');
    usedCodes.add(row.user_code); usedEmails.add(lookup(email));
    return { row, email, name, scopes, totp: row.two_factor_secret ? reveal(row.two_factor_secret) : null };
  });
  console.log(`Prévia: ${prepared.length} conta(s); ${prepared.filter(item => item.row.two_factor_enabled).length} com 2FA. Origem e destino distintos; sem conflitos.`);
  if (!apply) console.log('Nenhuma alteração feita. Para importar, faça backup do banco iris e execute novamente com --apply.');
  else {
    await target.query('BEGIN');
    try {
      // Recheck collisions under a transaction before inserting. No sessions or recovery tokens cross databases.
      for (const { row, email, name, scopes, totp } of prepared) {
        await target.query(`INSERT INTO users(user_code,email,email_lookup,name,password_hash,role,active,created_at,must_change_password,two_factor_secret,two_factor_enabled,password_changed_at,last_login_at,last_seen_at,blocked_at,blocked_reason,last_totp_step)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [row.user_code, protect(email), lookup(email), protect(name), row.password_hash, row.role, row.active, row.created_at, row.must_change_password,
            totp ? protect(totp) : null, row.two_factor_enabled, row.password_changed_at, row.last_login_at, row.last_seen_at, row.blocked_at, row.blocked_reason, row.last_totp_step]);
        for (const scope of scopes) await target.query('INSERT INTO user_module_access(user_code,module_id) VALUES($1,$2)', [row.user_code, scope]);
      }
      await target.query('COMMIT');
      console.log(`Importação concluída: ${prepared.length} conta(s). Senhas preservadas por hash; sessões e tokens não importados.`);
    } catch (error) { await target.query('ROLLBACK'); throw error; }
  }
} catch (error) {
  console.error('Importação interrompida: ' + (error?.code ?? (error instanceof Error ? error.message : 'erro desconhecido')));
  process.exitCode = 1;
} finally { await source.end().catch(() => {}); await target.end().catch(() => {}); }
