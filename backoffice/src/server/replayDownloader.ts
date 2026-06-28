/**
 * Descarga replays de partidas completadas desde el servidor espectador de Riot
 * y los ensambla en un archivo .rofl que el cliente de LoL puede reproducir.
 *
 * El matchId codifica la plataforma: "LA2_7234567890" → platform=LA2, gameId=7234567890.
 * Los replays están disponibles ~2 semanas después de la partida.
 *
 * Formato .rofl documentado por la comunidad (EloGank, rofl-parser, etc.).
 */

import https from 'node:https';
import http from 'node:http';

// Servidores espectadores: primero se prueba HTTPS:443, luego HTTP:8088 como fallback.
const SPECTATOR: Record<string, string[]> = {
  BR1:  ['https://spectator.br.lol.riotgames.com',  'http://spectator.br.lol.riotgames.com:8088'],
  EUN1: ['https://spectator.eu.lol.riotgames.com',  'http://spectator.eu.lol.riotgames.com:8088'],
  EUW1: ['https://spectator.euw1.lol.riotgames.com','http://spectator.euw1.lol.riotgames.com:8088'],
  JP1:  ['https://spectator.jp1.lol.riotgames.com', 'http://spectator.jp1.lol.riotgames.com:8088'],
  KR:   ['https://spectator.kr.lol.riotgames.com',  'http://spectator.kr.lol.riotgames.com:8088'],
  LA1:  ['https://spectator.la.lol.riotgames.com',   'http://spectator.la.lol.riotgames.com:8088',  'https://spectator.lan.lol.riotgames.com',  'http://spectator.lan.lol.riotgames.com:8088'],
  LA2:  ['https://spectator.las.lol.riotgames.com', 'http://spectator.las.lol.riotgames.com:8088', 'https://spectator.la2.lol.riotgames.com', 'http://spectator.la2.lol.riotgames.com:8088'],
  NA1:  ['https://spectator.na.lol.riotgames.com',  'http://spectator.na.lol.riotgames.com:8088'],
  OC1:  ['https://spectator.oc1.lol.riotgames.com', 'http://spectator.oc1.lol.riotgames.com:8088'],
  TR1:  ['https://spectator.tr.lol.riotgames.com',  'http://spectator.tr.lol.riotgames.com:8088'],
  RU:   ['https://spectator.ru.lol.riotgames.com',  'http://spectator.ru.lol.riotgames.com:8088'],
  PH2:  ['https://spectator.ph2.lol.riotgames.com', 'http://spectator.ph2.lol.riotgames.com:8088'],
  SG2:  ['https://spectator.sg2.lol.riotgames.com', 'http://spectator.sg2.lol.riotgames.com:8088'],
  TH2:  ['https://spectator.th2.lol.riotgames.com', 'http://spectator.th2.lol.riotgames.com:8088'],
  TW2:  ['https://spectator.tw2.lol.riotgames.com', 'http://spectator.tw2.lol.riotgames.com:8088'],
  VN2:  ['https://spectator.vn2.lol.riotgames.com', 'http://spectator.vn2.lol.riotgames.com:8088'],
};

const TIMEOUT_MS = 15_000;
const DOWNLOAD_BATCH = 5;

export function parseMatchId(matchId: string): { platform: string; gameId: string } | null {
  const m = /^([A-Z0-9]+)_(\d+)$/.exec(matchId.trim());
  if (!m) return null;
  return { platform: m[1], gameId: m[2] };
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = (mod as typeof https).get(url, { timeout: TIMEOUT_MS, rejectUnauthorized: false }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => resolve(Buffer.concat(parts)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`timeout — ${url}`)); });
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString('utf8')) as T;
}

interface ChunkInfo {
  chunkId: number;
  keyFrameId: number;
  endStartupChunkId: number;
  startGameChunkId: number;
  endGameChunkId: number;
}

interface GameMeta {
  gameEnded: boolean;
  gameLength: number;
  gameVersion?: string;
  statsJSON?: string;
}

async function downloadBatch(
  ids: number[],
  fetcher: (id: number) => Promise<Buffer>,
  store: Map<number, Buffer>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += DOWNLOAD_BATCH) {
    const batch = ids.slice(i, i + DOWNLOAD_BATCH);
    const results = await Promise.all(batch.map(async (id) => ({ id, data: await fetcher(id) })));
    for (const { id, data } of results) store.set(id, data);
  }
}

/**
 * Ensambla el buffer .rofl a partir de los datos del servidor espectador.
 *
 * Cabecera ROFL (288 bytes):
 *  [0-3]   "RIOT" (magic)
 *  [4-5]   0x00 0x00 (padding)
 *  [6-261] firma RSA (zeros en replays descargados)
 *  [262]   header length uint16 LE = 288
 *  [264]   file length uint32 LE
 *  [268]   metadata offset uint32 LE = 288
 *  [272]   metadata length uint32 LE
 *  [276]   payload header offset uint32 LE
 *  [280]   payload header length uint32 LE
 *  [284]   payload offset uint32 LE
 *
 * Entrada en payload header (17 bytes):
 *  [0]  ID uint32 LE
 *  [4]  tipo uint8 (1=keyframe, 2=chunk)
 *  [5]  longitud uint32 LE
 *  [9]  nextId uint32 LE
 *  [13] offset desde inicio del payload uint32 LE
 */
function buildRofl(
  meta: GameMeta,
  chunkInfo: ChunkInfo,
  chunks: Map<number, Buffer>,
  keyframes: Map<number, Buffer>,
): Buffer {
  const metaObj = {
    gameLength: meta.gameLength,
    lastChunkId: chunkInfo.chunkId,
    lastKeyFrameId: chunkInfo.keyFrameId,
    endStartupChunkId: chunkInfo.endStartupChunkId,
    startGameChunkId: chunkInfo.startGameChunkId,
    gameVersion: meta.gameVersion ?? '',
    statsJSON: meta.statsJSON ?? '',
  };
  const metaBuf = Buffer.from(JSON.stringify(metaObj), 'utf8');

  // Payload: primero keyframes luego chunks, ambos en orden ascendente
  const sortedKf = [...keyframes.entries()].sort(([a], [b]) => a - b);
  const sortedCh = [...chunks.entries()].sort(([a], [b]) => a - b);

  type Entry = { id: number; type: 1 | 2; data: Buffer; offset: number };
  const entries: Entry[] = [];
  let offset = 0;

  for (const [id, data] of sortedKf) {
    entries.push({ id, type: 1, data, offset });
    offset += data.length;
  }
  for (const [id, data] of sortedCh) {
    entries.push({ id, type: 2, data, offset });
    offset += data.length;
  }

  const payloadBuf = Buffer.concat(entries.map((e) => e.data));

  // Payload header: 17 bytes por entrada
  const phBuf = Buffer.allocUnsafe(entries.length * 17);
  let pos = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nextId = i + 1 < entries.length ? entries[i + 1].id : 0;
    phBuf.writeUInt32LE(e.id, pos);       pos += 4;
    phBuf.writeUInt8(e.type, pos);        pos += 1;
    phBuf.writeUInt32LE(e.data.length, pos); pos += 4;
    phBuf.writeUInt32LE(nextId, pos);     pos += 4;
    phBuf.writeUInt32LE(e.offset, pos);   pos += 4;
  }

  // Cabecera fija de 288 bytes
  const HEADER_LEN = 288;
  const metaOffset = HEADER_LEN;
  const phOffset = metaOffset + metaBuf.length;
  const payloadOffset = phOffset + phBuf.length;
  const fileLength = payloadOffset + payloadBuf.length;

  const header = Buffer.alloc(HEADER_LEN, 0);
  header.write('RIOT', 0, 'ascii');
  // [4-5] padding zeros (ya inicializados)
  // [6-261] signature zeros (ya inicializados)
  header.writeUInt16LE(HEADER_LEN, 262);
  header.writeUInt32LE(fileLength, 264);
  header.writeUInt32LE(metaOffset, 268);
  header.writeUInt32LE(metaBuf.length, 272);
  header.writeUInt32LE(phOffset, 276);
  header.writeUInt32LE(phBuf.length, 280);
  header.writeUInt32LE(payloadOffset, 284);

  return Buffer.concat([header, metaBuf, phBuf, payloadBuf]);
}

/** Prueba candidatos de URL hasta encontrar uno que responda correctamente. */
async function resolveBase(candidates: string[], platform: string, gameId: string): Promise<string> {
  for (const base of candidates) {
    try {
      const meta = await fetchJson<GameMeta>(`${base}/observer-mode/rest/consumer/getGameMetaData/${platform}/${gameId}/1/token`);
      if (meta && typeof meta.gameEnded !== 'undefined') return `${base}/observer-mode/rest/consumer`;
    } catch { /* probar siguiente */ }
  }
  throw new Error(
    'Replay no disponible. Posibles causas: (1) la partida es de hace más de ~2 semanas y expiró, ' +
    '(2) el servidor espectador de Riot no responde. Solo replays recientes pueden descargarse.',
  );
}

export async function downloadReplay(matchId: string): Promise<Buffer> {
  const parsed = parseMatchId(matchId);
  if (!parsed) throw new Error(`matchId inválido: ${matchId}`);

  const { platform, gameId } = parsed;
  const candidates = SPECTATOR[platform];
  if (!candidates) throw new Error(`Plataforma no soportada: ${platform}`);

  const base = await resolveBase(candidates, platform, gameId);

  const [meta, chunkInfo] = await Promise.all([
    fetchJson<GameMeta>(`${base}/getGameMetaData/${platform}/${gameId}/1/token`),
    fetchJson<ChunkInfo>(`${base}/getLastChunkInfo/${platform}/${gameId}/0/token`),
  ]);

  if (!meta.gameEnded) {
    throw new Error('La partida no ha terminado o los datos no están disponibles aún.');
  }
  if (!chunkInfo.chunkId || !chunkInfo.keyFrameId) {
    throw new Error('Replay expirado o no disponible en el servidor de Riot.');
  }

  const chunkIds = Array.from({ length: chunkInfo.chunkId }, (_, i) => i + 1);
  const kfIds    = Array.from({ length: chunkInfo.keyFrameId }, (_, i) => i + 1);

  const chunks    = new Map<number, Buffer>();
  const keyframes = new Map<number, Buffer>();

  await Promise.all([
    downloadBatch(chunkIds, (id) => fetchBuffer(`${base}/getGameDataChunk/${platform}/${gameId}/${id}/token`), chunks),
    downloadBatch(kfIds,    (id) => fetchBuffer(`${base}/getKeyFrame/${platform}/${gameId}/${id}/token`),    keyframes),
  ]);

  return buildRofl(meta, chunkInfo, chunks, keyframes);
}
