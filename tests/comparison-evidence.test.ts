import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonIntent, comparisonReport, comparisonSources, validComparisonFindings } from '../core/orchestrator/comparison.js';
import type { Evidence } from '../core/types.js';

const documents = [{ id: 'cct', name: 'Saae_2026_2027.pdf' }, { id: 'law', name: 'Vade_mecum_Senado_Federal_3ed.pdf' }];
const sources: Evidence[] = [
  { id: 'cct:1', documentId: 'cct', title: documents[0].name, page: 1, chunk: 1, text: 'Cláusula segunda. A regra depende de condições.', score: 1 },
  { id: 'law:2', documentId: 'law', title: documents[1].name, page: 240, chunk: 2, text: 'Art. 444. A regra legal exige requisitos.', score: 1 }
];

test('recognizes a comparison expressed as a question about problems across two files', () => {
  const question = 'Quais são os problemas encontrados no SAAE quando olhamos o VADE_MECUM?';
  assert.equal(comparisonIntent(question), true);
  assert.deepEqual(comparisonSources(question, documents), ['cct', 'law']);
  assert.deepEqual(comparisonSources('Quais conflitos existem?', documents, ['cct', 'law']), ['cct', 'law']);
  assert.deepEqual(comparisonSources('Me explique o SAAE.', documents), []);
  assert.deepEqual(comparisonSources('Qual a diferença entre dois conceitos no mesmo PDF?', documents), []);
});

test('a comparison cannot cite only one document or silently omit a selected source', () => {
  const oneSided = [{ leftCitation: 1, rightCitation: 1, relation: 'Conflito', condition: 'Qualquer', conclusion: 'Inválido' }];
  assert.deepEqual(validComparisonFindings(oneSided, sources, ['cct', 'law']), []);
  const valid = [{ leftCitation: 1, rightCitation: 2, relation: 'Diferença de condições', condition: 'Se o caso se enquadrar', conclusion: 'Exige análise individual' }];
  assert.deepEqual(validComparisonFindings(valid, sources, ['cct', 'law']), valid);
  assert.deepEqual(validComparisonFindings(valid, sources, ['cct', 'third']), []);
  const answer = comparisonReport(valid, sources);
  assert.match(answer, /Saae_2026_2027\.pdf, p\. 1.*\[1\]/);
  assert.match(answer, /Vade_mecum_Senado_Federal_3ed\.pdf, p\. 240.*\[2\]/);
  assert.match(answer, /Condições e limites/);
});
