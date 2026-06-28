/**
 * Descarga las partidas ranked de un jugador específico (por Riot ID)
 * y las agrega al store + DB existentes.
 */
import { RiotClient } from '../collector/riotClient';
import { Store } from '../collector/store';
import { buildDb } from './buildDb';
import { REGIONS } from '../collector/config';
import type { MatchDTO } from '../collector/riotTypes';

// Construir mapa region → routing regional desde la config existente
const PLATFORM_TO_REGIONAL: Record<string, string> = Object.fromEntries(
  Object.entries(REGIONS).map(([k, v]) => [k.toUpperCase(), v.regional]),
);

export interface PlayerCollectProgress {
  phase: 'idle' | 'resolving' | 'fetching-ids' | 'downloading' | 'building-db' | 'done' | 'error';
  riotId: string;
  region: string;
  downloaded: number;
  skipped: number;
  total: number;
  error?: string;
}

export async function collectPlayer(
  region: string,
  apiKey: string,
  riotId: string,
  limit: number,
  dataDir: string,
  onProgress: (p: PlayerCollectProgress) => void,
): Promise<void> {
  const parts = riotId.split('#');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Formato inválido. Usa "NombreJugador#TAG" (ej. Faker#KR1)');
  }
  const [gameName, tagLine] = parts;
  const platform = region.toUpperCase();
  const regional = PLATFORM_TO_REGIONAL[platform];
  if (!regional) throw new Error(`Región no soportada: ${region}`);

  const client = new RiotClient(apiKey);
  const store = new Store(region.toLowerCase());
  const base: Omit<PlayerCollectProgress, 'phase'> = { riotId, region, downloaded: 0, skipped: 0, total: 0 };

  // 1. Resolver PUUID desde Riot ID
  onProgress({ ...base, phase: 'resolving' });
  const account = await client.get<{ puuid: string }>(
    regional,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  if (!account) throw new Error(`Jugador "${riotId}" no encontrado en la región ${region}.`);

  // 2. Obtener IDs de partidas ranked
  onProgress({ ...base, phase: 'fetching-ids' });
  const matchIds = await client.get<string[]>(
    regional,
    `/lol/match/v5/matches/by-puuid/${account.puuid}/ids?queue=420&type=ranked&start=0&count=${limit}`,
  );
  if (!matchIds?.length) {
    onProgress({ ...base, phase: 'done' });
    return;
  }

  const seenMatches = store.loadSeenMatches();
  const toDownload = matchIds.filter((id) => !seenMatches.has(id));
  const skipped = matchIds.length - toDownload.length;

  if (!toDownload.length) {
    onProgress({ ...base, phase: 'done', skipped, total: matchIds.length });
    return;
  }

  // 3. Descargar partidas nuevas
  let downloaded = 0;
  onProgress({ ...base, phase: 'downloading', downloaded: 0, skipped, total: toDownload.length });

  for (const matchId of toDownload) {
    const match = await client.get<MatchDTO>(regional, `/lol/match/v5/matches/${matchId}`);
    if (match) {
      store.appendMatch(match);
      downloaded++;
    }
    onProgress({ ...base, phase: 'downloading', downloaded, skipped, total: toDownload.length });
  }

  // 4. Reconstruir DB
  if (downloaded > 0) {
    onProgress({ ...base, phase: 'building-db', downloaded, skipped, total: toDownload.length });
    await buildDb(region.toLowerCase(), dataDir);
  }

  onProgress({ ...base, phase: 'done', downloaded, skipped, total: toDownload.length });
}
