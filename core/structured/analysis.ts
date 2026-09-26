import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { DocumentRecord } from '../types.js';
import { loadObject } from '../../data/storage/objects.js';
import { tokenize } from '../../data/processing/text.js';

export type StructuredResult = { answer: string; document?: DocumentRecord; detail: string };
const countQuestion = /\b(quant[oa]s?|conte|contagem|n[uú]mero de|total de)\b.*\b(linhas?|registros?|dados|entradas?)\b/iu;
const sumQuestion = /\b(soma|somar|somat[oó]rio|total)\b.*\b(coluna|campo)\b/iu;
export function isStructuredQuestion(question: string) { return countQuestion.test(question) || sumQuestion.test(question); }

function value(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String(v.text);
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}
function numeric(cell: ExcelJS.Cell): number | undefined {
  const v = cell.value;
  const raw = v && typeof v === 'object' && 'result' in v ? v.result : v;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().replace(/\s/g, '');
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(text)) return undefined;
  const number = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

/** Read the stored original, never a RAG sample. No external formulas or macros are executed. */
export async function analyzeStructured(question: string, documents: DocumentRecord[], read: typeof loadObject = loadObject): Promise<StructuredResult> {
  const candidates = documents.filter(d => d.status === 'ready' && /\.(xlsx|csv)$/i.test(d.name) && d.objectKey);
  const named = candidates.filter(d => question.toLocaleLowerCase('pt-BR').includes(d.name.toLocaleLowerCase('pt-BR')));
  const matches = named.length ? named : candidates;
  if (matches.length !== 1) return { answer: matches.length ? 'Há mais de uma planilha neste módulo. Indique o nome do arquivo: ' + matches.map(d => d.name).join(', ') + '.' : 'Não encontrei uma planilha XLSX ou CSV disponível neste módulo.', detail: 'Arquivo ausente ou ambíguo.' };
  const document = matches[0];
  const workbook = new ExcelJS.Workbook();
  const content = await read(document.objectKey!);
  if (document.name.toLowerCase().endsWith('.xlsx')) await workbook.xlsx.load(content as any);
  else await workbook.csv.read(Readable.from([content]));
  const explicitSheets = workbook.worksheets.filter(sheet => question.toLocaleLowerCase('pt-BR').includes(sheet.name.toLocaleLowerCase('pt-BR')));
  const sheets = explicitSheets.length ? explicitSheets : workbook.worksheets;
  if (sheets.length !== 1) return { document, answer: 'O arquivo ' + document.name + ' tem várias abas. Indique uma delas: ' + sheets.map(s => s.name).join(', ') + '.', detail: 'Aba ambígua.' };
  const sheet = sheets[0];
  const populated: ExcelJS.Row[] = [];
  sheet.eachRow(row => { if (row.hasValues) populated.push(row); });
  if (!populated.length) return { document, answer: `A aba ${sheet.name} de ${document.name} está vazia.`, detail: 'Arquivo integral lido; aba vazia.' };
  const header = populated[0];
  const rows = populated.slice(1);
  if (countQuestion.test(question)) return { document, answer: `A aba ${sheet.name} de ${document.name} contém ${rows.length.toLocaleString('pt-BR')} linhas de dados, excluindo a primeira linha (cabeçalho). Li a aba inteira; linhas totalmente vazias não entram na contagem.`, detail: `Aba ${sheet.name}; ${rows.length} linhas de dados.` };
  const columns = Array.from({ length: header.cellCount }, (_, i) => ({ index: i + 1, name: value(header.getCell(i + 1)) })).filter(c => c.name);
  const normalizedQuestion = new Set(tokenize(question));
  const selected = columns.filter(c => { const terms = tokenize(c.name); return terms.length && terms.every(t => normalizedQuestion.has(t)); });
  if (selected.length !== 1) return { document, answer: 'Para calcular a soma em ' + document.name + ', indique uma coluna pelo nome: ' + columns.map(c => c.name).join(', ') + '.', detail: 'Coluna ausente ou ambígua.' };
  let total = 0, valid = 0, ignored = 0;
  for (const row of rows) {
    const cell = row.getCell(selected[0].index);
    const number = numeric(cell);
    if (number === undefined) { if (value(cell)) ignored++; continue; }
    total += number; valid++;
  }
  return { document, answer: `A soma da coluna “${selected[0].name}” na aba ${sheet.name} de ${document.name} é ${total.toLocaleString('pt-BR', { maximumFractionDigits: 10 })}. Calculei ${valid} células numéricas na aba inteira${ignored ? `; ignorei ${ignored} células com valores não numéricos` : ''}.`, detail: `Aba ${sheet.name}; coluna ${selected[0].name}; ${valid} valores numéricos.` };
}
