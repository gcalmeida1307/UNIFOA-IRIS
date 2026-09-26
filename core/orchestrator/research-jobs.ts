import type { Store } from '../../data/storage/database.js';
import type { Evidence, Run } from '../types.js';
import { writeEvidenceBatch } from './longform.js';

export type ResearchJob = {
  id: string; owner: string; domain: string; question: string; documentIds: string[];
  fingerprints: Record<string, string>; status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  cursor: number; total: number; sections: string[]; inputTokens: number; outputTokens: number;
  createdAt: string; updatedAt: string; runId?: string; error?: string;
};

export function interleaveChunks<T>(groups: T[][]): T[] {
  return Array.from({ length: Math.max(0, ...groups.map(items => items.length)) }, (_, position) =>
    groups.map(items => items[position]).filter((item): item is NonNullable<typeof item> => item !== undefined)
  ).flat();
}

export class ResearchJobs {
  private active = new Map<string, Promise<void>>();
  private ready: Promise<void>;
  constructor(private store: Store) { this.ready = this.init(); }
  private async init() {
    await this.store.sql('CREATE TABLE IF NOT EXISTS research_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, domain TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)');
    for (const row of await this.store.sql('SELECT payload FROM research_jobs')) {
      const job = JSON.parse(row.payload) as ResearchJob;
      if (['running', 'queued'].includes(job.status)) { job.status = 'paused'; await this.persist(job); }
    }
  }
  private async persist(job: ResearchJob) {
    job.updatedAt = new Date().toISOString();
    await this.store.sql('INSERT INTO research_jobs(id,owner,domain,created_at,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [job.id, job.owner, job.domain, job.createdAt, JSON.stringify(job)]);
  }
  async get(id: string, owner: string, domain: string): Promise<ResearchJob | undefined> {
    await this.ready;
    const rows = await this.store.sql('SELECT payload FROM research_jobs WHERE id=? AND owner=? AND domain=?', [id, owner, domain]);
    return rows[0] ? JSON.parse(rows[0].payload) as ResearchJob : undefined;
  }
  async list(owner: string, domain: string): Promise<ResearchJob[]> {
    await this.ready;
    return (await this.store.sql('SELECT payload FROM research_jobs WHERE owner=? AND domain=? ORDER BY created_at DESC LIMIT 20', [owner, domain])).map(row => JSON.parse(row.payload) as ResearchJob);
  }
  async start(owner: string, domain: string, question: string, documentIds: string[]) {
    await this.ready;
    if ((await this.list(owner, domain)).some(job => ['queued', 'running'].includes(job.status))) throw new Error('Já existe uma pesquisa em andamento neste domínio.');
    const documents = (await this.store.documents(domain)).filter(doc => doc.status === 'ready' && documentIds.includes(doc.id));
    if (documents.length !== documentIds.length) throw new Error('Um documento selecionado está indisponível neste domínio.');
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const job: ResearchJob = { id, owner, domain, question, documentIds, fingerprints: Object.fromEntries(documents.map(doc => [doc.id, doc.hash])), status: 'queued', cursor: 0, total: documents.reduce((sum, doc) => sum + doc.chunks, 0), sections: [], inputTokens: 0, outputTokens: 0, createdAt: now, updatedAt: now };
    await this.persist(job);
    this.schedule(job);
    return job;
  }
  async resume(id: string, owner: string, domain: string) {
    const job = await this.get(id, owner, domain);
    if (!job || !['paused', 'failed'].includes(job.status)) return undefined;
    job.error = undefined; job.status = 'queued'; await this.persist(job); this.schedule(job); return job;
  }
  async cancel(id: string, owner: string, domain: string) {
    const job = await this.get(id, owner, domain);
    if (!job || !['queued', 'running', 'paused'].includes(job.status)) return false;
    job.status = 'cancelled'; await this.persist(job); return true;
  }
  private schedule(job: ResearchJob) {
    const promise = this.run(job).catch(error => {
      console.error(JSON.stringify({ event: 'research.failed', job: job.id, type: error instanceof Error ? error.name : 'Error' }));
    }).finally(() => { this.active.delete(job.id); });
    this.active.set(job.id, promise);
  }
  async close() {
    for (const id of this.active.keys()) {
      const job = (await this.store.sql('SELECT payload FROM research_jobs WHERE id=?', [id]))[0];
      if (job) { const value = JSON.parse(job.payload) as ResearchJob; value.status = 'paused'; await this.persist(value); }
    }
    await Promise.all(this.active.values());
  }
  private async run(job: ResearchJob) {
    try {
      job.status = 'running'; await this.persist(job);
      const documents = (await this.store.documents(job.domain)).filter(doc => job.documentIds.includes(doc.id));
      if (documents.length !== job.documentIds.length || documents.some(doc => doc.hash !== job.fingerprints[doc.id] || doc.status !== 'ready')) throw new Error('Os documentos mudaram desde o início. Crie uma pesquisa nova.');
      const available = await this.store.chunks(job.domain);
      const grouped = job.documentIds.map(id => available.filter(chunk => chunk.documentId === id).sort((a, b) => a.index - b.index));
      const chunks = interleaveChunks(grouped);
      if (chunks.length !== job.total) throw new Error('A indexação mudou desde o início. Crie uma pesquisa nova.');
      for (let offset = job.cursor; offset < chunks.length; offset += 6) {
        if ((await this.get(job.id, job.owner, job.domain))?.status !== 'running') return;
        const batch: Evidence[] = chunks.slice(offset, offset + 6).map(chunk => ({ id: chunk.id, documentId: chunk.documentId, title: chunk.title, text: chunk.text, chunk: chunk.index + 1, page: chunk.page, score: 1, sourceUrl: chunk.sourceUrl, capturedAt: chunk.capturedAt }));
        const written = await writeEvidenceBatch(job.question, batch, offset, job.id);
        if ((await this.get(job.id, job.owner, job.domain))?.status !== 'running') return;
        if (written.answer) job.sections.push(`### Parte ${job.sections.length + 1}\n\n${written.answer}`);
        job.cursor = offset + batch.length;
        job.inputTokens += written.inputTokens; job.outputTokens += written.outputTokens;
        await this.persist(job);
      }
      const sources: Evidence[] = chunks.map(chunk => ({ id: chunk.id, documentId: chunk.documentId, title: chunk.title, text: chunk.text, chunk: chunk.index + 1, page: chunk.page, score: 1, sourceUrl: chunk.sourceUrl, capturedAt: chunk.capturedAt }));
      const run: Run = { id: job.id, owner: job.owner, domain: job.domain, question: job.question, createdAt: job.createdAt,
        answer: job.sections.length ? job.sections.join('\n\n') + `\n\nCobertura: ${job.cursor}/${job.total} trechos dos ${documents.length} documentos selecionados examinados. Seções sem evidência aprovada foram omitidas.` : 'Todos os trechos foram examinados, mas nenhuma seção passou na revisão de evidências.',
        sources, steps: [], mode: 'model', status: job.sections.length ? 'completed' : 'abstained', durationMs: Date.now() - new Date(job.createdAt).getTime(), inputTokens: job.inputTokens, outputTokens: job.outputTokens, workflow: 'background-full-corpus-v1' };
      await this.store.saveRun(run);
      job.runId = run.id; job.status = 'completed'; await this.persist(job);
    } catch (error) {
      job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Falha ao processar documentos.'; await this.persist(job);
    }
  }
}
