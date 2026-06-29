import * as fs from 'fs';
import * as path from 'path';
import { MongoClient } from 'mongodb';
import { Store } from './store';
import { MongoStore } from './mongoStore';
import { loadChampionMap } from './ddragon';
import { log } from './log';
import { resolveRegion, RANKED_SOLO_QUEUE_ID } from './config';

export interface AggregateOptions {
  region: string;
  /** Filtra por parche "major.minor" (p.ej. "14.11"). Vacío = todos. */
  patch?: string;
  /** Filas con menos de N partidas se excluyen del JSON limpio. */
  minGames: number;
  /** URI de MongoDB Atlas. Si se pasa, lee partidas desde allí en vez de JSONL. */
  mongoUri?: string;
}

interface MatchCore {
  queueId: number;
  gameVersion: string;
  participants: { championName: string; teamPosition: string; win: boolean }[];
  bans: { championId: number }[];
}

const VALID_ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

interface RoleAcc {
  games: number;
  wins: number;
}

/** Estructura de salida, compatible con ChampionRoleStat del overlay. */
interface ChampionRoleStat {
  championId: string;
  role: string;
  winRate: number;
  pickRate: number;
  banRate: number;
  games: number;
}

function patchOf(gameVersion: string): string {
  const parts = gameVersion.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : gameVersion;
}

async function* matchSource(
  store: Store,
  mongoStore: MongoStore | undefined,
): AsyncGenerator<MatchCore> {
  if (mongoStore) {
    for await (const doc of mongoStore.iterateMatches()) {
      yield {
        queueId: doc.queueId,
        gameVersion: doc.gameVersion,
        participants: doc.participants,
        bans: doc.bans,
      };
    }
  } else {
    for await (const match of store.iterateMatches()) {
      if (!match.info) continue;
      yield {
        queueId: match.info.queueId,
        gameVersion: match.info.gameVersion,
        participants: match.info.participants.map((p) => ({
          championName: p.championName,
          teamPosition: p.teamPosition,
          win: p.win,
        })),
        bans: match.info.teams.flatMap((t) => t.bans.map((b) => ({ championId: b.championId }))),
      };
    }
  }
}

export async function aggregate(opts: AggregateOptions): Promise<void> {
  resolveRegion(opts.region); // valida la región
  const store = new Store(opts.region);

  let mongoClient: MongoClient | undefined;
  let mongoStore: MongoStore | undefined;
  if (opts.mongoUri) {
    mongoClient = new MongoClient(opts.mongoUri);
    await mongoClient.connect();
    mongoStore = new MongoStore(mongoClient, opts.region);
  }

  try {
    await _aggregate(opts, store, mongoStore);
  } finally {
    await mongoClient?.close();
  }
}

async function _aggregate(
  opts: AggregateOptions,
  store: Store,
  mongoStore: MongoStore | undefined,
): Promise<void> {
  const champMap = await loadChampionMap();

  // Acumuladores
  const roleAcc = new Map<string, RoleAcc>(); // clave: champ|role
  const banCount = new Map<string, number>(); // clave: champ
  const patchDist = new Map<string, number>();
  let totalGames = 0;
  let skippedQueue = 0;
  let skippedPatch = 0;

  for await (const match of matchSource(store, mongoStore)) {
    if (match.queueId !== RANKED_SOLO_QUEUE_ID) {
      skippedQueue++;
      continue;
    }
    const patch = patchOf(match.gameVersion);
    patchDist.set(patch, (patchDist.get(patch) ?? 0) + 1);
    if (opts.patch && patch !== opts.patch) {
      skippedPatch++;
      continue;
    }

    totalGames++;

    // Picks: win rate y pick rate por (campeón, rol)
    for (const p of match.participants) {
      if (!VALID_ROLES.has(p.teamPosition)) continue; // remakes / sin rol
      const key = `${p.championName}|${p.teamPosition}`;
      const acc = roleAcc.get(key) ?? { games: 0, wins: 0 };
      acc.games++;
      if (p.win) acc.wins++;
      roleAcc.set(key, acc);
    }

    // Bans: ban rate por campeón (deduplicado dentro de la partida)
    const bannedThisGame = new Set<string>();
    for (const ban of match.bans) {
      if (ban.championId < 0) continue; // -1 = sin baneo
      const name = champMap.byNumericId.get(ban.championId);
      if (name) bannedThisGame.add(name);
    }
    for (const name of bannedThisGame) {
      banCount.set(name, (banCount.get(name) ?? 0) + 1);
    }
  }

  if (totalGames === 0) {
    log.warn('No hay partidas que agregar (¿ya ejecutaste "collect"?).');
    return;
  }

  // Construir filas
  const rows: ChampionRoleStat[] = [];
  for (const [key, acc] of roleAcc) {
    const [championId, role] = key.split('|');
    rows.push({
      championId,
      role,
      winRate: Number((acc.wins / acc.games).toFixed(4)),
      pickRate: Number((acc.games / totalGames).toFixed(4)),
      banRate: Number(((banCount.get(championId) ?? 0) / totalGames).toFixed(4)),
      games: acc.games,
    });
  }
  rows.sort((a, b) =>
    a.role === b.role ? b.games - a.games : a.role.localeCompare(b.role),
  );

  // Salida 1: JSON limpio (filtrado por min-games), listo para el StatsProvider
  const clean = rows.filter((r) => r.games >= opts.minGames);
  const jsonOut = {
    region: opts.region,
    ddragonVersion: champMap.version,
    patchFilter: opts.patch ?? 'all',
    totalGames,
    minGames: opts.minGames,
    rows: clean,
  };
  const jsonPath = path.join(store.dir, 'champion-stats.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));

  // Salida 2: CSV completo (todas las filas) para abrir en Excel / importar a SQLite
  const header = 'championId,role,games,winRate,pickRate,banRate\n';
  const csv =
    header +
    rows
      .map(
        (r) =>
          `${r.championId},${r.role},${r.games},${r.winRate},${r.pickRate},${r.banRate}`,
      )
      .join('\n') +
    '\n';
  const csvPath = path.join(store.dir, 'champion-stats.csv');
  fs.writeFileSync(csvPath, csv);

  // Reporte
  log.info(`Partidas agregadas: ${totalGames} (cola ${RANKED_SOLO_QUEUE_ID}).`);
  if (skippedQueue) log.info(`Omitidas por cola distinta: ${skippedQueue}.`);
  if (skippedPatch) log.info(`Omitidas por parche distinto: ${skippedPatch}.`);
  const dist = [...patchDist.entries()].sort((a, b) => b[1] - a[1]);
  log.info('Distribución por parche: ' + dist.map(([p, n]) => `${p}=${n}`).join('  '));
  log.info(`Filas totales: ${rows.length}. En JSON (>=${opts.minGames} juegos): ${clean.length}.`);
  log.info(`JSON: ${jsonPath}`);
  log.info(`CSV:  ${csvPath}`);
}
