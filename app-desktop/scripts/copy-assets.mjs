import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcRenderer = join(root, 'src', 'renderer');
const outRenderer = join(root, 'dist', 'renderer');

await mkdir(outRenderer, { recursive: true });

// Copia los assets estáticos del renderer (html/css) preservando la estructura.
for (const file of ['index.html', 'styles.css']) {
  await cp(join(srcRenderer, file), join(outRenderer, file));
  console.log(`[copy] ${file}`);
}
