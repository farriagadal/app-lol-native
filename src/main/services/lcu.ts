import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
import { localRequest } from './localHttps';

export interface LockfileInfo {
  processName: string;
  pid: number;
  port: number;
  password: string;
  protocol: 'http' | 'https';
  authHeader: string; // Basic base64("riot:<password>")
}

/**
 * Rutas candidatas del lockfile del cliente de LoL. El lockfile aparece cuando
 * el cliente está abierto y desaparece al cerrarlo.
 */
function candidateLockfiles(): string[] {
  const paths: string[] = [];
  if (process.env.LOL_LOCKFILE) paths.push(process.env.LOL_LOCKFILE);

  if (process.platform === 'win32') {
    const drives = ['C:', 'D:', 'E:'];
    for (const d of drives) {
      paths.push(path.join(d, 'Riot Games', 'League of Legends', 'lockfile'));
    }
  } else if (process.platform === 'darwin') {
    paths.push(
      '/Applications/League of Legends.app/Contents/LoL/lockfile',
      path.join(os.homedir(), 'Applications', 'League of Legends.app', 'Contents', 'LoL', 'lockfile'),
    );
  }
  return paths;
}

function parseLockfile(content: string): LockfileInfo {
  // Formato: name:pid:port:password:protocol
  const parts = content.trim().split(':');
  if (parts.length < 5) {
    throw new Error(`Lockfile con formato inesperado: "${content}"`);
  }
  const [processName, pid, port, password, protocol] = parts;
  const authHeader =
    'Basic ' + Buffer.from(`riot:${password}`, 'utf8').toString('base64');
  return {
    processName,
    pid: Number(pid),
    port: Number(port),
    password,
    protocol: (protocol as 'http' | 'https') ?? 'https',
    authHeader,
  };
}

export type LcuEvents = {
  /** El cliente de LoL se abrió y se obtuvo credencial del lockfile. */
  connected: (info: LockfileInfo) => void;
  /** El cliente de LoL se cerró (desapareció el lockfile / WS caído). */
  disconnected: () => void;
  /** Evento crudo del WebSocket de la LCU (uri, eventType, data). */
  event: (uri: string, eventType: string, data: unknown) => void;
  error: (err: Error) => void;
};

export declare interface Lcu {
  on<K extends keyof LcuEvents>(e: K, l: LcuEvents[K]): this;
  emit<K extends keyof LcuEvents>(e: K, ...a: Parameters<LcuEvents[K]>): boolean;
}

/**
 * Cliente de la LCU API. Autentica por lockfile y se suscribe a eventos vía
 * WebSocket. No lee memoria ni inyecta: usa exclusivamente la API local que el
 * cliente expone.
 */
export class Lcu extends EventEmitter {
  private info: LockfileInfo | null = null;
  private ws: WebSocket | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private connecting = false;

  constructor(private readonly lockfilePollMs = 2000) {
    super();
  }

  start(): void {
    if (this.pollTimer) return;
    void this.scan();
    this.pollTimer = setInterval(() => void this.scan(), this.lockfilePollMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.teardown();
  }

  isConnected(): boolean {
    return this.info !== null && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Petición REST autenticada a la LCU. */
  async request<T = unknown>(
    apiPath: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    if (!this.info) throw new Error('LCU no conectada');
    return localRequest<T>({
      port: this.info.port,
      path: apiPath,
      method,
      body,
      headers: { Authorization: this.info.authHeader },
    });
  }

  private async findLockfile(): Promise<{ path: string; info: LockfileInfo } | null> {
    for (const p of candidateLockfiles()) {
      try {
        const content = await fsp.readFile(p, 'utf8');
        return { path: p, info: parseLockfile(content) };
      } catch {
        // sigue con el siguiente candidato
      }
    }
    return null;
  }

  private async scan(): Promise<void> {
    if (this.connecting) return;
    const found = await this.findLockfile();

    if (!found) {
      if (this.info) {
        // El cliente se cerró.
        this.teardown();
        this.emit('disconnected');
      }
      return;
    }

    // Misma sesión ya conectada y WS vivo: nada que hacer.
    if (
      this.info &&
      this.info.port === found.info.port &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    // Nueva credencial o WS caído: (re)conectar.
    this.connecting = true;
    this.teardown();
    this.info = found.info;
    try {
      await this.openWebSocket();
      this.emit('connected', found.info);
    } catch (err) {
      this.emit('error', err as Error);
      this.info = null;
    } finally {
      this.connecting = false;
    }
  }

  private openWebSocket(): Promise<void> {
    const info = this.info;
    if (!info) return Promise.reject(new Error('Sin credencial LCU'));

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${info.port}/`, {
        headers: { Authorization: info.authHeader },
        rejectUnauthorized: false,
      });

      const onOpenError = (err: Error) => reject(err);

      ws.once('open', () => {
        ws.removeListener('error', onOpenError);
        // Suscripción a todos los eventos JSON de la LCU.
        // Protocolo: [opcode 5 = SUBSCRIBE, "OnJsonApiEvent"]
        ws.send(JSON.stringify([5, 'OnJsonApiEvent']));
        this.ws = ws;
        resolve();
      });

      ws.once('error', onOpenError);

      ws.on('message', (raw) => this.handleMessage(raw));
      ws.on('close', () => {
        if (this.ws === ws) {
          this.ws = null;
          // El siguiente scan() detectará si el lockfile sigue o no.
        }
      });
      ws.on('error', (err) => this.emit('error', err as Error));
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      const text = raw.toString();
      if (!text) return;
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    // Formato: [8, "OnJsonApiEvent", { uri, eventType, data }]
    if (Array.isArray(parsed) && parsed.length === 3) {
      const payload = parsed[2] as { uri: string; eventType: string; data: unknown };
      if (payload && typeof payload.uri === 'string') {
        this.emit('event', payload.uri, payload.eventType, payload.data);
      }
    }
  }

  private teardown(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.info = null;
  }

  /** Utilidad: comprueba si una ruta de lockfile existe (síncrono, para debug). */
  static lockfileExists(): boolean {
    return candidateLockfiles().some((p) => fs.existsSync(p));
  }
}
