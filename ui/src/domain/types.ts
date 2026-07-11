/**
 * Tipos de presentación: contratos JSON que el servidor del back office expone
 * en /api/* y que la UI consume. Copia de backoffice/src/server/types.ts (las
 * interfaces son plano-JSON y se mantienen en sincronía manualmente). Se alojan
 * aquí para que los componentes de ui/ no dependan del paquete del servidor y
 * sean reutilizables desde Electron.
 */

export interface ChampionStatRow {
  championName: string;
  role: string;
  games: number;
  wins: number;
  winRate: number;  // 0..1
  pickRate: number; // 0..1
  banRate: number;  // 0..1
}

export interface AnalyticsMeta {
  regions: string[];
  region: string | null;
  patches: string[];
  tiers: string[];
  champions: string[];
  totalGames: number;
  totalParticipants: number;
  ddragonVersion: string | null;
}

export interface StatFilter {
  patch: string;
  tier: string;
  role: string;
  champion: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
}

export interface ItemStatRow {
  item: number;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
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
  opponent: string;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
}

export interface SynergyStatRow {
  champion: string;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
}

export interface ItemGameRow {
  matchId: string;
  /** Jugador de la fila (para verificar disponibilidad del replay). */
  puuid?: string | null;
  championName: string;
  role: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  gameDuration: number;
  gameCreation: number;
  tier: string | null;
  patch: string | null;
  items: number[];
  keystone: number | null;
  primaryStyle: number | null;
  subStyle: number | null;
  summoner1: number | null;
  summoner2: number | null;
  killParticipation: number | null;
}

export interface ItemGamesResponse {
  total: number;
  games: ItemGameRow[];
}

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
  items: number[];
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

export interface RecommendRow {
  championName: string;
  games: number;
  wins: number;
  winRate: number;
}

export interface RecommendResponse {
  recommendations: RecommendRow[];
}

/** Partida individual detrás de un win rate de recommend ("+ Detalle"). */
export interface RecommendGameRow {
  matchId: string;
  region: string;
  patch: string | null;
  tier: string | null;
  gameDuration: number;
  gameCreation: number;
  /** true si el campeón consultado ganó esa partida. */
  win: boolean;
  /** Equipo del campeón consultado (100 azul / 200 rojo). */
  teamId: number;
  blueChamps: string[];
  redChamps: string[];
}

export interface RecommendGamesResponse {
  total: number;
  games: RecommendGameRow[];
}

/**
 * Partidas efímeras del perfil del usuario (página Perfil del back office).
 * Se descargan de la API de Riot y viven solo en localStorage del navegador;
 * nunca se guardan en la base de análisis. Espejo de los tipos del servidor
 * en backoffice/src/server/profileMatches.ts.
 */
export interface ProfileParticipant {
  championName: string;
  teamId: number;
  win: boolean;
  teamPosition: string;
  /** Marca al dueño del perfil; se omite en el resto. */
  me?: true;
}

export interface ProfileMatch {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  gameVersion: string;
  participants: ProfileParticipant[];
}

export interface ProfileData {
  riotId: string;
  region: string;
  puuid: string;
  fetchedAt: number;
  matches: ProfileMatch[];
}

export interface MatchListRow {
  matchId: string;
  patch: string | null;
  tier: string | null;
  gameDuration: number;
  gameCreation: number;
  winningTeam: number | null;
  blueChamps: string[];
  redChamps: string[];
  blueRoles: string[];
  redRoles: string[];
}

export interface MatchListResponse {
  total: number;
  matches: MatchListRow[];
}

export interface CollectRequest {
  region: string;
  apiKey: string;
  maxMatches: number;
  matchesPerPlayer: number;
  maxPlayersPerBucket?: number;
  tiers?: string[];
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
  progress: CollectProgress | null;
}

/**
 * Red de conocimiento manual del analista (sinergias y counters entre
 * campeones). Se persiste en backoffice/knowledge/champion-network.json vía
 * GET/PUT /api/knowledge; el scoring se hace en el cliente.
 */
export type KnowledgeEdgeKind = 'synergy' | 'counter';

export interface KnowledgeEdge {
  id: string;
  kind: KnowledgeEdgeKind;
  /** En synergy el par se normaliza a < b; en counter, `a` countea a `b`. */
  a: string;
  b: string;
  /** Magnitud 1..3 (leve/notable/fuerte); el signo lo aporta kind + dirección. */
  weight: 1 | 2 | 3;
  /** TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY; ausente = aplica en cualquier rol. */
  role?: string;
  note?: string;
  updatedAt: string; // ISO
}

export interface KnowledgeNetwork {
  version: 1;
  edges: KnowledgeEdge[];
}
