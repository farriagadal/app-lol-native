/**
 * Configuración del colector de datos de Riot.
 *
 * IMPORTANTE: la API oficial NO expone win rate / pick rate / ban rate. Esos
 * números se CALCULAN agregando muchas partidas. Este colector hace justo eso:
 *   1. Semilla de jugadores por rango (LEAGUE-V4).
 *   2. IDs de partida por jugador (MATCH-V5).
 *   3. Detalle de cada partida (MATCH-V5) -> JSONL crudo.
 * Después, `aggregate.ts` calcula las estadísticas a partir del JSONL.
 *
 * La API key se lee de la variable de entorno RIOT_API_KEY.
 * En PowerShell:  $env:RIOT_API_KEY = "RGAPI-xxxx-xxxx-..."
 */

export type RegionKey =
  | 'la2' // LAS - Latinoamérica Sur
  | 'la1' // LAN - Latinoamérica Norte
  | 'na1' // NA
  | 'br1' // Brasil
  | 'euw1' // EU West
  | 'eun1' // EU Nordic & East
  | 'kr' // Corea
  | 'jp1' // Japón
  | 'oc1' // Oceanía
  | 'tr1' // Turquía
  | 'ru'; // Rusia

/** Routing regional de MATCH-V5 (distinto del routing de plataforma). */
export type RegionalRoute = 'americas' | 'europe' | 'asia' | 'sea';

interface RegionInfo {
  /** Routing de plataforma para SUMMONER-V4 / LEAGUE-V4. */
  platform: RegionKey;
  /** Routing regional para MATCH-V5. */
  regional: RegionalRoute;
  label: string;
}

export const REGIONS: Record<RegionKey, RegionInfo> = {
  la2: { platform: 'la2', regional: 'americas', label: 'LAS' },
  la1: { platform: 'la1', regional: 'americas', label: 'LAN' },
  na1: { platform: 'na1', regional: 'americas', label: 'NA' },
  br1: { platform: 'br1', regional: 'americas', label: 'BR' },
  euw1: { platform: 'euw1', regional: 'europe', label: 'EUW' },
  eun1: { platform: 'eun1', regional: 'europe', label: 'EUNE' },
  kr: { platform: 'kr', regional: 'asia', label: 'KR' },
  jp1: { platform: 'jp1', regional: 'asia', label: 'JP' },
  oc1: { platform: 'oc1', regional: 'sea', label: 'OCE' },
  tr1: { platform: 'tr1', regional: 'europe', label: 'TR' },
  ru: { platform: 'ru', regional: 'europe', label: 'RU' },
};

/** Cola de ranked solo/duo: nombre para LEAGUE-V4, id numérico para MATCH-V5. */
export const RANKED_SOLO_QUEUE_NAME = 'RANKED_SOLO_5x5';
export const RANKED_SOLO_QUEUE_ID = 420;

/** Tiers no-apex (se piden por tier+división, paginados). */
export const STANDARD_TIERS = [
  'DIAMOND',
  'EMERALD',
  'PLATINUM',
  'GOLD',
  'SILVER',
  'BRONZE',
  'IRON',
] as const;

export const DIVISIONS = ['I', 'II', 'III', 'IV'] as const;

/** Tiers apex (endpoints dedicados, sin división). */
export const APEX_TIERS = ['CHALLENGER', 'GRANDMASTER', 'MASTER'] as const;

/**
 * Límites de una dev key personal de Riot (los dos se aplican a la vez):
 *   - 20 peticiones / 1 s
 *   - 100 peticiones / 120 s   <-- este es el cuello de botella real (~0.83 req/s)
 * Si tienes production key, sube estos números.
 */
export const RATE_LIMITS = [
  { max: 20, windowMs: 1_000 },
  { max: 100, windowMs: 120_000 },
];

/** Carpeta donde se guardan los datos (relativa a la raíz del repo). */
export const DATA_DIR = 'data';

export function getApiKey(): string {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    throw new Error(
      'Falta RIOT_API_KEY. En PowerShell:  $env:RIOT_API_KEY = "RGAPI-..."',
    );
  }
  return key.trim();
}

export function resolveRegion(key: string): RegionInfo {
  const info = REGIONS[key as RegionKey];
  if (!info) {
    throw new Error(
      `Región desconocida: "${key}". Válidas: ${Object.keys(REGIONS).join(', ')}`,
    );
  }
  return info;
}
