import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, generationEnabled } from '../gateway/config.js';
import { Store } from '../data/storage/database.js';
import { Ingestion } from '../data/ingestion/pipeline.js';
import { orchestrate } from '../core/orchestrator/graph.js';
import type { ConversationTurn } from '../core/types.js';

if (!generationEnabled()) throw new Error('Provedor real não configurado.');
config.DATA_DIR = await mkdtemp(join(tmpdir(), 'iris-acceptance-'));
config.KNOWLEDGE_ENABLED = false; config.EMBEDDING_MODEL = '';
const store = new Store('', config.DATA_DIR); await store.init();
const ingestion = new Ingestion(store);
const results = [];
const providerResponses: unknown[] = [];
const request = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await request(...args);
  if (String(args[0]).endsWith('/chat/completions')) {
    const body = await response.clone().json();
    providerResponses.push(body.choices?.[0]?.message?.content ?? { status: response.status });
  }
  return response;
};
try {
  await ingestion.enqueue('Atlas-backup-policy-english.md', Buffer.from('Atlas backup policy requires nightly encrypted backups. Each backup is retained for 30 days. Restores are tested every Friday. The policy applies to the Atlas service only. The operations team records the outcome of every restore test in the service log.'), 'infraestrutura', 'acceptance');
  await ingestion.enqueue('Building-maintenance.md', Buffer.from('Building maintenance requires cleaning the entrance every Monday. The reception team inspects doors and windows every month. These instructions concern the physical building, not information technology backup or restoration procedures.'), 'infraestrutura', 'acceptance');
  await ingestion.flushDocuments();
  const history: ConversationTurn[] = [];
  const questions = ['Qual é a frequência de backup do serviço Atlas e por quanto tempo as cópias são mantidas?', 'E quando são testadas as restaurações?'];
  for (const question of questions) {
    console.log('Validando: ' + question);
    const run = await orchestrate(store, { id: 'acceptance', roles: ['viewer'], domains: ['infraestrutura'] }, question, 'infraestrutura', false, history, crypto.randomUUID(), step => console.log('  ' + step.name));
    results.push(run); history.push({ question, answer: run.answer });
    console.log(JSON.stringify({ status: run.status, answer: run.answer, sources: run.sources.map(s => s.title), review: run.review?.verdict }));
    assert.equal(run.status, 'completed');
    assert.equal(run.review?.verdict, 'pass');
    assert.ok(run.sources.some(s => s.title === 'Atlas-backup-policy-english.md'));
  }
  assert.match(results[0].answer, /30/);
  assert.match(results[0].answer, /noite|noturn|di[aá]ri/i);
  assert.match(results[1].answer, /sexta/i);
  console.log('PASS: fonte inglesa → resposta em português + continuidade de contexto, com revisão real.');
} finally {
  globalThis.fetch = request;
  await ingestion.idle(); await store.close();
  await mkdir('work/validation', { recursive: true });
  await writeFile('work/validation/chat-real.json', JSON.stringify({ testedAt: new Date().toISOString(), provider: config.LLM_PROVIDER, model: config.LLM_MODEL, runs: results, providerResponses }, null, 2));
}
