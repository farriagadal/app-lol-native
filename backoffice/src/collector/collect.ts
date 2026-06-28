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
  /** Tiers (rangos) a recolectar; vacío/ausente = todos. */
  tiers?: string[];
  /** Época (segundos) desde la que pedir partidas (parámetro startTime de Riot). */
  startTime?: number;
  /** Época (segundos) hasta la que pedir partidas (parámetro endTime de Riot). */
  endTime?: number;
  /** Callback de progreso (para mostrarlo en la UI). */
  onProgress?: (p: { collected: number; target: number; bucket?: string }) => void;
}

interface Bucket {
  name: string;
  tier: string; // CHALLENGER..IRON (rango con el que se etiquetan sus partidas)
  apex?: 'challengerleagues' | 'grandmasterleagues' | 'masterleagues';
  division?: string;
}

/** Lista de buckets a recorrer: apex (3) + cada tier/división estándar. */
function buildBuckets(allowed: Set<string> | null): Bucket[] {
  const want = (t: string): boolean => !allowed || allowed.has(t);
  const buckets: Bucket[] = [];
  for (const apex of APEX_TIERS) {
    if (!want(apex)) continue;
    const endpoint =
      apex === 'CHALLENGER'
        ? 'challengerleagues'
        : apex === 'GRANDMASTER'
          ? 'grandmasterleagues'
          : 'masterleagues';
    buckets.push({ name: apex, tier: apex, apex: endpoint as Bucket['apex'] });
  }
  for (const tier of STANDARD_TIERS) {
    if (!want(tier)) continue;
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

  /** Generador de puuids de un tier: recorre sus buckets (apex o divisiones)
   *  paginando, hasta `cap` jugadores por bucket. Yield perezoso para round-robin. */
  async function* playersOfTier(tierBuckets: Bucket[], cap: number): AsyncGenerator<string> {
    for (const b of tierBuckets) {
      let count = 0;
      if (b.apex) {
        const list = await client.get<LeagueListDTO>(
          region.platform,
          `/lol/league/v4/${b.apex}/by-queue/${RANKED_SOLO_QUEUE_NAME}`,
        );
        for (const e of list?.entries ?? []) {
          if (count >= cap) break;
          const p = await puuidOf(e);
          if (p) {
            count++;
            yield p;
          }
        }
      } else if (b.division) {
        let page = 1;
        while (count < cap) {
          const entries = await client.get<LeagueEntryDTO[]>(
            region.platform,
            `/lol/league/v4/entries/${RANKED_SOLO_QUEUE_NAME}/${b.tier}/${b.division}?page=${page}`,
          );
          if (!entries || entries.length === 0) break;
          for (const e of entries) {
            if (count >= cap) break;
            const p = await puuidOf(e);
            if (p) {
              count++;
              yield p;
            }
          }
          page++;
        }
      }
    }
  }

  // Circuito de tolerancia a fallos: aguanta fallos aislados (una partida rara,
  // un timeout puntual) pero corta si hay demasiados seguidos (API caída/saturada)
  // o si es un error de autenticación. Lo recolectado queda en disco para reanudar.
  const MAX_CONSECUTIVE_FAILURES = 6;
  let consecutiveFailures = 0;
  const noteFailure = (where: string, err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b40[13]\b/.test(msg)) {
      throw new Error(`Recolección detenida (autenticación): ${msg}`);
    }
    consecutiveFailures++;
    log.warn(`Fallo en ${where}: ${msg} (${consecutiveFailures} seguidos)`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error(
        `Cortada tras ${consecutiveFailures} fallos seguidos (¿API caída o saturada?). ` +
          `Lo recolectado queda guardado; vuelve a pulsar Recolectar para continuar. Último: ${msg}`,
      );
    }
  };

  const allowedTiers = opts.tiers && opts.tiers.length ? new Set(opts.tiers) : null;
  const buckets = buildBuckets(allowedTiers);

  // Agrupar buckets por rango, preservando el orden de aparición.
  const tierOrder: string[] = [];
  const bucketsByTier = new Map<string, Bucket[]>();
  for (const b of buckets) {
    if (!bucketsByTier.has(b.tier)) {
      bucketsByTier.set(b.tier, []);
      tierOrder.push(b.tier);
    }
    bucketsByTier.get(b.tier)!.push(b);
  }

  // Cuota EQUITATIVA por rango. Al reanudar parte de lo ya recolectado por tier,
  // así el reparto se mantiene parejo entre ejecuciones.
  const perTierTarget = Math.max(1, Math.ceil(opts.maxMatches / Math.max(1, tierOrder.length)));
  const tierCollected = store.loadTierCounts();
  for (const t of tierOrder) if (!tierCollected.has(t)) tierCollected.set(t, 0);

  const gens = new Map(
    tierOrder.map((t) => [t, playersOfTier(bucketsByTier.get(t)!, opts.maxPlayersPerBucket)]),
  );
  const exhausted = new Set<string>();
  const tierDone = (t: string): boolean =>
    exhausted.has(t) || (tierCollected.get(t) ?? 0) >= perTierTarget;

  log.info(`Round-robin por rango: ${tierOrder.length} tier(s), cuota ${perTierTarget} c/u.`);

  // Round-robin: en cada vuelta se procesa un jugador de cada rango que aún no
  // llegó a su cuota. Así el dataset queda balanceado aunque se corte a mitad.
  while (collected < opts.maxMatches && tierOrder.some((t) => !tierDone(t))) {
    for (const tier of tierOrder) {
      if (collected >= opts.maxMatches) break;
      if (tierDone(tier)) continue;

      const next = await gens.get(tier)!.next();
      if (next.done) {
        exhausted.add(tier); // sin más jugadores en este rango
        continue;
      }
      const puuid = next.value;
      if (seenPlayers.has(puuid)) continue;

      let ids: string[] | null;
      try {
        const timeParams =
          (opts.startTime ? `&startTime=${opts.startTime}` : '') +
          (opts.endTime ? `&endTime=${opts.endTime}` : '');
        ids = await client.get<string[]>(
          region.regional,
          `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids` +
            `?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=0&count=${opts.matchesPerPlayer}${timeParams}`,
        );
        consecutiveFailures = 0;
      } catch (err) {
        noteFailure('IDs de partida de un jugador', err);
        continue;
      }

      for (const id of ids ?? []) {
        if (collected >= opts.maxMatches) break;
        if ((tierCollected.get(tier) ?? 0) >= perTierTarget) break; // cuota del rango alcanzada
        if (seenMatches.has(id)) continue;

        let match: MatchDTO | null;
        try {
          match = await client.get<MatchDTO>(
            region.regional,
            `/lol/match/v5/matches/${encodeURIComponent(id)}`,
          );
          consecutiveFailures = 0;
        } catch (err) {
          noteFailure(`detalle de la partida ${id}`, err);
          continue;
        }
        if (!match) continue;

        store.appendMatch(match);
        store.appendMatchTier(id, tier); // etiqueta la partida con su rango
        seenMatches.add(id);
        collected++;
        tierCollected.set(tier, (tierCollected.get(tier) ?? 0) + 1);
        if (collected % 10 === 0) {
          opts.onProgress?.({ collected, target: opts.maxMatches, bucket: tier });
        }
        if (collected % 50 === 0) {
          log.info(`Progreso: ${collected}/${opts.maxMatches} · ${tier}=${tierCollected.get(tier)}/${perTierTarget}`);
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
