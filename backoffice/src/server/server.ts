// El antivirus o proxy del equipo puede interceptar TLS con su propio cert,
// que Node.js no tiene en su almacén (distinto del de Windows). Para un
// servidor local que solo llama a api.riotgames.com esto es aceptable.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { StatsDb } from './db';
import { CollectRunner } from './collectRunner';
import { REGIONS } from '../collector/config';
import { downloadReplay } from './replayDownloader';
import type { CollectRequest } from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
// Carpeta de assets compartida en la raíz del repo (descargada con
// scripts/download-assets.mjs). Se sirve bajo /assets/*.
const ASSETS_DIR = path.resolve(process.cwd(), '..', 'assets');
const PORT = Number(process.env.PORT) || 4317;

const db = new StatsDb(DATA_DIR);
const runner = new CollectRunner(DATA_DIR);

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
    if (p === '/api/download-replay' && req.method === 'GET') {
      const matchId = url.searchParams.get('matchId');
      if (!matchId) return sendJson(res, 400, { error: 'falta matchId' });
      try {
        const buf = await downloadReplay(matchId);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${matchId}.rofl"`,
          'Content-Length': String(buf.length),
        });
        res.end(buf);
      } catch (err) {
        sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
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
    if (p === '/api/match' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      const matchId = url.searchParams.get('matchId');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      if (!matchId) return sendJson(res, 400, { error: 'falta matchId' });
      const detail = await db.matchDetail(region, matchId);
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
