import { parse } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const source = parse(readFileSync(resolve('../LUMINA/.env')));
const targetPath = resolve('.env');
let text = readFileSync(targetPath, 'utf8');
const target = parse(text);
const port = target.PORT || '8081';
const changes = {};
for (const name of ['LLM_PROVIDER', 'LLM_MODEL', 'LLM_BASE_URL', 'LLM_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'REVIEW_LLM_MODEL', 'EMBEDDING_MODEL', 'EMBEDDING_BASE_URL', 'EMBEDDING_API_KEY', 'LUMINA_TESSERACT_PATH', 'LUMINA_PDFTOPPM_PATH']) {
  if (source[name]) changes[name] = source[name];
}
Object.assign(changes, { HOST: '127.0.0.1', PORT: port, APP_ORIGIN: target.APP_ORIGIN || 'http://127.0.0.1:' + port, DATA_DIR: target.DATA_DIR || 'data/runtime', IRIS_OCR_LANGUAGES: 'por+eng', IRIS_TESSDATA_DIR: 'C:/Program Files/Tesseract-OCR/tessdata' });
for (const name of ['LUMINA_TESSERACT_PATH', 'LUMINA_PDFTOPPM_PATH']) {
  if (!changes[name] || !existsSync(changes[name])) throw new Error('Executável OCR indisponível: ' + name);
}
for (const [name, value] of Object.entries(changes)) {
  const line = name + '=' + JSON.stringify(value);
  const pattern = new RegExp('^' + name + '=.*$', 'm');
  text = pattern.test(text) ? text.replace(pattern, () => line) : text.trimEnd() + '\n' + line + '\n';
}
writeFileSync(targetPath, text);
console.log('Configuração de IA e OCR herdada do LUMINA; identidade e banco do IRIS preservados. Valores secretos não são exibidos.');
