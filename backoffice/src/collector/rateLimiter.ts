import { log } from './log';

interface Window {
  max: number;
  windowMs: number;
  hits: number[]; // timestamps (ms) de las peticiones recientes
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Limitador de tasa con múltiples ventanas simultáneas (p.ej. 20/1s y 100/120s).
 * Antes de cada petición, espera hasta que TODAS las ventanas tengan hueco.
 * Es conservador a propósito: prioriza no recibir 429 sobre ir al máximo.
 */
export class RateLimiter {
  private windows: Window[];

  constructor(limits: { max: number; windowMs: number }[]) {
    this.windows = limits.map((l) => ({ ...l, hits: [] }));
  }

  /** Bloquea hasta que haya hueco en todas las ventanas, y registra la petición. */
  async acquire(): Promise<void> {
    // Puede requerir varias esperas si hay varias ventanas saturadas.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      let waitMs = 0;
      for (const w of this.windows) {
        // Descartar timestamps fuera de la ventana.
        const cutoff = now - w.windowMs;
        while (w.hits.length && w.hits[0] <= cutoff) w.hits.shift();
        if (w.hits.length >= w.max) {
          // Hay que esperar a que el hit más antiguo salga de la ventana.
          const freeAt = w.hits[0] + w.windowMs - now;
          waitMs = Math.max(waitMs, freeAt);
        }
      }
      if (waitMs <= 0) break;
      await sleep(waitMs + 25); // pequeño margen
    }
    const stamp = Date.now();
    for (const w of this.windows) w.hits.push(stamp);
  }

  /** Penalización explícita tras un 429 (respeta Retry-After). */
  async penalize(retryAfterSec: number): Promise<void> {
    const ms = Math.max(1, retryAfterSec) * 1000;
    log.warn(`429 recibido. Esperando ${retryAfterSec}s (Retry-After)...`);
    await sleep(ms + 250);
  }
}
