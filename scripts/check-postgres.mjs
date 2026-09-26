import 'dotenv/config';
import pg from 'pg';
import { stdin, stdout } from 'node:process';

const expected = process.argv.find(value => value.startsWith('--expected-db='))?.slice('--expected-db='.length) || 'iris';
const url = process.env.DATABASE_URL;
const readPassword = () => new Promise(resolve => {
  stdout.write('Senha PostgreSQL para iris (entrada oculta): ');
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  let password = '';
  const finish = value => {
    stdin.off('data', onData);
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
    resolve(value);
  };
  const onData = chunk => {
    for (const character of chunk) {
      if (character === '\u0003') return finish(null);
      if (character === '\r' || character === '\n') return finish(password);
      if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
      else password += character;
    }
  };
  stdin.on('data', onData);
});

if (!url && (!stdin.isTTY || typeof stdin.setRawMode !== 'function')) {
  console.error('DATABASE_URL não está configurada no ambiente ou no .env desta pasta. O IRIS usará SQLite local.');
  process.exitCode = 1;
} else {
  let client;
  try {
    if (url) {
      const parsed = new URL(url);
      if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) throw new Error('DATABASE_URL não é uma URL PostgreSQL válida.');
      client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3500, query_timeout: 6000 });
    } else {
      const password = await readPassword();
      if (password === null) {
        process.exitCode = 130;
      } else {
        client = new pg.Client({
          host: process.env.IRIS_DB_HOST || 'localhost',
          port: Number(process.env.IRIS_DB_PORT || 5432),
          user: 'iris',
          password,
          database: 'iris',
          connectionTimeoutMillis: 3500,
          query_timeout: 6000
        });
      }
    }
    if (!client) process.exit();
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows: [identity] } = await client.query('SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS host, inet_server_port() AS port');
    console.log(`Conexão PostgreSQL: OK. Banco: ${identity.database}. Usuário: ${identity.username}. Servidor: ${identity.host ?? 'local'}. Porta: ${identity.port ?? 'padrão'}.`);
    const matches = identity.database.toLowerCase() === expected.toLowerCase();
    console.log(`Banco exclusivo esperado (${expected}): ${matches ? 'OK' : 'DIFERENTE — confirme que não é o banco do LUMINA ou do SOFIA'}.`);
    const required = ['documents', 'chunks', 'runs', 'revisions', 'research_jobs'];
    if (process.env.AUTH_MODE === 'native') required.push('users', 'access_requests', 'sessions');
    let missing = 0;
    for (const table of required) {
      const { rows: [row] } = await client.query('SELECT to_regclass($1)::text AS table_name', [`public.${table}`]);
      console.log(`${table}: ${row.table_name ? 'OK' : 'AUSENTE'}`);
      if (!row.table_name) missing++;
    }
    if (!missing) {
      const { rows: [counts] } = await client.query('SELECT (SELECT count(*) FROM documents) AS documents, (SELECT count(*) FROM chunks) AS chunks, (SELECT count(*) FROM runs) AS runs');
      console.log(`Registros: ${counts.documents} documentos; ${counts.chunks} trechos; ${counts.runs} consultas.`);
    }
    await client.query('ROLLBACK');
    if (!matches || missing) process.exitCode = 1;
  } catch (error) {
    // Never print the connection string or driver diagnostics containing credentials.
    console.error(`Checagem PostgreSQL falhou: ${error?.code || error?.name || 'erro de conexão'}. Confirme DATABASE_URL e se o servidor está acessível.`);
    process.exitCode = 1;
  } finally { await client?.end().catch(() => undefined); }
}
