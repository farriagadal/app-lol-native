import { EventEmitter } from 'node:events';
import { LiveClient } from './services/liveClient';
import { Lcu } from './services/lcu';
import { DataDragon, type AssetsProgress } from './services/dataDragon';
import { AnalysisEngine } from './analysis/engine';
import { StaticStatsProvider } from './analysis/staticProvider';
import type {
  AppState,
  GamePhase,
  LiveGameData,
  ChampSelectState,
  ChampSelectPlayer,
  BuildAdvice,
  MatchupAdvice,
} from '../shared/types';

const CHAMP_SELECT_SESSION = '/lol-champ-select/v1/session';

interface LcuChampSelectSession {
  localPlayerCellId: number;
  myTeam: Array<{
    cellId: number;
    championId: number;
    summonerId?: number;
    assignedPosition?: string;
  }>;
  theirTeam: Array<{ cellId: number; championId: number; assignedPosition?: string }>;
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  timer?: { phase?: string };
  actions?: unknown[];
}

/**
 * Orquesta las dos fuentes (Live Client Data API en partida, LCU en champ
 * select), enriquece con Data Dragon y el motor de análisis, y emite un
 * AppState unificado hacia el proceso main.
 */
export class Overlay extends EventEmitter {
  readonly ddragon = new DataDragon();
  private readonly live = new LiveClient(1000);
  private readonly lcu = new Lcu(2000);
  private analysis!: AnalysisEngine;

  private phase: GamePhase = 'disconnected';
  private lcuConnected = false;
  private computing = false;

  on(e: 'state', l: (s: AppState) => void): this;
  on(e: 'assets-progress', l: (p: AssetsProgress) => void): this;
  on(e: string, l: (...args: never[]) => void): this {
    return super.on(e, l as (...args: unknown[]) => void);
  }
  emit(e: 'state', s: AppState): boolean;
  emit(e: 'assets-progress', p: AssetsProgress): boolean;
  emit(e: string, payload: unknown): boolean {
    return super.emit(e, payload);
  }

  /** Vuelve a comprobar Riot y descarga los assets si hay un parche nuevo. */
  async updateAssets(force = false): Promise<{ version: string; updated: boolean }> {
    return this.ddragon.update((p) => this.emit('assets-progress', p), { force });
  }

  async start(assetsDir?: string): Promise<void> {
    if (assetsDir) this.ddragon.setCacheDir(assetsDir);
    await this.ddragon.init((p) => this.emit('assets-progress', p));
    this.analysis = new AnalysisEngine(this.ddragon, new StaticStatsProvider());

    // --- Live Client Data API ---
    this.live.on('gameStarted', () => this.setPhase('in-game'));
    this.live.on('gameEnded', () => this.recoverPhaseAfterGame());
    this.live.on('data', (data) => void this.onLiveData(data));
    this.live.on('error', (err) => this.pushError(err.message));

    // --- LCU ---
    this.lcu.on('connected', () => {
      this.lcuConnected = true;
      if (this.phase === 'disconnected') this.setPhase('idle');
      void this.pollChampSelectOnce();
    });
    this.lcu.on('disconnected', () => {
      this.lcuConnected = false;
      if (this.phase !== 'in-game') this.setPhase('disconnected');
    });
    this.lcu.on('event', (uri, _type, data) => {
      if (uri === CHAMP_SELECT_SESSION) {
        void this.onChampSelect(data as LcuChampSelectSession | null);
      }
    });
    this.lcu.on('error', (err) => this.pushError(err.message));

    this.live.start();
    this.lcu.start();
    this.pushState();
  }

  stop(): void {
    this.live.stop();
    this.lcu.stop();
  }

  /* ----------------------------- Fases ----------------------------- */

  private setPhase(p: GamePhase): void {
    if (this.phase === p) return;
    this.phase = p;
    this.pushState();
  }

  private recoverPhaseAfterGame(): void {
    // Al terminar la partida, vuelve a idle si la LCU sigue conectada.
    this.setPhase(this.lcuConnected ? 'idle' : 'disconnected');
  }

  private async pollChampSelectOnce(): Promise<void> {
    try {
      const session = await this.lcu.request<LcuChampSelectSession>(CHAMP_SELECT_SESSION);
      if (session) await this.onChampSelect(session);
    } catch {
      // 404 => no estamos en champ select; normal.
    }
  }

  /* --------------------------- In-game --------------------------- */

  private async onLiveData(data: LiveGameData): Promise<void> {
    if (this.phase !== 'in-game') this.phase = 'in-game';
    if (this.computing) return;
    this.computing = true;
    try {
      const selfName = data.activePlayer.summonerName;
      const selfPlayer = data.allPlayers.find((p) => p.summonerName === selfName);
      const selfTeam = selfPlayer?.team;
      const allies = data.allPlayers.filter((p) => p.team === selfTeam);
      const enemies = data.allPlayers.filter((p) => p.team !== selfTeam);

      let build: BuildAdvice | undefined;
      const matchups: MatchupAdvice[] = [];
      let selfChampionName: string | undefined;
      let selfChampionIconUrl: string | undefined;

      if (selfPlayer) {
        const selfChamp = this.ddragon.championByName(selfPlayer.championName);
        const role = normalizeRole(selfPlayer.position);
        if (selfChamp) {
          selfChampionName = selfChamp.name;
          selfChampionIconUrl = this.ddragon.championIconUrl(selfChamp.id) ?? undefined;
          build = await this.analysis.buildAdvice(selfChamp.id, role);

          // Matchup contra cada enemigo (prioriza el oponente de línea).
          const laneOpponent = enemies.find(
            (e) => normalizeRole(e.position) === role && role !== undefined,
          );
          const ordered = laneOpponent
            ? [laneOpponent, ...enemies.filter((e) => e !== laneOpponent)]
            : enemies;

          for (const enemy of ordered) {
            const enemyChamp = this.ddragon.championByName(enemy.championName);
            if (!enemyChamp) continue;
            const m = await this.analysis.matchupAdvice(selfChamp.id, enemyChamp.id, role);
            if (m) matchups.push(m);
          }
        }
      }

      const state: AppState = {
        phase: 'in-game',
        ddragonVersion: this.ddragon.getVersion(),
        updatedAt: Date.now(),
        live: {
          game: data.gameData,
          self: data.activePlayer,
          selfChampionName,
          selfChampionIconUrl,
          selfScores: selfPlayer?.scores ?? null,
          allies,
          enemies,
          build,
          matchups,
        },
      };
      this.emit('state', state);
    } finally {
      this.computing = false;
    }
  }

  /* ------------------------- Champ select ------------------------- */

  private async onChampSelect(session: LcuChampSelectSession | null): Promise<void> {
    if (!session || !session.myTeam) {
      // Salimos de champ select.
      if (this.phase === 'champ-select') {
        this.setPhase(this.lcuConnected ? 'idle' : 'disconnected');
      }
      return;
    }
    this.phase = 'champ-select';

    const mapPlayer = (
      p: { cellId: number; championId: number; assignedPosition?: string },
      isLocal: boolean,
    ): ChampSelectPlayer => {
      const champ = p.championId ? this.ddragon.championByKey(p.championId) : undefined;
      return {
        cellId: p.cellId,
        championId: p.championId,
        championName: champ?.name,
        iconUrl: champ ? this.ddragon.championIconUrl(champ.id) ?? undefined : undefined,
        assignedPosition: p.assignedPosition,
        isLocalPlayer: isLocal,
      };
    };

    const myTeam = session.myTeam.map((p) =>
      mapPlayer(p, p.cellId === session.localPlayerCellId),
    );
    const theirTeam = (session.theirTeam ?? []).map((p) => mapPlayer(p, false));

    const csState: ChampSelectState = {
      inProgress: true,
      localPlayerCellId: session.localPlayerCellId,
      myTeam,
      theirTeam,
      bans: [
        ...(session.bans?.myTeamBans ?? []),
        ...(session.bans?.theirTeamBans ?? []),
      ],
      timerPhase: session.timer?.phase,
    };

    // Análisis para el jugador local.
    const local = myTeam.find((p) => p.isLocalPlayer);
    const role = normalizeRole(local?.assignedPosition);
    const suggestions = role ? await this.analysis.pickSuggestions(role, 5) : [];

    const counters: MatchupAdvice[] = [];
    let build: BuildAdvice | undefined;
    if (local?.championName && local.championId) {
      const selfChamp = this.ddragon.championByKey(local.championId);
      if (selfChamp) {
        build = await this.analysis.buildAdvice(selfChamp.id, role);
        // Counters frente a los rivales ya revelados.
        for (const enemy of theirTeam) {
          if (!enemy.championId) continue;
          const enemyChamp = this.ddragon.championByKey(enemy.championId);
          if (!enemyChamp) continue;
          const m = await this.analysis.matchupAdvice(selfChamp.id, enemyChamp.id, role);
          if (m) counters.push(m);
        }
      }
    }

    const state: AppState = {
      phase: 'champ-select',
      ddragonVersion: this.ddragon.getVersion(),
      updatedAt: Date.now(),
      champSelect: { state: csState, suggestions, counters, build },
    };
    this.emit('state', state);
  }

  /* ----------------------------- Util ----------------------------- */

  private pushError(message: string): void {
    this.emit('state', {
      phase: this.phase,
      ddragonVersion: this.ddragon.getVersion(),
      updatedAt: Date.now(),
      error: message,
    });
  }

  private pushState(): void {
    this.emit('state', {
      phase: this.phase,
      ddragonVersion: this.ddragon.getVersion(),
      updatedAt: Date.now(),
    });
  }
}

/** Normaliza posiciones de ambas APIs a las claves de roles del dataset. */
function normalizeRole(pos?: string): string | undefined {
  if (!pos) return undefined;
  const p = pos.toUpperCase();
  switch (p) {
    case 'TOP':
      return 'TOP';
    case 'JUNGLE':
      return 'JUNGLE';
    case 'MIDDLE':
    case 'MID':
      return 'MIDDLE';
    case 'BOTTOM':
    case 'BOT':
    case 'ADC':
      return 'BOTTOM';
    case 'UTILITY':
    case 'SUPPORT':
      return 'UTILITY';
    default:
      return undefined;
  }
}
