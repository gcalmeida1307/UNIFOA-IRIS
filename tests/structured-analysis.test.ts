import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import type { DocumentRecord } from '../core/types.js';
import { analyzeStructured } from '../core/structured/analysis.js';
const doc = (name: string): DocumentRecord => ({ id: '93d578bc-1fea-4b4f-bc07-004500cafec1', name, domain: 'financeiro', owner: 'owner', hash: 'hash', status: 'ready', createdAt: '', size: 1, chunks: 1, stages: [], objectKey: '93d578bc-1fea-4b4f-bc07-004500cafec1' });
test('counts the whole workbook and totals only numeric cells with provenance', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Janeiro');
  sheet.addRow(['Item', 'Valor']); sheet.addRow(['A', 100]); sheet.addRow(['B', '2.500,50']); sheet.addRow(['C', 'não informado']);
  sheet.addRow([]); sheet.addRow(['D', 50]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const read = async () => buffer;
  const count = await analyzeStructured('Quantas linhas há em contas.xlsx?', [doc('contas.xlsx')], read);
  assert.match(count.answer, /4 linhas de dados/); assert.equal(count.document?.name, 'contas.xlsx');
  const sum = await analyzeStructured('Qual é a soma da coluna Valor em contas.xlsx?', [doc('contas.xlsx')], read);
  assert.match(sum.answer, /2\.650,5/); assert.match(sum.answer, /ignorei 1/);
});
test('requires an unambiguous file and worksheet before computing', async () => {
  const book = new ExcelJS.Workbook(); book.addWorksheet('Janeiro').addRow(['Item']); book.addWorksheet('Fevereiro').addRow(['Item']);
  const content = Buffer.from(await book.xlsx.writeBuffer());
  const ambiguousFile = await analyzeStructured('Quantas linhas existem?', [doc('contas.xlsx'), doc('outras.xlsx')], async () => content);
  assert.match(ambiguousFile.answer, /Indique o nome do arquivo/);
  const ambiguousSheet = await analyzeStructured('Quantas linhas existem em contas.xlsx?', [doc('contas.xlsx')], async () => content);
  assert.match(ambiguousSheet.answer, /Indique uma delas/);
});
test('counts CSV records from the original file including quoted delimiters', async () => {
  const content = Buffer.from('Produto,Valor\n"Cabo, azul",10\nSwitch,20\n');
  const result = await analyzeStructured('Quantos registros em estoque.csv?', [doc('estoque.csv')], async () => content);
  assert.match(result.answer, /2 linhas de dados/);
});
