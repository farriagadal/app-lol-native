/**
 * Carga de datos de Data Dragon (nombres/iconos de items, hechizos y runas) y
 * detección de assets locales. Portado de app.js. Produce los diccionarios que
 * alimentan el AssetResolver de la librería ui/.
 */
import { DDRAGON_CDN, type DataDragonDicts } from '@ui';

const ASSET = '/assets';
// Locale de Data Dragon: es_MX = español de Latinoamérica (cliente LAS/LAN);
// debe coincidir con el de los assets descargados (download-assets.mjs --locale).
const DD_LOCALE = 'es_MX';

/** ¿Hay assets descargados localmente? (mira /assets/manifest.json). */
export async function checkAssets(): Promise<boolean> {
  try {
    return (await fetch(`${ASSET}/manifest.json`, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/**
 * Carga un JSON del locale actual: primero de los assets locales (si los hay) y,
 * si faltan para ese locale, cae al CDN de Riot.
 */
async function ddFetchLocale(local: boolean, version: string, file: string): Promise<any> {
  if (local) {
    const got = await fetch(`${ASSET}/cdn/${version}/data/${DD_LOCALE}/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (got) return got;
  }
  return fetch(`${DDRAGON_CDN}/${version}/data/${DD_LOCALE}/${file}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** Carga y construye los diccionarios de Data Dragon para una versión. */
export async function loadDataDragon(local: boolean, version: string): Promise<DataDragonDicts> {
  const dd: DataDragonDicts = { items: {}, spells: {}, runes: {} };
  const [items, sums, runes] = await Promise.all([
    ddFetchLocale(local, version, 'item.json'),
    ddFetchLocale(local, version, 'summoner.json'),
    ddFetchLocale(local, version, 'runesReforged.json'),
  ]);
  if (items)
    for (const [id, it] of Object.entries<any>(items.data))
      dd.items[Number(id)] = { name: it.name, tags: it.tags || [] };
  if (sums)
    for (const s of Object.values<any>(sums.data)) dd.spells[Number(s.key)] = { name: s.name, id: s.id };
  if (runes)
    for (const st of runes as any[]) {
      dd.runes[st.id] = { name: st.name, icon: st.icon };
      for (const slot of st.slots) for (const r of slot.runes) dd.runes[r.id] = { name: r.name, icon: r.icon };
    }
  return dd;
}
