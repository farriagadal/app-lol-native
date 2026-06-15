/** Tipos del back office (servidor <-> navegador, vía JSON). */

export interface ChampionStatRow {
  championName: string; // id de Data Dragon (p.ej. "Ahri")
  role: string;         // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY
  games: number;
  wins: number;
  winRate: number;      // 0..1
  pickRate: number;     // 0..1
  banRate: number;      // 0..1
}

export interface AnalyticsMeta {
  regions: string[];      // regiones con base disponible
  region: string | null;  // región activa
  patches: string[];      // parches presentes (desc)
  tiers: string[];        // rangos presentes en los datos
  champions: string[];    // campeones presentes (para el selector)
  totalGames: number;
  totalParticipants: number;
  ddragonVersion: string | null;
}

/** Filtros comunes a las páginas de items/runas/hechizos. */
export interface StatFilter {
  patch: string;     // 'all' o concreto
  tier: string;      // 'all' o concreto
  role: string;      // 'ALL' o concreto
  champion: string;  // 'all' o id de campeón
}

export interface ItemStatRow {
  item: number;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number; // % de participantes (del scope) que lo llevaban
}

export interface SpellStatRow {
  spell1: number;
  spell2: number;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
}

export interface RuneStatRow {
  keystone: number;
  primaryStyle: number;
  subStyle: number;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
}

export interface CollectRequest {
  region: string;
  apiKey: string;
  maxMatches: number;
  matchesPerPlayer: number;
  maxPlayersPerBucket?: number;
  tiers?: string[]; // rangos a recolectar; vacío/ausente = todos
}

export interface CollectProgress {
  phase: 'starting' | 'collecting' | 'building-db' | 'done' | 'error';
  region: string;
  collected: number;
  target: number;
  bucket?: string;
  message?: string;
}

export interface CollectStatus {
  region: string;
  lastCollectedAt: number | null;
  lastError: string | null;
  totalMatches: number;
  running: boolean;
}
