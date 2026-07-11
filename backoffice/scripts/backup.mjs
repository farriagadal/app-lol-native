/**
 * Respaldo de los datos locales del back office en un zip portable, para
 * levantar la app en otra máquina.
 *
 *   npm run backup          → completo: data/ entera (BDs + partidas crudas
 *                             matches.jsonl) + knowledge/. Permite SEGUIR
 *                             RECOLECTANDO en la otra máquina (buildDb
 *                             reconstruye lol.db desde los .jsonl).
 *   npm run backup:light    → liviano: igual pero SIN los matches.jsonl.
 *                             La app funciona completa en modo lectura, pero
 *                             una nueva recolección regeneraría lol.db solo
 *                             con las partidas nuevas.
 *
 * Restaurar en la otra máquina:
 *   1. Clonar el repo y `npm install` en backoffice/
 *   2. Descomprimir el zip DENTRO de backoffice/ (crea data/ y knowledge/)
 *   3. `npm run assets` en backoffice/ (assets compartidos) y `npm start`
 *
 * Ojo: data/settings.db incluye la API key de Riot guardada desde el panel.
 *
 * Usa el tar de Windows 10+ (bsdtar), que escribe zip con `-a`; sin
 * dependencias nuevas ni módulos nativos de Node.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const light = process.argv.includes('--light');
const root = process.cwd(); // se ejecuta desde backoffice/

for (const dir of ['data', 'knowledge']) {
  if (!fs.existsSync(path.join(root, dir))) {
    console.error(`No existe ${dir}/ — ejecuta esto desde backoffice/`);
    process.exit(1);
  }
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const outDir = path.join(root, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `lol-backoffice-${light ? 'light' : 'full'}-${stamp}.zip`);

const args = ['-a', '-c', '-f', out];
if (light) args.push('--exclude', '*/matches.jsonl');
args.push('data', 'knowledge');

console.log(`Creando respaldo ${light ? 'liviano (sin partidas crudas)' : 'completo'}…`);
const t0 = Date.now();
execFileSync('tar', args, { cwd: root, stdio: 'inherit' });

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${out} (${mb} MB) en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('Para restaurar: descomprimir dentro de backoffice/ en la otra máquina (ver comentario del script).');
