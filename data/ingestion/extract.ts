import { extname } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';
import { repairMojibake } from '../processing/text.js';
import { ocrImage, ocrSettings } from './ocr.js';
const run = promisify(execFile);
export const extensions = ['.txt', '.md', '.csv', '.json', '.pdf', '.docx', '.xlsx', '.xml', '.yaml', '.yml', '.log', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
export type ExtractedDocument = { text: string; pages?: Array<{ page: number; text: string }> };
function hasMeaningfulPdfText(text: string) {
  return text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').replace(/\s+/g, ' ').trim().length >= 20;
}
async function ocrPdfPages(buffer: Buffer, pageNumbers: number[]) {
  const directory = await mkdtemp(tmpdir() + '/lumina-ocr-');
  const input = directory + '/input.pdf';
  try {
    await writeFile(input, buffer);
    const pages = new Map<number, string>();
    for (const page of pageNumbers) {
      const output = directory + '/page-' + page;
      await run(ocrSettings().pdftoppm, ['-f', String(page), '-l', String(page), '-r', '200', '-png', '-singlefile', input, output],
        { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
      pages.set(page, await ocrImage(output + '.png'));
    }
    return pages;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'ferramenta indisponível';
    throw new Error('OCR indisponível. Instale/configure Poppler e Tesseract. ' + detail.slice(0, 180));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function extract(name: string, buffer: Buffer): Promise<ExtractedDocument> {
  const ext = extname(name).toLowerCase();
  if (!extensions.includes(ext)) throw new Error('Formato não suportado. Use texto, PDF, Office ou imagens PNG, JPEG, WebP, BMP e TIFF.');
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'].includes(ext)) {
    const directory = await mkdtemp(tmpdir() + '/iris-image-');
    try { const input = directory + '/input' + ext; await writeFile(input, buffer); const text = await ocrImage(input); return { text, pages: [{ page: 1, text }] }; }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
  if (ext === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Conteúdo PDF inválido.');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let pages: Array<{ page: number; text: string }>;
    try {
      const result = await parser.getText();
      pages = result.pages.map(page => ({ page: page.num, text: repairMojibake(page.text) }));
    } finally { await parser.destroy(); }
    const unreadable = pages.filter(page => !hasMeaningfulPdfText(page.text)).map(page => page.page);
    // One text page must not mask scanned pages elsewhere in the same PDF.
    if (unreadable.length) {
      if (unreadable.length > 120) throw new Error('PDF com mais de 120 páginas digitalizadas. Divida o arquivo em partes menores para OCR completo.');
      const ocr = await ocrPdfPages(buffer, unreadable);
      pages = pages.map(page => ({ ...page, text: ocr.get(page.page)?.trim() || page.text }));
    }
    return { text: pages.map(page => `\n\n[[LUMINA_PAGE:${page.page}]]\n${page.text}`).join('\n'), pages };
  }
  if (ext === '.docx' || ext === '.xlsx') {
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('Arquivo Office inválido.');
    // Reject containers declaring excessive expanded sizes before handing to parsers.
    let expanded = 0, entries = 0;
    for (let i = 0; i < buffer.length - 46; i++) {
      if (buffer.readUInt32LE(i) === 0x02014b50) {
        expanded += buffer.readUInt32LE(i + 24); entries++;
        if (expanded > 200 * 1024 * 1024 || entries > 10000) throw new Error('Arquivo Office excede o limite de descompressão (200 MB ou 10.000 entradas).');
      }
    }
    if (!entries) throw new Error('Índice do arquivo Office inválido.');
    if (ext === '.docx') return { text: repairMojibake((await mammoth.extractRawText({ buffer })).value) };
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    const rows: string[] = [];
    book.eachSheet(sheet => {
      rows.push('Planilha: ' + sheet.name);
      sheet.eachRow(row => { rows.push((row.values as ExcelJS.CellValue[]).slice(1).map(value => {
        if (value && typeof value === 'object') {
          if ('text' in value) return value.text;
          if ('richText' in value) return value.richText.map(v => v.text).join('');
          if ('result' in value) return String(value.result ?? '');
          return '';
        }
        return String(value ?? '');
      }).join(' | ')); });
    });
    return { text: rows.join('\n') };
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  if (ext === '.json') JSON.parse(text);
  return { text: repairMojibake(text) };
}
