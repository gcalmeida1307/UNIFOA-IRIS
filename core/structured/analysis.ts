import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { DocumentRecord } from '../types.js';
import { loadObject } from '../../data/storage/objects.js';

export type StructuredResult = { answer: string; document?: DocumentRecord; detail: string; verified?: boolean };
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const singular = (s: string) => normalize(s).split(' ').map(t => t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t).join(' ');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, name: string) => new RegExp('(?:^|[^a-z0-9])' + escape(singular(name)) + '(?=$|[^a-z0-9])').test(singular(text));
type Operation = 'count' | 'sum' | 'average' | 'min' | 'max' | 'correlation';
function operation(question: string): Operation | undefined {
  const q = normalize(question);
  if (/\bcorrelacao\b/.test(q)) return 'correlation';
  if (/\bmedia\b/.test(q)) return 'average';
  if (/\b(minimo|menor valor)\b/.test(q)) return 'min';
  if (/\b(maximo|maior valor)\b/.test(q)) return 'max';
  if (/\b(soma|somar|somatorio)\b/.test(q) || /\btotal\b.*\b(coluna|campo)\b/.test(q)) return 'sum';
  if (/\b(quant[oa]s?|conte|contagem|numero de|total de)\b.*\b(linhas?|registros?|dados|entradas?)\b/.test(q)) return 'count';
}
export function isStructuredQuestion(question: string) { return Boolean(operation(question)); }
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
export function numeric(cell: ExcelJS.Cell): number | undefined {
  const v = cell.value;
  const raw = v && typeof v === 'object' && 'result' in v ? v.result : v;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  let text = raw.trim().replace(/R\$|\s/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d{3})*(?:,\d+)?|\d+\.\d+)$/.test(text)) return undefined;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}
/** Complete original-file computation; filters must be recognized before any aggregate. */
export async function analyzeStructured(question: string, documents: DocumentRecord[], read: typeof loadObject = loadObject): Promise<StructuredResult> {
  const candidates = documents.filter(d => d.status === 'ready' && /\.(xlsx|csv)$/i.test(d.name) && d.objectKey);
  const named = candidates.filter(d => normalize(question).includes(normalize(d.name)));
  const matches = named.length ? named : candidates;
  if (matches.length !== 1) return { answer: matches.length ? 'Há mais de uma planilha neste módulo. Indique o nome do arquivo: ' + matches.map(d => d.name).join(', ') + '.' : 'Não encontrei uma planilha XLSX ou CSV disponível neste módulo.', detail: 'Arquivo ausente ou ambíguo.', verified: false };
  const document = matches[0];
  const clarify = (answer: string): StructuredResult => ({ document, answer, detail: 'Critério ausente, ambíguo ou não suportado.', verified: false });
  const workbook = new ExcelJS.Workbook();
  const content = await read(document.objectKey!);
  if (document.name.toLowerCase().endsWith('.xlsx')) await workbook.xlsx.load(content as any);
  else {
    const first = content.toString('utf8').split(/\r?\n/)[0];
    const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
    const options: Partial<ExcelJS.CsvReadOptions> & { delimiter: string } = { delimiter, map: (value: string) => value };
    await workbook.csv.read(Readable.from([content]), options);
  }
  const explicitSheets = workbook.worksheets.filter(s => mentions(question, s.name));
  const sheets = explicitSheets.length ? explicitSheets : workbook.worksheets;
  if (sheets.length !== 1) return clarify('O arquivo ' + document.name + ' tem várias abas. Indique uma delas: ' + sheets.map(s => s.name).join(', ') + '.');
  const sheet = sheets[0], populated: ExcelJS.Row[] = [];
  sheet.eachRow(row => { if (row.hasValues) populated.push(row); });
  if (!populated.length) return { document, answer: `A aba ${sheet.name} de ${document.name} está vazia.`, detail: 'Arquivo integral lido; aba vazia.', verified: true };
  const header = populated[0], allRows = populated.slice(1);
  const columns = Array.from({ length: header.cellCount }, (_, i) => ({ index: i + 1, name: value(header.getCell(i + 1)) })).filter(c => c.name);
  const op = operation(question);
  if (!op) return clarify('Indique contagem, soma, média, mínimo, máximo ou correlação.');
  const q = normalize(question).replace(normalize(document.name), '');
  // Do not reinterpret unsupported ranges, exclusions or disjunctions as equality.
  if (/\b(exceto|excluindo|menos de|mais de|acima de|abaixo de|maior que|menor que|entre|antes de|depois de|distintos|unicos|percentual)\b|[<>]|\bnao\s+\w+/.test(q)) return clarify('Esse critério precisa de uma operação específica. Informe filtros de igualdade (coluna = valor); não substituí o filtro pelo total.');
  const group = columns.filter(c => mentions(q, 'por ' + c.name));
  if (group.length > 1) return clarify('Indique uma única coluna para agrupamento.');
  const numericColumns = columns.filter(c => allRows.some(r => numeric(r.getCell(c.index)) !== undefined));
  const selected = numericColumns.filter(c => mentions(q, c.name) && c !== group[0]);
  if (op !== 'count' && selected.length !== (op === 'correlation' ? 2 : 1)) return clarify('Indique ' + (op === 'correlation' ? 'duas colunas numéricas' : 'uma coluna numérica') + ' pelo nome: ' + columns.map(c => c.name).join(', ') + '.');
  const filters: { index: number; name: string; text: string }[] = [];
  for (const column of columns.filter(c => !selected.includes(c) && c !== group[0])) {
    const values = [...new Set(allRows.map(r => value(r.getCell(column.index))).filter(v => v && !/^\d+(?:[.,]\d+)?$/.test(v)))];
    const found = values.filter(v => (v.length >= 3 || mentions(q, column.name)) && mentions(q, v));
    if (found.length > 1) return clarify('O filtro da coluna ' + column.name + ' é ambíguo. Informe um valor exato.');
    if (found.length === 1) filters.push({ ...column, text: found[0] });
  }
  if (filters.some(f => filters.some(g => g !== f && singular(g.text) === singular(f.text))) && filters.some(f => !mentions(q, f.name))) return clarify('O valor aparece em mais de uma coluna. Informe a coluna do filtro.');
  const filterMarker = /\b(com|onde|apenas|somente|filtr\w*|cujo\w*|que|quando|dos registros|das linhas)\b|=/.test(q);
  if (filterMarker && !filters.length) return clarify('Não reconheci o filtro. Informe a coluna e o valor exatos; não vou responder com o total geral.');
  // A second unresolved explicit filter must not silently disappear.
  const equality = [...q.matchAll(/([\p{L}\p{N}_ ]+)\s*=\s*([^,;]+?)(?=\s+e\s+|$)/gu)];
  if (equality.some(m => !filters.some(f => mentions(m[1], f.name) && singular(m[2].replace(/[?.!]$/, '')) === singular(f.text)))) return clarify('Há um filtro de igualdade não reconhecido. Confira o nome da coluna e o valor.');
  const rows = allRows.filter(row => filters.every(f => singular(value(row.getCell(f.index))) === singular(f.text)));
  const provenance = `Fonte: ${document.name}; aba ${sheet.name}; ${rows.length} de ${allRows.length} registros. Primeira linha considerada cabeçalho.`;
  const filterText = filters.length ? ' Filtros: ' + filters.map(f => `${f.name} = ${f.text}`).join('; ') + '.' : '';
  if (op === 'count' && !group.length) return { document, verified: true, answer: `A aba ${sheet.name} de ${document.name} contém ${rows.length.toLocaleString('pt-BR')} linhas de dados, excluindo a primeira linha (cabeçalho). Li a aba inteira; linhas totalmente vazias não entram na contagem.${filterText}\n\n${provenance}`, detail: provenance + filterText };
  const groups = new Map<string, ExcelJS.Row[]>();
  for (const row of rows) { const key = group[0] ? value(row.getCell(group[0].index)) || '(vazio)' : 'Resultado'; groups.set(key, [...(groups.get(key) ?? []), row]); }
  if (!groups.size) return { document, verified: true, answer: 'Nenhum registro atende aos filtros. ' + provenance + filterText, detail: provenance + filterText };
  let ignored = 0, valid = 0;
  const results: string[] = [];
  for (const [key, entries] of groups) {
    if (op === 'count') { results.push(`${key}: ${entries.length}`); continue; }
    const values = entries.map(r => numeric(r.getCell(selected[0].index))).filter((n): n is number => n !== undefined);
    ignored += entries.filter(r => value(r.getCell(selected[0].index)) && numeric(r.getCell(selected[0].index)) === undefined).length;
    valid += values.length;
    let result: number | undefined;
    if (op === 'correlation') {
      const pairs = entries.map(r => selected.map(c => numeric(r.getCell(c.index)))).filter((v): v is number[] => v.every(n => n !== undefined));
      if (pairs.length >= 3) {
        const x = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, y = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
        const denominator = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - x) ** 2, 0) * pairs.reduce((s, p) => s + (p[1] - y) ** 2, 0));
        if (denominator) result = pairs.reduce((s, p) => s + (p[0] - x) * (p[1] - y), 0) / denominator;
      }
    } else if (values.length) {
      result = op === 'sum' ? values.reduce((a, b) => a + b, 0) : op === 'average' ? values.reduce((a, b) => a + b, 0) / values.length : op === 'min' ? values.reduce((a, b) => Math.min(a, b)) : values.reduce((a, b) => Math.max(a, b));
    }
    results.push(`${key}: ${result === undefined ? 'dados insuficientes' : result.toLocaleString('pt-BR', { maximumFractionDigits: 10 })}`);
  }
  const labels = { count: 'Contagem', sum: 'A soma', average: 'A média', min: 'O mínimo', max: 'O máximo', correlation: 'A correlação de Pearson' };
  return { document, verified: true, answer: `${labels[op]} ${selected.length ? 'da coluna “' + selected.map(c => c.name).join(' / ') + '”' : ''}${group[0] ? ' por ' + group[0].name : ''}: ${results.join('; ')}. Calculei ${valid} células numéricas${ignored ? '; ignorei ' + ignored + ' células com valores não numéricos' : ''}.${filterText}\n\n${provenance}${op === 'correlation' ? ' Correlação não demonstra causalidade; são necessários três pares e variância nas duas colunas.' : ''}`, detail: provenance + filterText };
}
