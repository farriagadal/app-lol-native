/**
 * Recolección EFÍMERA de las partidas ranked de un jugador (por Riot ID):
 * descarga desde la API de Riot y devuelve un shape reducido al navegador.
 * No escribe en el store ni reconstruye la DB — las partidas del perfil
 * viven solo en el localStorage del cliente y nunca se mezclan con los análisis.
 *
 * Los tipos Profile* tienen su espejo en ui/src/domain/types.ts (server y web
 * no comparten tsconfig).
 */
import { RiotClient } from '../collector/riotClient';
import { PLATFORM_TO_REGIONAL } from './playerCollector';
import type { MatchDTO } from '../collector/riotTypes';

export interface ProfileParticipant {
  championName: string;
  teamId: number;
  win: boolean;
  teamPosition: string;
  /** Marca al dueño del perfil; se omite en el resto para ahorrar espacio. */
  me?: true;
}

export interface ProfileMatch {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  gameVersion: string;
  participants: ProfileParticipant[];
}

export interface ProfileMatchesResult {
  riotId: string;
  region: string;
  puuid: string;
  fetchedAt: number;
  matches: ProfileMatch[];
}

/** Retorna null si el jugador no existe en esa región. */
export async function fetchProfileMatches(
  apiKey: string,
  riotId: string,
  limit: number,
  region: string,
): Promise<ProfileMatchesResult | null> {
  const parts = riotId.split('#');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Formato inválido. Usa "NombreJugador#TAG" (ej. Faker#KR1)');
  }
  const [gameName, tagLine] = parts;
  const regional = PLATFORM_TO_REGIONAL[region.toUpperCase()];
  if (!regional) throw new Error(`Región no soportada: ${region}`);

  const client = new RiotClient(apiKey);

  const account = await client.get<{ puuid: string }>(
    regional,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  if (!account) return null;

  const matchIds = await client.get<string[]>(
    regional,
    `/lol/match/v5/matches/by-puuid/${account.puuid}/ids?queue=420&type=ranked&start=0&count=${limit}`,
  );

  const matches: ProfileMatch[] = [];
  for (const matchId of matchIds ?? []) {
    const match = await client.get<MatchDTO>(regional, `/lol/match/v5/matches/${matchId}`);
    if (!match) continue;
    matches.push({
      matchId: match.metadata.matchId,
      gameCreation: match.info.gameCreation,
      gameDuration: match.info.gameDuration,
      gameVersion: match.info.gameVersion,
      participants: match.info.participants.map((p) => ({
        championName: p.championName,
        teamId: p.teamId,
        win: p.win,
        teamPosition: p.teamPosition,
        ...(p.puuid === account.puuid ? { me: true as const } : {}),
      })),
    });
  }

  return {
    riotId,
    region: region.toLowerCase(),
    puuid: account.puuid,
    fetchedAt: Date.now(),
    matches,
  };
}
