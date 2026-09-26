import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import '../gateway/config.js';
import { extract } from '../data/ingestion/extract.js';
import { ocrSettings } from '../data/ingestion/ocr.js';
const jpg = await readFile('work/validation/ocr-fixture.jpg');
// Image-only PDF fixture: no hidden text that could bypass the OCR path.
const stream = Buffer.from('q 600 0 0 200 0 0 cm /Im0 Do Q');
const objects = [
  Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
  Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
  Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
  Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1800 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`), jpg, Buffer.from('\nendstream')]),
  Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')])
];
const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0];
for (const [index, obj] of objects.entries()) { offsets.push(parts.reduce((n, p) => n + p.length, 0)); parts.push(Buffer.from(`${index + 1} 0 obj\n`), obj, Buffer.from('\nendobj\n')); }
const xref = parts.reduce((n, p) => n + p.length, 0);
parts.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
const pdf = Buffer.concat(parts); await writeFile('work/validation/ocr-fixture.pdf', pdf);
const results = [];
for (const [name, buffer] of [['fixture.jpg', jpg], ['fixture.pdf', pdf]] as const) {
  const result = await extract(name, buffer);
  assert.match(result.text, /retained for 30 days/i);
  assert.match(result.text, /mantidas por 30 dias/i);
  results.push({ file: name, ...result });
  console.log('PASS OCR: ' + name + ' · português + inglês · página ' + result.pages?.[0].page);
}
await writeFile('work/validation/ocr-real.json', JSON.stringify({ testedAt: new Date().toISOString(), settings: ocrSettings(), results }, null, 2));
