import assert from 'node:assert/strict';
import test from 'node:test';
import type { Store } from '../data/storage/database.js';
import type { Chunk, DocumentRecord } from '../core/types.js';
import { config } from '../gateway/config.js';
import { requestsExtendedWriting, sampleChunks, writeExtended } from '../core/orchestrator/longform.js';

test('long-form intent does not intercept routine questions about network resources', () => {
  assert.equal(requestsExtendedWriting('Como funciona a rede local?'), false);
  assert.equal(requestsExtendedWriting('Faça um resumo dos documentos.'), true);
  assert.deepEqual(sampleChunks([1, 2, 3, 4, 5], 3), [1, 3, 5]);
});

test('extended synthesis keeps global citations across batches and reports incomplete coverage', async t => {
  const previous = { LLM_PROVIDER: config.LLM_PROVIDER, LLM_MODEL: config.LLM_MODEL, OLLAMA_BASE_URL: config.OLLAMA_BASE_URL };
  t.after(() => Object.assign(config, previous));
  Object.assign(config, { LLM_PROVIDER: 'ollama', LLM_MODEL: 'test', OLLAMA_BASE_URL: 'http://127.0.0.1:11434/v1' });
  const documents = ['a', 'b'].map(id => ({ id, name: id, domain: 'direito', status: 'ready', chunks: 4 } as DocumentRecord));
  const chunks: Chunk[] = documents.flatMap(document => Array.from({ length: 4 }, (_, index) => ({
    id: `${document.id}-${index}`, documentId: document.id, domain: 'direito', title: document.name,
    text: `Fato verificável ${document.id} ${index}.`, index
  })));
  const store = { documents: async () => documents, chunks: async () => chunks } as unknown as Store;
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const reviewing = body.messages[0].content.includes('revisor independente');
    const data = reviewing
      ? { verdict: 'pass', claims: [{ text: 'Fato verificável.', citations: [1], verdict: 'pass', reason: 'Consta no trecho.' }] }
      : { answer: 'Fato verificável [1].', citations: [1], abstain: false, findings: [] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
  });
  const result = await writeExtended(store, 'Faça um resumo', 'direito', crypto.randomUUID(), ['a', 'b']);
  assert.equal(result.examined, 8);
  assert.equal(result.total, 8);
  assert.match(result.answer, /Fato verificável \[1\]/);
  assert.match(result.answer, /Fato verificável \[7\]/);
  assert.equal(result.reviews.length, 2);
  assert.equal(fetch.mock.callCount(), 4);
});
