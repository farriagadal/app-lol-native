#!/usr/bin/env node
// Descarga TODOS los assets a una carpeta compartida del repo (`assets/`) que
// usan tanto el back office como la app de escritorio. Así nada se trae de
// CDNs externos en runtime. Idempotente: omite lo ya descargado.
//
// Uso:  node scripts/download-assets.mjs [version] [--force] [--locale es_ES]
//
// Estructura generada (espeja las rutas de Data Dragon para mapear 1:1):
//   assets/manifest.json
//   assets/cdn/<v>/data/<locale>/{champion,item,summoner,runesReforged}.json
//   assets/cdn/<v>/img/champion/<id>.png
//   assets/cdn/<v>/img/item/<id>.png
//   assets/cdn/<v>/img/spell/<id>.png
//   assets/cdn/img/<ruta-icono-runa>.png
//   assets/roles/position-<rol>.svg
//   assets/ranks/<tier>.png

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default';
const OPGG = 'https://opgg-static.akamaized.net/images/medals_new';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS = join(ROOT, 'assets');

const args = process.argv.slice(2);
const force = args.includes('--force');
// Salta la verificación TLS (útil tras proxy/antivirus que intercepta HTTPS y
// re-firma con un certificado raíz que Node no conoce). Los assets son
// públicos, así que el riesgo es bajo. Debe fijarse antes de cualquier fetch.
const insecure = args.includes('--insecure');
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const localeIdx = args.indexOf('--locale');
const LOCALE = localeIdx >= 0 ? args[localeIdx + 1] : 'es_MX';
const versionArg = args.find((a) => !a.startsWith('--') && a !== LOCALE);

const ROLES = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger'];
// Fallback oficial de Riot por tier si op.gg no estuviera disponible.
const RIOT_RANK = (t) =>
  t === 'emerald'
    ? `${CDRAGON}/images/ranked-emblem/wings/wings_emerald.png`
    : `${CDRAGON}/images/ranked-mini-crests/${t}.png`;

let downloaded = 0;
let skipped = 0;
let failed = 0;

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** Si hay HTTPS_PROXY/HTTP_PROXY en el entorno, intenta enrutar fetch por él. */
async function setupProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) return null;
  try {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    return proxy;
  } catch {
    console.warn(`  (Aviso) Detecté proxy ${proxy} pero no pude cargar 'undici' para usarlo.`);
    return null;
  }
}

/** Mensaje legible con la causa real de un error de fetch. */
function describeError(err) {
  const cause = err && err.cause;
  const parts = [err && err.message];
  if (cause && cause.code) parts.push(`causa: ${cause.code}`);
  if (cause && cause.message && cause.message !== (err && err.message)) parts.push(cause.message);
  return parts.filter(Boolean).join(' · ');
}

/** fetch con reintentos (para cortes transitorios); conserva la causa. */
async function fetchRetry(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url);
    } catch (err) {
      lastErr = err;
      if (i < tries) await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  throw lastErr;
}

async function fetchBuffer(url) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchJson(url) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Descarga `url` a `dest` (omite si ya existe salvo --force). Devuelve true si bajó. */
async function download(url, dest, { fallback } = {}) {
  if (!force && (await exists(dest))) { skipped++; return false; }
  await mkdir(dirname(dest), { recursive: true });
  try {
    await writeFile(dest, await fetchBuffer(url));
    downloaded++;
    return true;
  } catch (err) {
    if (fallback) {
      try {
        await writeFile(dest, await fetchBuffer(fallback));
        downloaded++;
        return true;
      } catch { /* cae al manejo de error de abajo */ }
    }
    failed++;
    console.warn(`  ✗ ${url} (${err.message})`);
    return false;
  }
}

/** Ejecuta tareas con como mucho `limit` en paralelo. */
async function pool(tasks, limit = 16) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) await tasks[i++]();
    }),
  );
}

function progress(label, total) {
  let n = 0;
  return () => {
    n++;
    if (n % 50 === 0 || n === total) process.stdout.write(`\r  ${label}: ${n}/${total}   `);
    if (n === total) process.stdout.write('\n');
  };
}

async function main() {
  console.log(`Assets → ${ASSETS}`);
  await mkdir(ASSETS, { recursive: true });

  const proxy = await setupProxy();
  if (proxy) console.log(`Usando proxy: ${proxy}`);
  if (insecure) console.log('⚠ Verificación TLS desactivada (--insecure).');

  const version = versionArg || (await fetchJson(`${DDRAGON}/api/versions.json`))[0];
  console.log(`Versión Data Dragon: ${version} · locale ${LOCALE}${force ? ' · --force' : ''}`);
  const cdn = `${DDRAGON}/cdn/${version}`;
  const out = join(ASSETS, 'cdn', version);

  // 1) JSON de datos (nombres/tags para la UI).
  console.log('Datos (JSON)…');
  const dataFiles = ['champion', 'item', 'summoner', 'runesReforged'];
  const data = {};
  for (const name of dataFiles) {
    const json = await fetchJson(`${cdn}/data/${LOCALE}/${name}.json`);
    data[name] = json;
    const dest = join(out, 'data', LOCALE, `${name}.json`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, JSON.stringify(json));
  }

  // 2) Listas de ids a partir de los JSON.
  const champIds = Object.values(data.champion.data).map((c) => c.id);
  const itemIds = Object.keys(data.item.data);
  const spellIds = Object.values(data.summoner.data).map((s) => s.id);
  const runeIcons = new Set();
  for (const style of data.runesReforged) {
    runeIcons.add(style.icon);
    for (const slot of style.slots) for (const r of slot.runes) runeIcons.add(r.icon);
  }

  // 3) Iconos de campeones / ítems / hechizos (versionados).
  const jobs = [];
  const tick = {};
  const queue = (label, ids, urlFn, destFn) => {
    tick[label] = progress(label, ids.length);
    for (const id of ids) jobs.push(async () => { await download(urlFn(id), destFn(id)); tick[label](); });
  };
  queue('campeones', champIds, (id) => `${cdn}/img/champion/${id}.png`, (id) => join(out, 'img', 'champion', `${id}.png`));
  queue('items', itemIds, (id) => `${cdn}/img/item/${id}.png`, (id) => join(out, 'img', 'item', `${id}.png`));
  queue('hechizos', spellIds, (id) => `${cdn}/img/spell/${id}.png`, (id) => join(out, 'img', 'spell', `${id}.png`));

  // 4) Iconos de runas (NO versionados: cdn/img/<ruta>).
  const runeList = [...runeIcons];
  tick.runas = progress('runas', runeList.length);
  for (const icon of runeList) {
    jobs.push(async () => {
      await download(`${DDRAGON}/cdn/img/${icon}`, join(ASSETS, 'cdn', 'img', ...icon.split('/')));
      tick.runas();
    });
  }

  console.log(`Iconos: ${champIds.length} campeones · ${itemIds.length} ítems · ${spellIds.length} hechizos · ${runeList.length} runas`);
  await pool(jobs);

  // 5) Roles (posiciones) y rangos (emblemas).
  console.log('Roles y rangos…');
  const extra = [];
  for (const r of ROLES) {
    extra.push(() => download(`${CDRAGON}/svg/position-${r}.svg`, join(ASSETS, 'roles', `position-${r}.svg`)));
  }
  for (const t of TIERS) {
    extra.push(() => download(`${OPGG}/${t}.png`, join(ASSETS, 'ranks', `${t}.png`), { fallback: RIOT_RANK(t) }));
  }
  await pool(extra, 8);

  // 6) Manifiesto.
  const manifest = {
    version,
    locale: LOCALE,
    generatedAt: new Date().toISOString(),
    counts: { champions: champIds.length, items: itemIds.length, spells: spellIds.length, runes: runeList.length, roles: ROLES.length, ranks: TIERS.length },
  };
  await writeFile(join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nListo. Descargados ${downloaded}, omitidos ${skipped}, fallidos ${failed}.`);
  console.log(`Manifiesto: ${join(ASSETS, 'manifest.json')}`);
  if (failed) process.exitCode = 0; // un asset suelto que falle no es fatal
}

main().catch((err) => {
  console.error('\nError fatal:', describeError(err));
  const code = err && err.cause && err.cause.code;
  console.error('\nNo se pudo conectar con los CDNs (ddragon / communitydragon / op.gg). Revisa:');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    console.error('  • DNS: el equipo no resuelve los dominios. ¿VPN/DNS corporativo?');
  } else if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    console.error('  • Conexión bloqueada o timeout: firewall/antivirus o red restringida.');
  } else if (code && (String(code).includes('CERT') || String(code).includes('VERIFY') || String(code).includes('SELF_SIGNED'))) {
    console.error('  • TLS interceptado por proxy/antivirus que Node no reconoce. Opciones:');
    console.error('      a) Re-ejecuta con verificación TLS desactivada (assets públicos, riesgo bajo):');
    console.error('           npm run assets -- --insecure');
    console.error('      b) Apunta Node al certificado raíz de tu empresa (recomendado):');
    console.error('           PowerShell:  $env:NODE_EXTRA_CA_CERTS="C:\\ruta\\al\\root.pem"; npm run assets');
  }
  console.error('  • Si usas proxy: define HTTPS_PROXY=http://host:puerto y vuelve a ejecutar.');
  console.error('  • Comprueba que el navegador y Node usan la misma salida a internet.');
  console.error('  • Diagnóstico rápido:  node -e "fetch(\'https://ddragon.leagueoflegends.com/api/versions.json\').then(r=>console.log(\'OK\',r.status)).catch(e=>console.log(\'FALLA\', e.cause?.code||e.message))"');
  process.exit(1);
});
