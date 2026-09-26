import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-postgres.mjs', import.meta.url));

test('PostgreSQL diagnostic distinguishes missing configuration from connection failure without leaking credentials', () => {
  const empty = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /DATABASE_URL não está configurada/);
  const secret = 'sentinela-nao-imprimir';
  const refused = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: `postgresql://user:${secret}@127.0.0.1:1/iris` } });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /ECONNREFUSED/);
  assert.doesNotMatch(refused.stdout + refused.stderr, new RegExp(secret));
});
