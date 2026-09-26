import { parse } from 'dotenv';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const env = parse(readFileSync('.env'));
const directory = resolve('work/backups', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(directory, { recursive: true });
copyFileSync('.env', join(directory, 'environment.private'));
if (env.DATABASE_URL) {
  const url = new URL(env.DATABASE_URL);
  const executable = process.env.IRIS_PG_DUMP || 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe';
  const result = spawnSync(executable, ['-Fc', '--no-password', '-f', join(directory, 'iris.dump')], {
    windowsHide: true, encoding: 'utf8', env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) }
  });
  if (result.status !== 0) throw new Error('Backup PostgreSQL falhou. Código: ' + (result.status ?? result.error?.code));
}
console.log('Backup local criado: ' + directory);
