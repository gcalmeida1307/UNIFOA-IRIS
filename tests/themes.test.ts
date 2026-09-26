import assert from 'node:assert/strict';
import test from 'node:test';
import { themesForRuns } from '../core/llmops/themes.js';
import type { Run } from '../core/types.js';

test('topic analytics groups repeated questions and feedback without revealing unique topics', () => {
  const run = (question: string, feedback?: 1 | -1): Run => ({ id: crypto.randomUUID(), owner: 'someone', domain: 'direito', createdAt: new Date().toISOString(), question, answer: 'Resposta.', sources: [{ id: 's', documentId: 'd', title: 'Lei', text: 'Fonte', chunk: 1, score: 1 }], steps: [], mode: 'model', status: 'completed', durationMs: 10, inputTokens: 1, outputTokens: 1, feedback });
  const result = themesForRuns([run('Como funciona usucapião?', -1), run('Requisitos do usucapião', 1), run('Segredo único', 1)]);
  assert.equal(result.totalQueries, 3);
  assert.deepEqual(result.topThemes.map(item => item.theme), ['usucapiao']);
  assert.equal(result.topThemes[0].poor, 1);
  assert.equal(result.topThemes[0].useful, 1);
});
