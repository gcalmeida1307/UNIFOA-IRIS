import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../data/storage/database.js';
import { Ingestion } from '../data/ingestion/pipeline.js';
import { extensions } from '../data/ingestion/extract.js';
import { sourceDomainMap } from '../services/domains.js';
import { config } from '../gateway/config.js';
const source = resolve('../sofia/knowledge');
const apply = process.argv.includes('--apply');
const excluded = new Set(['.versions', 'links', 'offline', 'quarantine', 'node_modules', '.git']);
const store = new Store(); await store.init();
config.KNOWLEDGE_ENABLED = false;
const ingestion = new Ingestion(store), manifest: Array<Record<string, unknown>> = [];
async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory() && !excluded.has(item.name)) files.push(...await walk(join(directory, item.name)));
    else if (item.isFile() && extensions.includes(extname(item.name).toLowerCase())) files.push(join(directory, item.name));
  }
  return files.sort();
}
try {
  for (const file of await walk(source)) {
    const path = relative(source, file), domain = sourceDomainMap[path.split(/[\\/]/)[0]];
    if (!domain) { manifest.push({ path, status: 'unmapped-domain' }); continue; }
    const bytes = (await stat(file)).size;
    if (bytes > 50 * 1024 * 1024) { manifest.push({ path, domain, status: 'oversize', bytes }); continue; }
    const content = await readFile(file), hash = createHash('sha256').update(content).digest('hex');
    const exists = (await store.documents(domain)).find(d => d.hash === hash && d.status === 'ready');
    if (exists) { manifest.push({ path, domain, hash, status: 'already-present', documentId: exists.id }); continue; }
    if (!apply) { manifest.push({ path, domain, hash, status: 'to-import', bytes }); continue; }
    const result = await ingestion.enqueue(file, content, domain, 'sofia-migration');
    await ingestion.flushDocuments();
    const doc = await store.document(result.document.id);
    manifest.push({ path, domain, hash, status: doc?.status, error: doc?.error, documentId: doc?.id, chunks: doc?.chunks });
    console.log(domain + ': ' + path + ' -> ' + doc?.status);
  }
} finally {
  await ingestion.idle(); await store.close();
  await mkdir('work/migration', { recursive: true });
  const report = { source, applied: apply, excludedDirectories: [...excluded], reason: 'Não admitir versões históricas, capturas web e candidatos gerados como fontes atuais sem revisão.', manifest };
  await writeFile('work/migration/sofia-' + (apply ? 'import' : 'preview') + '.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(manifest.reduce<Record<string, number>>((counts, item) => { const key = String(item.status); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {})));
  if (manifest.some(item => item.status === 'failed' || item.status === 'unmapped-domain' || item.status === 'oversize')) process.exitCode = 1;
}
