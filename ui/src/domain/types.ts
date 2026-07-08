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
