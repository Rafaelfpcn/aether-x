import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(projectRoot, 'AETHER-X-offline.html');
const html = await readFile(htmlPath, 'utf8');
const styleStart = html.indexOf('<style>');
const scriptStart = html.indexOf('<script>', styleStart);
const scriptEnd = html.lastIndexOf('</script>');
assert.ok(styleStart > 0 && scriptStart > styleStart && scriptEnd > scriptStart, 'CSS e JavaScript devem estar embutidos no HTML.');

const shell = html.slice(0, styleStart);
assert.doesNotMatch(shell, /<(?:script|link|img|audio|video|source|iframe)\b[^>]*(?:src|href)\s*=/i, 'O HTML não deve carregar recursos externos.');
assert.doesNotMatch(html.slice(styleStart, scriptStart), /@import\b|url\(\s*['"]?https?:/i, 'O CSS não deve referenciar recursos externos.');
const script = html.slice(scriptStart + '<script>'.length, scriptEnd);
assert.match(html.slice(scriptStart, scriptEnd), /^<script>\s*(?:"use strict";)?\(\(\)=>\{/i, 'O código do jogo deve estar no mesmo arquivo e sem importações de módulos.');
assert.doesNotMatch(script, /<\/script/i, 'O JavaScript embutido não pode encerrar a própria tag script.');
for (const control of ['#continue-button', '#settings-button', '#launch-button', '#river-mode-button']) {
  assert.ok(script.includes(control), `A ação ${control} deve estar ligada ao JavaScript do jogo.`);
}
assert.equal((html.match(/<script\b/gi) ?? []).length, 1, 'O HTML offline deve conter somente o script do jogo.');
assert.equal((html.match(/<\/script\s*>/gi) ?? []).length, 1, 'O HTML offline deve fechar somente a tag do script do jogo.');
for (const required of ['menu-screen', 'briefing-screen', 'pause-screen', 'result-screen', 'settings-screen', 'river-mode-button', 'AETHER-X']) {
  assert.ok(html.includes(required), `Interface ausente no pacote: ${required}`);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
    else if (/\.(?:ts|css|html)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

for (const filePath of await sourceFiles(projectRoot)) {
  const source = await readFile(filePath, 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bsendBeacon\s*\(/, `A fonte contém chamada de rede: ${path.relative(projectRoot, filePath)}`);
}

console.log(`Pacote offline validado: ${htmlPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, sem recursos externos).`);
