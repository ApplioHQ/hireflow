// Bundle only the browser assets we serve. This is a reproducible asset build,
// not a CDN dependency: all fonts, styles, renderers, and licenses stay local.
import { mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [name, files] of [
  ['mathlive', ['mathlive.min.mjs', 'mathlive-static.css', 'mathlive-fonts.css', 'fonts', 'LICENSE.txt']],
  ['katex', ['dist/katex.mjs', 'dist/katex.min.css', 'dist/fonts', 'LICENSE']],
]) {
  const destination = path.join(root, 'vendor', name);
  await mkdir(destination, { recursive: true });
  for (const source of files) await cp(path.join(root, 'node_modules', name, source), path.join(destination, path.basename(source)), { recursive: true });
}
console.log('Local MathLive and KaTeX assets and licenses are ready.');
