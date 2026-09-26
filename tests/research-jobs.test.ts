import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../data/storage/database.js';
import { ResearchJobs, interleaveChunks } from '../core/orchestrator/research-jobs.js';
import { config } from '../gateway/config.js';

test('full-corpus batches mix documents while retaining every passage', () => {
  assert.deepEqual(interleaveChunks([['a1', 'a2', 'a3'], ['b1', 'b2']]), ['a1', 'b1', 'a2', 'b2', 'a3']);
});

test('background research checkpoints all document chunks and persists the result', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'iris-research-'));
  const previous = { LLM_PROVIDER: config.LLM_PROVIDER, LLM_MODEL: config.LLM_MODEL, OLLAMA_BASE_URL: config.OLLAMA_BASE_URL };
  Object.assign(config, { LLM_PROVIDER: 'ollama', LLM_MODEL: 'local', OLLAMA_BASE_URL: 'http://127.0.0.1:11434/v1' });
  const store = new Store('', directory); await store.init();
  t.after(async () => { await store.close(); rmSync(directory, { recursive: true, force: true }); Object.assign(config, previous); });
  const documentId = crypto.randomUUID();
  const document = { id: documentId, name: 'Manual', domain: 'direito', hash: 'digest', status: 'ready', createdAt: '2026-01-01', owner: 'user', size: 1, chunks: 7, stages: [] };
  await store.sql('INSERT INTO documents(id,domain,hash,payload) VALUES(?,?,?,?)', [documentId, 'direito', 'digest', JSON.stringify(document)]);
  for (let index = 0; index < 7; index++) await store.addChunk({ id: crypto.randomUUID(), documentId, domain: 'direito', title: 'Manual', text: 'Fato ' + index, index });
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const reviewing = JSON.parse(String(init?.body)).messages[0].content.includes('revisor independente');
    const data = reviewing
      ? { verdict: 'pass', claims: [{ text: 'Fato', citations: [1], verdict: 'pass', reason: 'Fonte.' }] }
      : { answer: 'Fato [1].', citations: [1], abstain: false, findings: [] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
  });
  const jobs = new ResearchJobs(store);
  const created = await jobs.start('user', 'direito', 'Faça um resumo integral', [documentId]);
  let latest = await jobs.get(created.id, 'user', 'direito');
  for (let attempt = 0; latest?.status !== 'completed' && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10)); latest = await jobs.get(created.id, 'user', 'direito');
  }
  assert.equal(latest?.status, 'completed', latest?.error);
  assert.equal(latest?.cursor, 7);
  assert.equal(latest?.total, 7);
  const run = await store.run(created.id);
  assert.equal(run?.sources.length, 7);
  assert.match(run?.answer ?? '', /Fato \[7\]/);
  await jobs.close();
  const interruptedId = crypto.randomUUID();
  const interrupted = { ...created, id: interruptedId, status: 'running', cursor: 6, sections: ['### Parte 1\n\nFato [1].'], runId: undefined };
  await store.sql('INSERT INTO research_jobs(id,owner,domain,created_at,payload) VALUES(?,?,?,?,?)', [interruptedId, 'user', 'direito', interrupted.createdAt, JSON.stringify(interrupted)]);
  const resumedJobs = new ResearchJobs(store);
  assert.equal((await resumedJobs.get(interruptedId, 'user', 'direito'))?.status, 'paused');
  const beforeResume = fetch.mock.callCount();
  await resumedJobs.resume(interruptedId, 'user', 'direito');
  let resumed = await resumedJobs.get(interruptedId, 'user', 'direito');
  for (let attempt = 0; resumed?.status !== 'completed' && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10)); resumed = await resumedJobs.get(interruptedId, 'user', 'direito');
  }
  assert.equal(resumed?.status, 'completed', resumed?.error);
  assert.equal(fetch.mock.callCount() - beforeResume, 2);
  assert.match((await store.run(interruptedId))?.answer ?? '', /Fato \[7\]/);
  await resumedJobs.close();
});
