import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../data/storage/database.js';
import type { Run } from '../core/types.js';

test('an older conversation survives a busy history and stays scoped to its owner', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'iris-history-'));
  const store = new Store('', directory);
  t.after(async () => { await store.close(); rmSync(directory, { recursive: true, force: true }); });
  await store.init();
  const olderId = crypto.randomUUID();
  const run = (index: number, owner: string, conversationId: string): Run => ({
    id: crypto.randomUUID(), owner, domain: 'direito', conversationId,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    question: `Pergunta ${index}`, answer: `Resposta ${index}`, sources: [], steps: [],
    mode: 'extractive', status: 'completed', durationMs: 0, inputTokens: 0, outputTokens: 0
  });
  await store.saveRun(run(0, 'a', olderId));
  for (let index = 1; index <= 101; index++) await store.saveRun(run(index, 'a', crypto.randomUUID()));
  await store.saveRun(run(102, 'b', olderId));
  assert.deepEqual((await store.conversationRuns('a', 'direito', olderId)).map(item => item.question), ['Pergunta 0']);
});
