import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../data/storage/database.js';
import { Ingestion } from '../data/ingestion/pipeline.js';
import { domainIds } from '../services/domains.js';
import { config } from '../gateway/config.js';
import { MAX_UPLOAD_BYTES } from '../core/ingestion-limits.js';

// Explicit local import of curated top-level source files. The unreviewed
// knowledge/*/links crawl is deliberately excluded from automatic migration.
const [source, domain, action] = process.argv.slice(2);
if (!source || !domainIds.includes(domain) || !['--dry-run', '--import'].includes(action)) {
  console.error('Uso: AUTH_MODE=local npm run import:sofia -- <pasta knowledge/dominio> <dominio> --dry-run|--import');
  process.exitCode = 2;
} else {
  const directory = resolve(source);
  const files = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /\.(pdf|docx|xlsx|csv|txt|md|json)$/i.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) { console.error('Nenhum documento compatível diretamente nesta pasta.'); process.exitCode = 1; }
  else {
    const manifest = await Promise.all(files.map(async entry => ({ name: entry.name, bytes: (await stat(join(directory, entry.name))).size })));
    console.log(JSON.stringify({ domain, directory, files: manifest, skipped: 'subpastas, inclusive links não revisados' }, null, 2));
    if (action === '--import') {
      if (config.NODE_ENV !== 'development' || config.AUTH_MODE !== 'local' || config.DATABASE_URL || config.S3_ENDPOINT)
        throw new Error('Importação direta permitida apenas em desenvolvimento local com armazenamento local. Em produção use o upload autenticado.');
      const store = new Store('', config.DATA_DIR); await store.init();
      const ingestion = new Ingestion(store);
      try {
        for (const file of manifest) {
          if (file.bytes > MAX_UPLOAD_BYTES) { console.log('IGNORADO (acima de 50 MB): ' + file.name); continue; }
          const result = await ingestion.enqueue(file.name, await readFile(join(directory, file.name)), domain, 'sofia-migration');
          await ingestion.flushDocuments();
          const processed = await store.document(result.document.id);
          console.log(JSON.stringify({ name: file.name, duplicate: result.duplicate, status: processed?.status, error: processed?.error }));
        }
      } finally { await ingestion.idle(); await store.close(); }
    }
  }
}
