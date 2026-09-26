import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve('.env');
const content = await readFile(path, 'utf8');
const newline = content.includes('\r\n') ? '\r\n' : '\n';
const lines = content.split(/\r?\n/).filter(line => !/^\s*(HOST|PORT|APP_ORIGIN)\s*=/.test(line));
while (lines.length && !lines.at(-1)) lines.pop();
lines.push('HOST=127.0.0.1', 'PORT=8080', 'APP_ORIGIN=http://lumina:8080');
await writeFile(path, lines.join(newline) + newline, 'utf8');
console.log('Endereço configurado para http://lumina:8080. Os demais valores do .env foram preservados.');
console.log('Confira se a porta 8080 está livre e registre 127.0.0.1 lumina no arquivo hosts do Windows antes de iniciar.');
