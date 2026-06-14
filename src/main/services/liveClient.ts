import { EventEmitter } from 'node:events';
import { localRequest, LocalHttpError } from './localHttps';
import type { LiveGameData } from '../../shared/types';

const LIVE_PORT = 2999;
const ALL_GAME_DATA = '/liveclientdata/allgamedata';

export type LiveClientEvents = {
  /** Hay una partida activa y se obtuvieron datos frescos. */
  data: (data: LiveGameData) => void;
  /** La partida terminó o aún no hay ninguna (conexión rechazada). */
  gameEnded: () => void;
  /** Comenzó una partida (transición de "sin partida" a "con datos"). */
  gameStarted: () => void;
  error: (err: Error) => void;
};

export declare interface LiveClient {
  on<K extends keyof LiveClientEvents>(e: K, l: LiveClientEvents[K]): this;
  emit<K extends keyof LiveClientEvents>(
    e: K,
    ...a: Parameters<LiveClientEvents[K]>
  ): boolean;
}

/**
 * Poolea la Live Client Data API mientras hay una partida en curso.
 * No lee memoria ni inyecta: sólo consume el endpoint HTTPS local que el
 * propio cliente de LoL expone durante la partida.
 */
export class LiveClient extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private active = false;
  private inGame = false;

  constructor(private readonly intervalMs = 1000) {
    super();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.tick();
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.inGame = false;
  }

  isInGame(): boolean {
    return this.inGame;
  }

  private scheduleNext(): void {
    if (!this.active) return;
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (!this.active) return;
    try {
      const data = await localRequest<LiveGameData>({
        port: LIVE_PORT,
        path: ALL_GAME_DATA,
        timeoutMs: 3000,
      });

      if (data && data.gameData) {
        if (!this.inGame) {
          this.inGame = true;
          this.emit('gameStarted');
        }
        this.emit('data', data);
      }
    } catch (err) {
      // ECONNREFUSED / timeout => no hay partida activa todavía o terminó.
      if (this.inGame) {
        this.inGame = false;
        this.emit('gameEnded');
      }
      if (err instanceof LocalHttpError && err.status >= 500) {
        this.emit('error', err);
      }
      // Otros errores (conexión rechazada) son esperables: se ignoran.
    } finally {
      this.scheduleNext();
    }
  }
}
