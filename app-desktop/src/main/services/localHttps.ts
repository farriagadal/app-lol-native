import https from 'node:https';
import { IncomingMessage } from 'node:http';

/**
 * Agente HTTPS que NO valida el certificado. El cliente de Riot (Live Client
 * Data API y LCU) sirve sobre TLS con un certificado autofirmado en 127.0.0.1.
 * Como las conexiones son estrictamente a loopback, deshabilitar la validación
 * es la práctica habitual y aceptada para estas APIs locales.
 *
 * Se reutiliza un único agente con keep-alive para no rehacer el handshake en
 * cada poll.
 */
export const loopbackAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 8,
});

export interface LocalRequestOptions {
  host?: string;
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export class LocalHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'LocalHttpError';
  }
}

/**
 * Realiza una petición HTTPS a un servicio local de Riot y devuelve el cuerpo
 * parseado como JSON (o `null` si está vacío).
 */
export function localRequest<T = unknown>(opts: LocalRequestOptions): Promise<T> {
  const {
    host = '127.0.0.1',
    port,
    path,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 4000,
  } = opts;

  const payload =
    body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host,
        port,
        path,
        method,
        agent: loopbackAgent,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(payload.length),
              }
            : {}),
          ...headers,
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            if (!text) {
              resolve(null as T);
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new LocalHttpError('Respuesta no es JSON válido', status, text));
            }
          } else {
            reject(new LocalHttpError(`HTTP ${status} en ${path}`, status, text));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout (${timeoutMs}ms) en ${path}`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}
