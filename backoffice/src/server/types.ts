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
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
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

export interface PlayerStatRow {
  puuid: string | null;
  riotId: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
}

export interface PlayerGamesResponse {
  total: number;
  riotId: string | null;
  games: ItemGameRow[];
}

export interface CounterStatRow {
  opponent: string; // id de Data Dragon del campeón rival
  games: number;
  wins: number;
  winRate: number;  // win rate del campeón propio contra ese rival
  pickRate: number; // % de enfrentamientos contra ese rival
}

export interface SynergyStatRow {
  champion: string; // id de Data Dragon del compañero de equipo
  games: number;
  wins: number;
  winRate: number;  // win rate jugando junto a ese compañero
  pickRate: number;
}

/** Una partida concreta en la que un participante llevó cierto ítem (resumen). */
export interface ItemGameRow {
  matchId: string;
  championName: string;
  role: string;           // team_position
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  gameDuration: number;   // segundos
  gameCreation: number;   // epoch ms
  tier: string | null;    // rango de la partida (no por jugador)
  patch: string | null;
  items: number[];        // [item0..item6]; item6 = trinket
  keystone: number | null;
  primaryStyle: number | null;
  subStyle: number | null;
  summoner1: number | null;
  summoner2: number | null;
  killParticipation: number | null;
}

export interface ItemGamesResponse {
  total: number;          // total de partidas que pasan el filtro (para el paginador)
  games: ItemGameRow[];
}

/** Un jugador dentro del scoreboard de una partida concreta. */
export interface MatchParticipantRow {
  teamId: number;
  participantId: number;
  puuid: string | null;
  championName: string;
  role: string;
  riotId: string | null;
  win: boolean;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  killParticipation: number | null;
  dmgToChamps: number;
  goldEarned: number;
  items: number[];        // [item0..item6]
  summoner1: number | null;
  summoner2: number | null;
  keystone: number | null;
  primaryStyle: number | null;
  subStyle: number | null;
}

export interface MatchTeamObjectives {
  teamId: number;
  win: boolean;
  baronKills: number;
  dragonKills: number;
  riftHeraldKills: number;
  towerKills: number;
  inhibitorKills: number;
  championKills: number;
}

/** Detalle completo de una partida (scoreboard de 10 jugadores). */
export interface MatchDetail {
  matchId: string;
  patch: string;
  gameDuration: number;
  gameCreation: number;
  winningTeam: number | null;
  tier: string | null;
  participants: MatchParticipantRow[];
  teams: MatchTeamObjectives[];
}

export interface StreakPlayer {
  puuid: string;
  riotId: string;
  longestWinStreak: number;
  totalGames: number;
  wins: number;
}

export interface StreakGameRow extends ItemGameRow {
  puuid: string;
}

export interface StreaksResponse {
  total: number;
  players: StreakPlayer[];
  matches: StreakGameRow[];
}

export interface CollectRequest {
  region: string;
  apiKey: string;
  maxMatches: number;
  matchesPerPlayer: number;
  maxPlayersPerBucket?: number;
  tiers?: string[];    // rangos a recolectar; vacío/ausente = todos
  startTime?: number;  // epoch segundos (parámetro startTime de la API de Riot)
  endTime?: number;    // epoch segundos
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
  progress: CollectProgress | null; // último evento de progreso (para polling)
}
