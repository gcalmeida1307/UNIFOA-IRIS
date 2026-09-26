import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { analyzeStructured } from '../core/structured/analysis.js';
import { requestsExtendedWriting } from '../core/orchestrator/longform.js';
import { contextualizeQuestion } from '../core/orchestrator/context.js';
import { ExternalRedaction } from '../security/privacy.js';
import { sourceDomainMap, domainIds } from '../services/domains.js';
import type { DocumentRecord } from '../core/types.js';

test('legal articles keep the ordinary evidence route; writing remains explicit', () => {
  assert.equal(requestsExtendedWriting('O que diz o artigo 444 da CLT?'), false);
  assert.equal(requestsExtendedWriting('Compare o artigo 444 da CLT com a cláusula 2 da CCT.'), false);
  assert.equal(requestsExtendedWriting('Escreva um artigo sobre gestão.'), true);
  assert.match(contextualizeQuestion('E quando são testadas as restaurações?', [{ question: 'Qual a política de backup Atlas?', answer: 'Diariamente.' }]), /backup Atlas/);
});
test('table filters cannot be replaced by totals; aggregates use the full filtered original', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Dados');
  sheet.addRows([['Status', 'Valor', 'Unidades'], ['Ativo', 100, 1], ['Inativo', 200, 2], ['Ativo', 50, 3]]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const document = { id: 'audit', name: 'contas.xlsx', status: 'ready', objectKey: 'audit' } as DocumentRecord;
  const query = (q: string) => analyzeStructured(q, [document], async () => buffer);
  assert.match((await query('Quantos registros com Status Ativo em contas.xlsx?')).answer, /2 linhas/);
  assert.match((await query('Qual a soma da coluna Valor apenas dos registros ativos em contas.xlsx?')).answer, /150/);
  assert.match((await query('Qual a média da coluna Valor com Status Ativo em contas.xlsx?')).answer, /75/);
  assert.match((await query('Qual a soma de Valor por Status em contas.xlsx?')).answer, /Ativo: 150; Inativo: 200/);
  assert.equal((await query('Quantos registros com Status Desconhecido em contas.xlsx?')).verified, false);
  assert.equal((await query('Quantos registros com Valor maior que 100 em contas.xlsx?')).verified, false);
  assert.equal((await query('Quantos registros com Status Ativo e Unidades = 99 em contas.xlsx?')).verified, false);
});
test('privacy pseudonyms are request-local and restore only known placeholders', () => {
  const privacy = new ExternalRedaction();
  const source = 'Contato: pessoa@example.test; CPF: 123.456.789-09; paciente: Maria da Silva\nArtigo 444, parágrafo único.';
  const cleaned = privacy.clean(source);
  assert.doesNotMatch(cleaned, /pessoa@example|123\.456|Maria/);
  assert.match(cleaned, /Artigo 444/);
  assert.equal(privacy.restore(cleaned), source);
  assert.equal(new ExternalRedaction().restore('__IRIS_PRIVATE_1__'), '__IRIS_PRIVATE_1__');
});
test('SOFIA scopes retain distinct personnel and human resources domains', () => {
  for (const id of ['almoxarifado', 'departamento-pessoal', 'prefeitura']) assert.ok(domainIds.includes(id));
  assert.equal(sourceDomainMap['recursos-humanos'], 'pessoas');
  assert.equal(sourceDomainMap['gestao-empresarial'], 'empresarial');
  assert.notEqual(sourceDomainMap['departamento-pessoal'], sourceDomainMap['recursos-humanos']);
});
