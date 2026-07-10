// El antivirus o proxy del equipo puede interceptar TLS con su propio cert,
// que Node.js no tiene en su almacén (distinto del de Windows). Para un
// servidor local que solo llama a api.riotgames.com esto es aceptable.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { StatsDb } from './db';
import { CollectRunner } from './collectRunner';
import { REGIONS } from '../collector/config';
import { downloadReplay, parseMatchId } from './replayDownloader';
import { RiotClient } from '../collector/riotClient';
import { lcuReplayDownload, lcuReplayWatch } from './replayLcu';
import { collectPlayer, type PlayerCollectProgress } from './playerCollector';
import { MongoStore } from '../collector/mongoStore';
import type { CollectRequest } from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
// Carpeta de assets compartida en la raíz del repo (descargada con
// scripts/download-assets.mjs). Se sirve bajo /assets/*.
const ASSETS_DIR = path.resolve(process.cwd(), '..', 'assets');
const PORT = Number(process.env.PORT) || 4317;

const db = new StatsDb(DATA_DIR);
const runner = new CollectRunner(DATA_DIR);

// Si MONGODB_URI está definida, conectar para servir Partidas desde Atlas.
let mongoStore: MongoStore | null = null;
const MONGO_URI = process.env.MONGODB_URI;
if (MONGO_URI) {
  const mongoClient = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  mongoClient
    .connect()
    .then(() => {
      mongoStore = new MongoStore(mongoClient, '');
      console.log('[server] MongoDB conectado — Partidas usará Atlas.');
    })
    .catch((err: Error) => {
      console.warn('[server] MongoDB no disponible, Partidas usará SQLite:', err.message);
    });
}
let replayWatchBusy = false;
let playerCollectProgress: PlayerCollectProgress | null = null;

/**
 * Últimos 20 matchIds del jugador (cualquier cola) según la API de Riot, para
 * verificar que un replay siga disponible antes de intentar descargarlo.
 * Devuelve null si la consulta no se pudo hacer (la verificación es best-effort
 * y en ese caso se sigue con el intento de descarga normal).
 */
// (export solo para que compile mientras la validación de abajo está comentada)
export async function recentMatchIds(platform: string, apiKey: string, puuid: string): Promise<string[] | null> {
  const regional = REGIONS[platform.toLowerCase() as keyof typeof REGIONS]?.regional;
  if (!regional) return null;
  try {
    return await new RiotClient(apiKey).get<string[]>(
      regional,
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=20`,
      2,
    );
  } catch (err) {
    console.warn(`[replay] No se pudo verificar el historial reciente: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Los assets compartidos viven fuera de public/, en la raíz del repo.
  const isAsset = urlPath.startsWith('/assets/');
  const baseDir = isAsset ? ASSETS_DIR : PUBLIC_DIR;
  const rel = isAsset ? urlPath.slice('/assets'.length) : urlPath;
  const file = path.join(baseDir, path.normalize(rel));
  if (!file.startsWith(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // Rutas sin extensión (p.ej. /champ/jhin) -> SPA: servir index.html.
      if (!path.extname(file)) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, b2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(b2);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error('cuerpo demasiado grande'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const p = url.pathname;
  const t0 = Date.now();
  const isApi = p.startsWith('/api/');
  if (isApi) {
    console.log(`→ ${req.method} ${req.url}`);
    res.on('finish', () => console.log(`← ${req.method} ${p} ${res.statusCode} [${Date.now() - t0}ms]`));
  }
  try {
    if (p === '/api/regions' && req.method === 'GET') {
      sendJson(res, 200, {
        dataRegions: db.regions(),
        servers: Object.entries(REGIONS).map(([key, v]) => ({ key, label: v.label })),
      });
      return;
    }
    if (p === '/api/meta' && req.method === 'GET') {
      sendJson(res, 200, await db.meta(url.searchParams.get('region') || undefined));
      return;
    }
    if (p === '/api/champions' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const patch = url.searchParams.get('patch') || 'all';
      const tier = url.searchParams.get('tier') || 'all';
      const dateFrom = url.searchParams.get('dateFrom') || '';
      const dateTo = url.searchParams.get('dateTo') || '';
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      sendJson(res, 200, await db.champions(region, patch, tier, dateFrom, dateTo));
      return;
    }
    if (
      ['/api/items', '/api/runes', '/api/spells', '/api/players', '/api/counters', '/api/synergy'].includes(p) &&
      req.method === 'GET'
    ) {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      const data =
        p === '/api/items' ? await db.itemStats(region, f)
        : p === '/api/runes' ? await db.runeStats(region, f)
        : p === '/api/spells' ? await db.spellStats(region, f)
        : p === '/api/players' ? await db.playerStats(region, f)
        : p === '/api/synergy' ? await db.synergyStats(region, f)
        : await db.counterStats(region, f);
      sendJson(res, 200, data);
      return;
    }
    if (p === '/api/replay-watch' && req.method === 'POST') {
      const matchId = url.searchParams.get('matchId');
      if (!matchId) return sendJson(res, 400, { error: 'falta matchId' });
      const parsed = parseMatchId(matchId);
      if (!parsed) return sendJson(res, 400, { error: 'matchId inválido' });
      if (replayWatchBusy) {
        return sendJson(res, 409, { error: 'Ya hay un replay abriéndose. Espera a que termine.' });
      }
      // Verificación previa: el replay solo se puede bajar si la partida sigue
      // entre las últimas 20 del jugador (historial reciente del cliente de LoL).
      // DESACTIVADA temporalmente para pruebas — descomentar para reactivarla.
      // const watchPuuid = url.searchParams.get('puuid');
      // const watchApiKey = url.searchParams.get('apiKey');
      // if (watchPuuid && watchApiKey) {
      //   const recent = await recentMatchIds(parsed.platform, watchApiKey, watchPuuid);
      //   if (recent && !recent.includes(matchId)) {
      //     console.warn(`[lcu] ${matchId} ya no está entre las últimas 20 partidas del jugador; no se intenta descargar.`);
      //     return sendJson(res, 409, {
      //       error:
      //         'Esta partida ya no está entre las últimas 20 del jugador, ' +
      //         'así que su replay ya no está disponible para descargar.',
      //     });
      //   }
      // }
      replayWatchBusy = true;
      console.log(`[lcu] Iniciando watch ${matchId}`);
      try {
        await lcuReplayWatch(parsed.gameId);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[lcu] Watch falló: ${msg}`);
        return sendJson(res, 502, { error: msg });
      } finally {
        replayWatchBusy = false;
      }
    }
    if (p === '/api/download-replay' && req.method === 'GET') {
      const matchId = url.searchParams.get('matchId');
      if (!matchId) return sendJson(res, 400, { error: 'falta matchId' });
      console.log(`[replay] Descargando ${matchId}…`);
      // Intento 1: servidor espectador de Riot (funciona en regiones con servidor público)
      try {
        const buf = await downloadReplay(matchId);
        console.log(`[replay] OK vía espectador ${matchId} — ${buf.length} bytes`);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${matchId}.rofl"`,
          'Content-Length': String(buf.length),
        });
        res.end(buf);
        return;
      } catch (spectatorErr) {
        console.warn(`[replay] Espectador falló, intentando LCU: ${spectatorErr instanceof Error ? spectatorErr.message : spectatorErr}`);
      }
      // Intento 2: LCU (cliente de LoL local)
      const parsed = parseMatchId(matchId);
      if (parsed) {
        try {
          await lcuReplayDownload(parsed.gameId);
          console.log(`[replay] OK vía LCU ${matchId}`);
          return sendJson(res, 200, {
            lcu: true,
            message: 'Descarga iniciada en el cliente de LoL. El replay aparecerá en tu carpeta de replays cuando termine.',
          });
        } catch (lcuErr) {
          console.error(`[replay] LCU también falló: ${lcuErr instanceof Error ? lcuErr.message : lcuErr}`);
          return sendJson(res, 502, {
            error:
              'No se pudo descargar el replay por ninguna vía.\n\n' +
              '• Servidor espectador de Riot: no disponible para esta región (LA2).\n' +
              '• Cliente de LoL: ' + (lcuErr instanceof Error ? lcuErr.message : String(lcuErr)),
          });
        }
      }
      return sendJson(res, 502, { error: 'matchId inválido o región no soportada.' });
    }
    if (p === '/api/streaks' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      sendJson(res, 200, await db.streaks(region, f, limit, offset));
      return;
    }
    if (p === '/api/player-games' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const puuid = url.searchParams.get('puuid');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      if (!puuid) return sendJson(res, 400, { error: 'falta puuid' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      sendJson(res, 200, await db.playerGames(region, puuid, f, limit, offset));
      return;
    }
    if (p === '/api/item-games' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const item = Number(url.searchParams.get('item'));
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      if (!Number.isFinite(item) || item <= 0) return sendJson(res, 400, { error: 'item inválido' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      sendJson(res, 200, await db.itemGames(region, item, f, limit, offset));
      return;
    }
    if (p === '/api/recommend' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      const splitList = (key: string) =>
        (url.searchParams.get(key) || '').split(',').map((s) => s.trim()).filter(Boolean);
      const myChamps = splitList('myChamps');
      const enemies = splitList('enemies');
      const allies = splitList('allies');
      const role = url.searchParams.get('role') || 'ALL';
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      sendJson(res, 200, await db.recommend(region, myChamps, enemies, allies, role, f));
      return;
    }
    if (p === '/api/games' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
      };
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      if (mongoStore) {
        const allRegions = await mongoStore.regions();
        const regions =
          !region || region === 'all'
            ? allRegions
            : region.split(',').filter((r) => allRegions.includes(r));
        sendJson(res, 200, await mongoStore.matchList(regions, f, limit, offset));
      } else {
        sendJson(res, 200, await db.matchList(region, f, limit, offset));
      }
      return;
    }
    if (p === '/api/match' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const matchId = url.searchParams.get('matchId');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      if (!matchId) return sendJson(res, 400, { error: 'falta matchId' });
      const detail = mongoStore
        ? await mongoStore.matchDetail(matchId)
        : await db.matchDetail(region, matchId);
      if (!detail) return sendJson(res, 404, { error: 'partida no encontrada' });
      sendJson(res, 200, detail);
      return;
    }
    if (p === '/api/status' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      sendJson(res, 200, runner.status(region));
      return;
    }
    if (p === '/api/collect-player/status' && req.method === 'GET') {
      return sendJson(res, 200, playerCollectProgress ?? { phase: 'idle' });
    }
    if (p === '/api/collect-player' && req.method === 'POST') {
      const body = await readBody(req);
      const { apiKey, riotId, limit, region: reqRegion } = JSON.parse(body) as {
        apiKey: string; riotId: string; limit: number; region?: string;
      };
      if (!apiKey || !riotId) return sendJson(res, 400, { error: 'faltan campos: apiKey, riotId' });
      if (playerCollectProgress && !['done', 'error', 'idle'].includes(playerCollectProgress.phase)) {
        return sendJson(res, 409, { error: 'Ya hay una recolección de jugador en curso.' });
      }
      const safeLimit = Math.min(200, Math.max(1, Number(limit) || 20));
      // Si el frontend pasa una región concreta, usarla; si no, probar todas.
      const regionsToTry = reqRegion && REGIONS[reqRegion as keyof typeof REGIONS]
        ? [reqRegion]
        : Object.keys(REGIONS);
      console.log(`[player-collect] ${riotId} buscando en ${regionsToTry.join(', ')}, hasta ${safeLimit} partidas`);
      void (async () => {
        for (const region of regionsToTry) {
          playerCollectProgress = { phase: 'resolving', riotId, region, downloaded: 0, skipped: 0, total: 0 };
          try {
            const found = await collectPlayer(region, apiKey, riotId, safeLimit, DATA_DIR, (prog) => {
              playerCollectProgress = prog;
              console.log(`[player-collect] ${prog.phase} ${prog.downloaded}/${prog.total}`);
              if (prog.phase === 'done') void db.reload(region);
            });
            if (found) return; // encontrado y listo, detener búsqueda
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Error 401/403 (API key inválida): abortar búsqueda
            if (msg.includes('401') || msg.includes('403')) {
              console.error(`[player-collect] ERROR fatal: ${msg}`);
              playerCollectProgress = { phase: 'error', riotId, region, downloaded: 0, skipped: 0, total: 0, error: msg };
              return;
            }
            // Cualquier otro error en este servidor: continuar con el siguiente
            console.warn(`[player-collect] ${region}: ${msg}, probando siguiente servidor…`);
          }
        }
        // Si llegamos aquí, no se encontró en ningún servidor
        playerCollectProgress = { phase: 'error', riotId, region: '', downloaded: 0, skipped: 0, total: 0, error: `Jugador "${riotId}" no encontrado en ningún servidor.` };
      })();
      return sendJson(res, 202, { started: true });
    }
    if (p === '/api/run' && req.method === 'POST') {
      const body = await readBody(req);
      let request: CollectRequest;
      try {
        request = JSON.parse(body) as CollectRequest;
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido' });
      }
      if (runner.isRunning(request.region)) return sendJson(res, 202, { running: true });
      // Se lanza en segundo plano y se responde al instante: la recolección NO
      // queda atada a la petición HTTP (puede durar horas). El cliente sigue el
      // progreso por polling a /api/status. Al terminar, refresca la cache de la base.
      void runner.run(request).then(() => db.reload(request.region)).catch(() => {});
      sendJson(res, 202, { started: true });
      return;
    }
    if (p === '/api/collect-history' && req.method === 'GET') {
      const regions = db.regions();
      const summaries = await Promise.all(
        regions.map(async (region) => {
          const m = await db.meta(region);
          return { region, totalGames: m.totalGames, totalParticipants: m.totalParticipants, patches: m.patches };
        }),
      );
      sendJson(res, 200, summaries);
      return;
    }
    if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'no encontrado' });
    serveStatic(req, res);
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Back office en http://localhost:${PORT}`);
  console.log(`Datos en: ${DATA_DIR}`);
});
