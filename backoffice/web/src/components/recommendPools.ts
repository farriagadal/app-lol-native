/**
 * Pools de campeones del jugador por rol ('ALL', 'TOP', …), compartidos entre
 * las páginas de recomendación (vs Rivales / Sinergias / Pick completo) y
 * persistidos en localStorage entre sesiones.
 */
import { syncSetting } from '../settingsSync';

export const POOLS_KEY = 'bff.recommend.pools';
const LEGACY_POOL_KEY = 'bff.recommend.pool';

export function loadPools(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(POOLS_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const pools: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) pools[k] = v.filter((x): x is string => typeof x === 'string');
      }
      return pools;
    }
    // Migración desde la clave antigua (un único pool sin rol)
    const legacy = JSON.parse(localStorage.getItem(LEGACY_POOL_KEY) ?? 'null');
    if (Array.isArray(legacy)) return { ALL: legacy.filter((x): x is string => typeof x === 'string') };
  } catch {
    // valores corruptos → empezar de cero
  }
  return {};
}

export function savePools(pools: Record<string, string[]>): void {
  const json = JSON.stringify(pools);
  try {
    localStorage.setItem(POOLS_KEY, json);
  } catch {
    // almacenamiento no disponible
  }
  syncSetting(POOLS_KEY, json);
}
