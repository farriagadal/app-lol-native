import { RiotClient } from './riotClient';
import { Store } from './store';
import { log } from './log';
import {
  resolveRegion,
  RANKED_SOLO_QUEUE_NAME,
  RANKED_SOLO_QUEUE_ID,
  APEX_TIERS,
  STANDARD_TIERS,
  DIVISIONS,
} from './config';
import type {
  LeagueListDTO,
  LeagueEntryDTO,
  SummonerDTO,
  MatchDTO,
} from './riotTypes';

export interface CollectOptions {
  region: string;
  /** API key de Riot (RGAPI-...). */
  apiKey: string;
  /** Corta cuando se han guardado en total este nº de partidas. */
  maxMatches: number;
  /** Nº de IDs de partida recientes a pedir por jugador (máx 100). */
  matchesPerPlayer: number;
  /** Tope de jugadores a muestrear por cada "bucket" de liga. */
  maxPlayersPerBucket: number;
  /** Callback de progreso (para mostrarlo en la UI). */
  onProgress?: (p: { collected: number; target: number; bucket?: string }) => void;
}

interface Bucket {
  name: string;
  apex?: 'challengerleagues' | 'grandmasterleagues' | 'masterleagues';
  tier?: string;
  division?: string;
}

/** Lista de buckets a recorrer: apex (3) + cada tier/división estándar. */
function buildBuckets(): Bucket[] {
  const buckets: Bucket[] = [];
  for (const apex of APEX_TIERS) {
    const endpoint =
      apex === 'CHALLENGER'
        ? 'challengerleagues'
        : apex === 'GRANDMASTER'
          ? 'grandmasterleagues'
          : 'masterleagues';
    buckets.push({ name: apex, apex: endpoint as Bucket['apex'] });
  }
  for (const tier of STANDARD_TIERS) {
    for (const division of DIVISIONS) {
      buckets.push({ name: `${tier} ${division}`, tier, division });
    }
  }
  return buckets;
}

export async function collect(opts: CollectOptions): Promise<{ collected: number }> {
  const region = resolveRegion(opts.region);
  const client = new RiotClient(opts.apiKey);
  const store = new Store(opts.region);

  const seenMatches = store.loadSeenMatches();
  const seenPlayers = store.loadSeenPlayers();
  let collected = seenMatches.size;
  let missingPuuid = 0;

  log.info(
    `Región ${region.label} (${region.platform}/${region.regional}). ` +
      `Ya guardadas: ${collected}. Objetivo: ${opts.maxMatches}.`,
  );
  if (collected >= opts.maxMatches) {
    log.info('Ya se alcanzó el objetivo. Nada que hacer (sube --max para más).');
    return { collected };
  }

  /** Resuelve el puuid de una entrada de liga (directo o vía SUMMONER-V4). */
  // Forma estructural común a LeagueItemDTO (apex) y LeagueEntryDTO (estándar).
  const puuidOf = async (e: {
    puuid?: string;
    summonerId?: string;
  }): Promise<string | null> => {
    if (e.puuid) return e.puuid;
    if (e.summonerId) {
      const s = await client.get<SummonerDTO>(
        region.platform,
        `/lol/summoner/v4/summoners/${encodeURIComponent(e.summonerId)}`,
      );
      return s?.puuid ?? null;
    }
    missingPuuid++;
    return null;
  };

  /** Devuelve hasta `cap` puuids de un bucket. */
  const puuidsForBucket = async (b: Bucket, cap: number): Promise<string[]> => {
    const out: string[] = [];
    if (b.apex) {
      const list = await client.get<LeagueListDTO>(
        region.platform,
        `/lol/league/v4/${b.apex}/by-queue/${RANKED_SOLO_QUEUE_NAME}`,
      );
      const entries = list?.entries ?? [];
      for (const e of entries) {
        if (out.length >= cap) break;
        const p = await puuidOf(e);
        if (p) out.push(p);
      }
    } else if (b.tier && b.division) {
      let page = 1;
      while (out.length < cap) {
        const entries = await client.get<LeagueEntryDTO[]>(
          region.platform,
          `/lol/league/v4/entries/${RANKED_SOLO_QUEUE_NAME}/${b.tier}/${b.division}?page=${page}`,
        );
        if (!entries || entries.length === 0) break; // fin de la paginación
        for (const e of entries) {
          if (out.length >= cap) break;
          const p = await puuidOf(e);
          if (p) out.push(p);
        }
        page++;
      }
    }
    return out;
  };

  const buckets = buildBuckets();

  for (const bucket of buckets) {
    if (collected >= opts.maxMatches) break;
    const puuids = await puuidsForBucket(bucket, opts.maxPlayersPerBucket);
    log.info(`Bucket ${bucket.name}: ${puuids.length} jugadores.`);
    opts.onProgress?.({ collected, target: opts.maxMatches, bucket: bucket.name });

    for (const puuid of puuids) {
      if (collected >= opts.maxMatches) break;
      if (seenPlayers.has(puuid)) continue;

      const ids = await client.get<string[]>(
        region.regional,
        `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids` +
          `?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=0&count=${opts.matchesPerPlayer}`,
      );

      for (const id of ids ?? []) {
        if (collected >= opts.maxMatches) break;
        if (seenMatches.has(id)) continue;

        const match = await client.get<MatchDTO>(
          region.regional,
          `/lol/match/v5/matches/${encodeURIComponent(id)}`,
        );
        if (!match) continue;

        store.appendMatch(match);
        seenMatches.add(id);
        collected++;
        if (collected % 10 === 0) {
          opts.onProgress?.({ collected, target: opts.maxMatches, bucket: bucket.name });
        }
        if (collected % 50 === 0) {
          log.info(`Progreso: ${collected}/${opts.maxMatches} partidas.`);
        }
      }

      store.markPlayerSeen(puuid);
      seenPlayers.add(puuid);
    }
  }

  if (missingPuuid > 0) {
    log.warn(`${missingPuuid} entradas de liga sin puuid resoluble (omitidas).`);
  }
  log.info(`Listo. Total partidas guardadas: ${collected}.`);
  log.info(`Datos en: ${store.matchesFile}`);
  return { collected };
}
