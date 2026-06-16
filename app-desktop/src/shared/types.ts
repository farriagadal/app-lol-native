/**
 * Tipos compartidos entre el proceso main (Node/Electron) y el renderer (DOM).
 * El renderer importa estos tipos con `import type`, por lo que no se emite JS.
 */

export type GamePhase =
  | 'disconnected' // El cliente de LoL no está abierto (no hay lockfile)
  | 'idle'         // Cliente abierto, pero ni en champ select ni en partida
  | 'champ-select' // En selección de campeones (datos de LCU)
  | 'in-game';     // Partida en curso (datos de Live Client Data API)

/* ------------------------------------------------------------------ */
/* Live Client Data API (https://127.0.0.1:2999/liveclientdata/...)   */
/* ------------------------------------------------------------------ */

export interface LiveActivePlayerStats {
  abilityPower: number;
  armor: number;
  attackDamage: number;
  attackSpeed: number;
  currentHealth: number;
  maxHealth: number;
  magicResist: number;
  resourceValue: number;
  resourceMax: number;
  moveSpeed: number;
}

export interface LiveActivePlayer {
  summonerName: string;
  level: number;
  currentGold: number;
  championStats: LiveActivePlayerStats;
}

export interface LiveScores {
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  wardScore: number;
}

export interface LivePlayer {
  summonerName: string;
  championName: string;
  rawChampionName?: string;
  team: 'ORDER' | 'CHAOS';
  position?: string;
  level: number;
  isDead: boolean;
  respawnTimer: number;
  scores: LiveScores;
  items: Array<{ itemID: number; displayName: string; count: number; slot: number }>;
}

export interface LiveGameStats {
  gameTime: number;
  gameMode: string;
  mapName: string;
}

export interface LiveGameData {
  activePlayer: LiveActivePlayer;
  allPlayers: LivePlayer[];
  gameData: LiveGameStats;
  events: Array<{ EventID: number; EventName: string; EventTime: number; [k: string]: unknown }>;
}

/* ------------------------------------------------------------------ */
/* LCU - Champ Select                                                  */
/* ------------------------------------------------------------------ */

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  championName?: string; // resuelto con Data Dragon
  iconUrl?: string;      // icono del campeón (Data Dragon)
  summonerName?: string;
  assignedPosition?: string;
  isLocalPlayer: boolean;
}

export interface ChampSelectState {
  inProgress: boolean;
  localPlayerCellId: number;
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  bans: number[];
  timerPhase?: string;
}

/* ------------------------------------------------------------------ */
/* Consejos / análisis                                                 */
/* ------------------------------------------------------------------ */

export interface BuildAdvice {
  championName: string;
  championIconUrl?: string;
  coreItems: Array<{ id: number; name: string; iconUrl?: string }>;
  summonerSpells?: string[];
  skillOrder?: string;
  notes?: string;
}

export interface MatchupAdvice {
  championName: string;
  opponentName: string;
  opponentIconUrl?: string;
  winRate: number;      // 0..1 del campeón propio contra el rival
  difficulty: 'easy' | 'even' | 'hard';
  tips: string[];
}

export interface PickAdvice {
  championName: string;
  championIconUrl?: string;
  role: string;
  winRate: number;      // win rate global del campeón en el rol
  pickRate: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Estado unificado que viaja main -> renderer                         */
/* ------------------------------------------------------------------ */

export interface AppState {
  phase: GamePhase;
  ddragonVersion: string | null;
  updatedAt: number;

  // Presente cuando phase === 'in-game'
  live?: {
    game: LiveGameStats;
    self: LiveActivePlayer;
    selfChampionName?: string;
    selfChampionIconUrl?: string;
    selfScores: LiveScores | null;
    allies: LivePlayer[];
    enemies: LivePlayer[];
    build?: BuildAdvice;
    matchups: MatchupAdvice[];
  };

  // Presente cuando phase === 'champ-select'
  champSelect?: {
    state: ChampSelectState;
    suggestions: PickAdvice[];
    counters: MatchupAdvice[];
    build?: BuildAdvice;
  };

  error?: string;
}

/* ------------------------------------------------------------------ */
/* Gestión de assets (Data Dragon en local)                            */
/* ------------------------------------------------------------------ */

export interface AssetsProgress {
  phase: 'check' | 'data' | 'icons' | 'done' | 'up-to-date';
  version: string | null;
  done: number;
  total: number;
}

export interface AssetsInfo {
  version: string | null;
  latest: string | null;
  ready: boolean;
}

/** API expuesta por el preload al renderer mediante contextBridge. */
export interface OverlayApi {
  onState(cb: (state: AppState) => void): () => void;
  setInteractive(interactive: boolean): void;
  toggleVisibility(): void;
  quit(): void;
  getInteractive(): Promise<boolean>;

  // Assets
  getAssetsInfo(): Promise<AssetsInfo>;
  updateAssets(force?: boolean): Promise<{ version: string; updated: boolean }>;
  onAssetsProgress(cb: (p: AssetsProgress) => void): () => void;
}

declare global {
  interface Window {
    overlay: OverlayApi;
  }
}
