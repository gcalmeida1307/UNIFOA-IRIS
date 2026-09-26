// Initial migration only: replace conflicting indexes of identical originals.
// Existing IRIS document IDs and object keys are retained. Back up first.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
const apply = process.argv.includes('--apply');
const origin = parse(readFileSync(resolve('../LUMINA/.env'))), target = parse(readFileSync('.env'));
if (origin.S3_ENDPOINT || target.S3_ENDPOINT) throw new Error('Esta reconciliação requer armazenamento local.');
if (origin.DATABASE_URL === target.DATABASE_URL) throw new Error('Bancos devem ser distintos.');
const source = new pg.Client({ connectionString: origin.DATABASE_URL }), destination = new pg.Client({ connectionString: target.DATABASE_URL });
const records = [];
try {
  await source.connect(); await destination.connect();
  await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const rows = (await source.query('SELECT payload FROM documents')).rows.map(r => JSON.parse(r.payload));
  const targets = (await destination.query('SELECT payload FROM documents')).rows.map(r => JSON.parse(r.payload));
  if (Number((await destination.query('SELECT count(*) AS n FROM runs')).rows[0].n)) throw new Error('Reconciliação inicial recusada: há consultas persistidas que precisam de migração versionada.');
  for (const doc of rows.filter(d => d.status === 'ready')) {
    const old = targets.find(d => d.hash === doc.hash && d.domain === doc.domain);
    if (!old || (old.status === 'ready' && old.chunks === doc.chunks)) continue;
    for (const key of [doc.objectKey, old.objectKey]) if (!/^[a-f0-9-]{36}$/i.test(key ?? '')) throw new Error('Chave de objeto inválida.');
    const content = readFileSync(resolve('../LUMINA', origin.DATA_DIR || 'data/runtime', 'objects', doc.objectKey));
    const existing = readFileSync(resolve(target.DATA_DIR || 'data/runtime', 'objects', old.objectKey));
    const hash = b => createHash('sha256').update(doc.sourceUrl ?? '').update(b).digest('hex');
    if (hash(content) !== doc.hash || hash(existing) !== doc.hash) throw new Error('Os originais divergem: ' + doc.name);
    const chunks = (await source.query('SELECT payload FROM chunks WHERE document_id=$1', [doc.id])).rows.map(r => JSON.parse(r.payload));
    if (chunks.length !== doc.chunks || !chunks.length || chunks.some(c => c.documentId !== doc.id || c.domain !== doc.domain)) throw new Error('Índice de origem inconsistente.');
    const mapped = chunks.map(c => ({ ...c, id: old.id + ':' + c.index, documentId: old.id }));
    const next = { ...doc, id: old.id, objectKey: old.objectKey, owner: old.owner };
    const record = { name: doc.name, domain: doc.domain, oldChunks: old.chunks, newChunks: doc.chunks, oldStatus: old.status, preservedId: old.id, sourceId: doc.id, hash: doc.hash };
    if (apply) {
      await destination.query('BEGIN');
      try {
        await destination.query('DELETE FROM knowledge_relations WHERE source=$1 OR target=$1', [old.id]);
        await destination.query('DELETE FROM knowledge_terms WHERE document_id=$1', [old.id]);
        await destination.query('DELETE FROM knowledge_jobs WHERE document_id=$1', [old.id]);
        await destination.query('DELETE FROM chunks WHERE document_id=$1', [old.id]);
        for (let i = 0; i < mapped.length; i += 100) {
          const batch = mapped.slice(i, i + 100);
          const placeholders = batch.map((_, j) => '(' + [1,2,3,4].map(n => '$' + (j * 4 + n)).join(',') + ')').join(',');
          await destination.query('INSERT INTO chunks(id,document_id,domain,payload) VALUES ' + placeholders, batch.flatMap(c => [c.id, old.id, c.domain, JSON.stringify(c)]));
        }
        await destination.query('UPDATE documents SET payload=$1 WHERE id=$2', [JSON.stringify(next), old.id]);
        await destination.query('INSERT INTO revisions(domain,value) VALUES($1,1) ON CONFLICT(domain) DO UPDATE SET value=revisions.value+1', [old.domain]);
        await destination.query('COMMIT');
      } catch (e) { await destination.query('ROLLBACK'); throw e; }
    }
    records.push(record); console.log(JSON.stringify(record));
  }
  await source.query('ROLLBACK');
  mkdirSync('work/migration', { recursive: true });
  writeFileSync(join('work/migration', apply ? 'reconciled.json' : 'reconcile-preview.json'), JSON.stringify({ applied: apply, records }, null, 2));
} finally { await source.end(); await destination.end(); }
