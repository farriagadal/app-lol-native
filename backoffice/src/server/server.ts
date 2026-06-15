import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { StatsDb } from './db';
import { CollectRunner } from './collectRunner';
import { REGIONS } from '../collector/config';
import type { CollectRequest } from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const PORT = Number(process.env.PORT) || 4317;

const db = new StatsDb(DATA_DIR);
const runner = new CollectRunner(DATA_DIR);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: http.ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
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
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      sendJson(res, 200, await db.champions(region, patch, tier));
      return;
    }
    if (
      (p === '/api/items' || p === '/api/runes' || p === '/api/spells') &&
      req.method === 'GET'
    ) {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      const f = {
        patch: url.searchParams.get('patch') || 'all',
        tier: url.searchParams.get('tier') || 'all',
        role: url.searchParams.get('role') || 'ALL',
        champion: url.searchParams.get('champion') || 'all',
      };
      const data =
        p === '/api/items' ? await db.itemStats(region, f)
        : p === '/api/runes' ? await db.runeStats(region, f)
        : await db.spellStats(region, f);
      sendJson(res, 200, data);
      return;
    }
    if (p === '/api/status' && req.method === 'GET') {
      const region = url.searchParams.get('region');
      if (!region) return sendJson(res, 400, { error: 'falta region' });
      sendJson(res, 200, runner.status(region));
      return;
    }
    if (p === '/api/collect' && req.method === 'POST') {
      const body = await readBody(req);
      let request: CollectRequest;
      try {
        request = JSON.parse(body) as CollectRequest;
      } catch {
        return sendJson(res, 400, { error: 'JSON inválido' });
      }
      // Progreso en streaming (NDJSON): una línea JSON por evento.
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
      const status = await runner.run(request, (prog) => res.write(JSON.stringify(prog) + '\n'));
      db.reload(request.region); // base reconstruida: refresca la cache
      res.write(JSON.stringify({ phase: 'status', ...status }) + '\n');
      res.end();
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
