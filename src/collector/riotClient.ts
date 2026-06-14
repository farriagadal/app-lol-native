import { RateLimiter } from './rateLimiter';
import { RATE_LIMITS } from './config';
import { log } from './log';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Error no reintentable (4xx que no es 429): clave inválida, request mal formada, etc. */
class TerminalHttpError extends Error {}

/**
 * Cliente HTTP fino para la API de Riot:
 *  - usa fetch nativo de Node 20
 *  - respeta el rate limit (RateLimiter)
 *  - reintenta ante 429 (con Retry-After), 5xx y errores de red
 *  - devuelve null en 404 (recurso inexistente, no es error)
 */
export class RiotClient {
  private limiter = new RateLimiter(RATE_LIMITS);

  constructor(private apiKey: string) {}

  private host(routing: string): string {
    return `https://${routing}.api.riotgames.com`;
  }

  /**
   * GET genérico. `routing` es el subdominio (p.ej. 'la2' o 'americas').
   * Lanza si tras varios reintentos sigue fallando; devuelve null en 404.
   */
  async get<T>(routing: string, path: string, maxRetries = 6): Promise<T | null> {
    const url = `${this.host(routing)}${path}`;
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++;
      await this.limiter.acquire();
      try {
        const res = await fetch(url, {
          headers: { 'X-Riot-Token': this.apiKey },
        });

        if (res.status === 404) return null;

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after') ?? '5');
          await this.limiter.penalize(Number.isFinite(retryAfter) ? retryAfter : 5);
          continue; // reintenta sin contar como fallo definitivo
        }

        if (res.status >= 500) {
          if (attempt > maxRetries) {
            throw new Error(`${res.status} en ${path} tras ${maxRetries} reintentos`);
          }
          const backoff = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
          log.warn(`${res.status} en ${path}. Reintento en ${backoff}ms (${attempt}/${maxRetries})`);
          await sleep(backoff);
          continue;
        }

        if (!res.ok) {
          // Otros 4xx (401/403 clave inválida o expirada, 400 mal formada...):
          // no tiene sentido reintentar.
          const body = await res.text().catch(() => '');
          const hint =
            res.status === 401 || res.status === 403
              ? ' (¿RIOT_API_KEY inválida o expirada? Las dev keys caducan cada 24h)'
              : '';
          throw new TerminalHttpError(
            `${res.status} en ${path}${hint}: ${body.slice(0, 200)}`,
          );
        }

        return (await res.json()) as T;
      } catch (err) {
        // Errores terminales (4xx): propagar sin reintentar.
        if (err instanceof TerminalHttpError) throw err;
        // Error de red / timeout: reintentar con backoff.
        if (attempt > maxRetries) throw err;
        const backoff = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
        log.warn(
          `Error de red en ${path}: ${(err as Error).message}. Reintento en ${backoff}ms (${attempt}/${maxRetries})`,
        );
        await sleep(backoff);
      }
    }
  }
}
