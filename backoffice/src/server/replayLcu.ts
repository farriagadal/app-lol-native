/**
 * Controla replays a través de la API local del cliente de LoL (LCU).
 * Requiere que el cliente esté abierto.
 */
import fs from 'node:fs';
import https from 'node:https';

const LOL_LOCKFILE_PATHS = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'D:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'C:\\Games\\League of Legends\\lockfile',
];

function findLockfile(): string | null {
  for (const p of LOL_LOCKFILE_PATHS) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { /* probar siguiente */ }
  }
  return null;
}

function parseLockfile(raw: string): { port: number; password: string } {
  const parts = raw.split(':');
  return { port: Number(parts[2]), password: parts[3] };
}

function lcuRequest(
  port: number,
  password: string,
  method: string,
  path: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${password}`).toString('base64');
    const bodyBuf = body ? Buffer.from(body, 'utf8') : undefined;
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        },
        rejectUnauthorized: false,
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout LCU')); });
    if (bodyBuf) req.end(bodyBuf); else req.end();
  });
}

function getLock(): { port: number; password: string } {
  const raw = findLockfile();
  if (!raw) {
    throw new Error(
      'No se encontró el cliente de LoL abierto.\nAsegúrate de que el cliente esté corriendo e intenta de nuevo.',
    );
  }
  return parseLockfile(raw);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Descarga el replay y espera a que termine, luego lanza la reproducción.
 * Flujo: POST download (204) → POST watch en loop hasta que el cliente
 * acepte (2xx) o falle definitivamente.
 */
export async function lcuReplayWatch(gameId: string): Promise<void> {
  const { port, password } = getLock();
  console.log(`[lcu] gameId=${gameId} puerto=${port}`);

  // 1. Iniciar descarga
  const dlRes = await lcuRequest(port, password, 'POST', `/lol-replays/v1/rofls/${gameId}/download`, '{}');
  console.log(`[lcu] download → HTTP ${dlRes.status}: ${dlRes.body.slice(0, 120)}`);
  if (dlRes.status >= 400) {
    let detail = dlRes.body;
    try { detail = (JSON.parse(dlRes.body) as { message?: string }).message ?? dlRes.body; } catch { /* ignora */ }
    throw new Error(`No se pudo iniciar la descarga (LCU ${dlRes.status}): ${detail}`);
  }

  // 2. Intentar watch en loop — el cliente lo rechaza mientras descarga,
  //    y lo acepta cuando el archivo está listo (máx 5 min).
  const RETRY_MS = 3_000;
  const TIMEOUT_MS = 5 * 60 * 1_000;
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = '';

  while (Date.now() < deadline) {
    await sleep(RETRY_MS);
    const watchRes = await lcuRequest(port, password, 'POST', `/lol-replays/v1/rofls/${gameId}/watch`, '{}');
    console.log(`[lcu] watch → HTTP ${watchRes.status}: ${watchRes.body.slice(0, 120)}`);

    if (watchRes.status < 400) return; // éxito

    let detail = watchRes.body;
    try { detail = (JSON.parse(watchRes.body) as { message?: string }).message ?? watchRes.body; } catch { /* ignora */ }
    lastError = detail;

    // Si el error indica que algo está definitivamente roto (no es "todavía descargando"), abortar
    const upper = detail.toUpperCase();
    if (upper.includes('FAIL') || upper.includes('NOT SUPPORTED') || upper.includes('INVALID')) {
      throw new Error(`El cliente de LoL no puede reproducir el replay: ${detail}`);
    }
    // Cualquier otro error (ej. "downloading") → seguir esperando
  }

  throw new Error(`Tiempo de espera agotado. El replay tardó más de 5 minutos en descargarse. Último error: ${lastError}`);
}

/** Sólo descarga, sin reproducir. */
export async function lcuReplayDownload(gameId: string): Promise<void> {
  const { port, password } = getLock();
  const res = await lcuRequest(port, password, 'POST', `/lol-replays/v1/rofls/${gameId}/download`, '{}');
  if (res.status >= 400) {
    let detail = res.body;
    try { detail = (JSON.parse(res.body) as { message?: string }).message ?? res.body; } catch { /* ignora */ }
    throw new Error(`LCU download HTTP ${res.status}: ${detail}`);
  }
}
