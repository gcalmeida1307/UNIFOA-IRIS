import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const envArg = process.argv.find(arg => arg.startsWith('--lumina-env='));
const apply = process.argv.includes('--apply');
const skipExisting = process.argv.includes('--skip-existing');
if (!envArg || process.argv.some(arg => arg.startsWith('--') && !['--apply', '--dry-run', '--skip-existing'].includes(arg) && !arg.startsWith('--lumina-env='))) {
  throw new Error('Uso: npm run import:lumina-documents -- "--lumina-env=C:\\pasta\\LUMINA\\.env" --dry-run|--apply [--skip-existing]');
}
const envPath = resolve(envArg.slice('--lumina-env='.length));
const origin = parse(readFileSync(envPath));
const destination = parse(readFileSync(resolve('.env')));
if (!origin.DATABASE_URL || !destination.DATABASE_URL) throw new Error('Configure DATABASE_URL nos dois arquivos .env locais.');
const urlOrigin = new URL(origin.DATABASE_URL), urlDestination = new URL(destination.DATABASE_URL);
const source = new pg.Client({ connectionString: origin.DATABASE_URL });
const target = new pg.Client({ connectionString: destination.DATABASE_URL });
const domains = new Set(['geral','medicina','direito','infraestrutura','financeiro','contabilidade','pessoas','secretaria','empresarial']);
function storage(env, base) {
  if (env.S3_ENDPOINT) {
    if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) throw new Error('Credenciais S3 ausentes no ambiente local.');
    return { kind: 's3', endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET || 'lumina', client: new S3Client({ endpoint: env.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } }) };
  }
  const data = env.DATA_DIR || 'data/runtime';
  return { kind: 'local', directory: resolve(isAbsolute(data) ? data : join(base, data), 'objects') };
}
const from = storage(origin, dirname(envPath));
const to = storage(destination, process.cwd());
if (from.kind === 'local' && to.kind === 'local' && from.directory.toLowerCase() === to.directory.toLowerCase()) throw new Error('As pastas de arquivos da origem e do IRIS precisam ser diferentes.');
if (from.kind === 's3' && to.kind === 's3' && from.endpoint === to.endpoint && from.bucket === to.bucket) throw new Error('Origem e IRIS precisam de buckets S3 distintos.');
function keyOf(doc) {
  if (!doc.objectKey || !/^[a-f0-9-]{36}$/i.test(doc.objectKey)) throw new Error('Documento disponível sem arquivo original válido.');
  return doc.objectKey;
}
async function hasObject(store, key) {
  if (store.kind === 'local') return existsSync(join(store.directory, key));
  try { await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key })); return true; }
  catch (error) { if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false; throw error; }
}
async function getObject(store, key) {
  if (store.kind === 'local') return readFile(join(store.directory, key));
  const response = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }));
  if (!response.Body) throw new Error('Arquivo original indisponível.');
  return Buffer.from(await response.Body.transformToByteArray());
}
async function putObject(store, key, bytes) {
  if (store.kind === 'local') { await mkdir(store.directory, { recursive: true }); await writeFile(join(store.directory, key), bytes, { flag: 'wx' }); }
  else await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: bytes }));
}
async function removeLocalObject(store, key) {
  if (store.kind === 'local') await unlink(join(store.directory, key)).catch(() => {});
  // Leave an S3 object in place after a DB failure; never delete from a possibly shared remote bucket automatically.
}
function safeDocument(row) {
  const d = JSON.parse(row.payload);
  if (d.id !== row.id || d.domain !== row.domain || d.hash !== row.hash || !domains.has(d.domain)) throw new Error('Documento com domínio ou metadados incompatíveis.');
  return d;
}
let connectedSource = false, connectedTarget = false;
try {
  await source.connect(); connectedSource = true;
  await target.connect(); connectedTarget = true;
  const srcDb = (await source.query('SELECT current_database() AS name, inet_server_addr()::text AS host, inet_server_port() AS port')).rows[0];
  const dstDb = (await target.query('SELECT current_database() AS name, inet_server_addr()::text AS host, inet_server_port() AS port')).rows[0];
  if (srcDb.name === dstDb.name && srcDb.host === dstDb.host && srcDb.port === dstDb.port) throw new Error('Origem e destino apontam para o mesmo banco PostgreSQL.');
  if (urlOrigin.host === urlDestination.host && urlOrigin.pathname === urlDestination.pathname) throw new Error('Origem e destino usam a mesma URL de banco.');
  const sourceRows = (await source.query('SELECT id,domain,hash,payload FROM documents ORDER BY domain,id')).rows;
  const destRows = (await target.query('SELECT id,domain,hash,payload FROM documents')).rows;
  const destById = new Map(destRows.map(row => [row.id, row]));
  const destByHash = new Map(destRows.map(row => [row.domain + ':' + row.hash, row]));
  const selected = [], skipped = { unavailable: 0, existing: 0, equivalent: 0, conflict: 0 }, problems = [];
  for (const row of sourceRows) {
    const d = safeDocument(row);
    if (d.status !== 'ready') { skipped.unavailable++; continue; }
    const sameId = destById.get(d.id);
    const sameHash = destByHash.get(d.domain + ':' + d.hash);
    if (sameId || sameHash) {
      const conflict = sameId || sameHash;
      const other = safeDocument(conflict);
      // The hash includes sourceUrl and the original bytes; a distinct ID may
      // therefore represent the same source file imported independently.
      if (other.hash === d.hash && other.domain === d.domain && other.status === 'ready' && other.chunks === d.chunks) {
        const count = Number((await target.query('SELECT count(*)::int AS n FROM chunks WHERE document_id=$1', [other.id])).rows[0].n);
        if (count === other.chunks && await hasObject(to, keyOf(other))) {
          if (other.id === d.id) skipped.existing++;
          else skipped.equivalent++;
          continue;
        }
      }
      const reason = sameId && other.hash !== d.hash ? 'mesmo ID com conteúdo diferente' : 'mesmo hash com trechos ou arquivo de destino incompatíveis';
      if (skipExisting) { skipped.conflict++; continue; }
      problems.push('Conflito (' + reason + ') no módulo ' + d.domain + ': ' + d.name); continue;
    }
    const key = keyOf(d);
    const count = Number((await source.query('SELECT count(*)::int AS n FROM chunks WHERE document_id=$1', [d.id])).rows[0].n);
    if (count !== d.chunks || count < 1) { problems.push('Trechos incompletos: ' + d.name); continue; }
    if (!await hasObject(from, key)) { problems.push('Arquivo original ausente: ' + d.name); continue; }
    if (await hasObject(to, key)) { problems.push('Identificador de arquivo já existe no destino: ' + d.name); continue; }
    selected.push(d);
  }
  const totalChunks = selected.reduce((sum, d) => sum + d.chunks, 0);
  console.log(`Prévia: ${sourceRows.length} documento(s) no LUMINA; ${selected.length} prontos para copiar, ${totalChunks} trechos; ${skipped.existing} já importado(s), ${skipped.equivalent} equivalente(s) com outro ID no destino; ${skipped.conflict} conflito(s) ignorado(s); ${skipped.unavailable} não disponível(is).`);
  if (skipped.conflict) console.log(`Atenção: ${skipped.conflict} documento(s) da origem NÃO serão copiados; os registros existentes no destino permanecerão intactos.`);
  if (problems.length) { for (const item of problems.slice(0, 15)) console.error(item); throw new Error(`${problems.length} problema(s) impedem a cópia; nenhum documento foi alterado nesta execução.`); }
  if (!apply) console.log('Nenhuma alteração feita. Faça backup do banco iris e da pasta/bucket de arquivos do IRIS antes de usar --apply.');
  else {
    for (const d of selected) {
      const rows = (await source.query('SELECT id,document_id,domain,payload FROM chunks WHERE document_id=$1 ORDER BY id', [d.id])).rows;
      if (rows.length !== d.chunks || rows.some(r => r.document_id !== d.id || r.domain !== d.domain)) throw new Error('Trechos alterados durante a migração; pare o LUMINA e repita a prévia.');
      const bytes = await getObject(from, keyOf(d));
      const hash = createHash('sha256').update(d.sourceUrl ?? '').update(bytes).digest('hex');
      if (hash !== d.hash) throw new Error('Arquivo original diferente do índice para ' + d.name + '; importação interrompida.');
      await putObject(to, keyOf(d), bytes);
      try {
        await target.query('BEGIN');
        await target.query('INSERT INTO documents(id,domain,hash,payload) VALUES($1,$2,$3,$4)', [d.id,d.domain,d.hash,JSON.stringify(d)]);
        for (let start = 0; start < rows.length; start += 100) {
          const batch = rows.slice(start, start + 100);
          const params = batch.flatMap(r => [r.id,r.document_id,r.domain,r.payload]);
          const values = batch.map((_,i) => '(' + [1,2,3,4].map(n => '$' + (i*4+n)).join(',') + ')').join(',');
          await target.query('INSERT INTO chunks(id,document_id,domain,payload) VALUES ' + values, params);
        }
        await target.query('INSERT INTO revisions(domain,value) VALUES($1,1) ON CONFLICT(domain) DO UPDATE SET value=revisions.value+1', [d.domain]);
        await target.query('COMMIT');
      } catch (error) { await target.query('ROLLBACK'); await removeLocalObject(to, keyOf(d)); throw error; }
      console.log('Copiado: ' + d.name + ' (' + d.domain + ', ' + d.chunks + ' trechos).');
    }
    console.log(`Concluído: ${selected.length} documento(s). Documentos e trechos preservados; índice de relações será reconstruído pelo IRIS ao iniciar.`);
  }
} catch (error) {
  console.error('Migração interrompida: ' + (error?.code ?? (error instanceof Error ? error.message : 'erro desconhecido')));
  process.exitCode = 1;
} finally {
  if (connectedSource) await source.end().catch(() => {});
  if (connectedTarget) await target.end().catch(() => {});
  if (from.kind === 's3') from.client.destroy();
  if (to.kind === 's3') to.client.destroy();
}
