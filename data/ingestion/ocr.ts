import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export function ocrSettings() {
  const installed = 'C:/Program Files/Tesseract-OCR/tesseract.exe';
  return {
    tesseract: process.env.LUMINA_TESSERACT_PATH || (existsSync(installed) ? installed : 'tesseract'),
    pdftoppm: process.env.LUMINA_PDFTOPPM_PATH || 'pdftoppm',
    languages: process.env.IRIS_OCR_LANGUAGES || 'por+eng',
    tessdata: process.env.IRIS_TESSDATA_DIR || undefined
  };
}
export async function ocrImage(path: string) {
  const settings = ocrSettings();
  const result = await run(settings.tesseract, [resolve(path), 'stdout', '-l', settings.languages,
    ...(settings.tessdata ? ['--tessdata-dir', settings.tessdata] : [])],
    { windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  return result.stdout;
}
