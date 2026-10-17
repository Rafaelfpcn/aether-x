import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(projectRoot, 'index.html');
const result = await build({
  entryPoints: [path.join(projectRoot, 'src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  outfile: 'aether-x.js',
  sourcemap: false,
  metafile: true,
  loader: { '.css': 'css' },
  legalComments: 'none',
});

const externalImports = Object.values(result.metafile.outputs)
  .flatMap((output) => output.imports)
  .filter((item) => item.external);
if (externalImports.length) {
  throw new Error(`O pacote offline contém dependências externas: ${externalImports.map((item) => item.path).join(', ')}`);
}

const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text;
if (!js || !css) throw new Error('Não foi possível compilar o JavaScript e o CSS do jogo.');

// A browser closes an inline script on a literal </script sequence, even when it
// appears inside a JavaScript string. Escape it without changing the runtime value.
const safeJs = js.replace(/<\/script/gi, (match) => `\\x3C${match.slice(1)}`);

let html = await readFile(shellPath, 'utf8');
const entry = '<script type="module" src="/src/main.ts"></script>';
if (!html.includes(entry)) throw new Error('O ponto de entrada do jogo não foi encontrado no HTML.');
const guidance = /<!-- SOURCE FILE GUIDANCE START -->[\s\S]*?<!-- SOURCE FILE GUIDANCE END -->/;
if (!guidance.test(html)) throw new Error('A orientação para abrir a versão offline não foi encontrada no HTML.');
html = html.replace(guidance, '');
const shellWithoutEntry = html.replace(entry, '');
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|<(?:img|audio|video|source|iframe)\b[^>]*\bsrc\s*=/i.test(shellWithoutEntry)) {
  throw new Error('O HTML de origem contém um recurso remoto que não pode entrar no pacote offline.');
}
const inlineBundle = `<style>${css}</style>\n    <script>${safeJs}</script>`;
// Use a callback so replacement tokens such as $& in bundled vendor code stay intact.
html = html.replace(entry, () => inlineBundle);
if (/@import\b|url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('O CSS do HTML offline contém uma dependência externa.');
}

const outputPath = path.join(projectRoot, 'AETHER-X-offline.html');
await writeFile(outputPath, html, 'utf8');
console.log(`Pacote offline criado: ${outputPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
