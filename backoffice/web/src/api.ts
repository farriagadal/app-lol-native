/** Cliente de los endpoints /api/* del back office. Portado de app.js. */
import type {
  AnalyticsMeta,
  ChampionStatRow,
  CollectStatus,
  ItemGamesResponse,
  KnowledgeNetwork,
  MatchListResponse,
  PlayerGamesResponse,
  MatchDetail,
  ProfileData,
  RecommendGamesResponse,
  RecommendResponse,
  StatFilter,
  StreaksResponse,
} from '@ui';

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v!))}`)
    .join('&');

/** Páginas de stats que comparten la forma StatFilter. */
export type StatsPage = 'items' | 'runes' | 'spells' | 'players' | 'counters' | 'synergy';

export interface RegionsResponse {
  dataRegions: string[];
  servers: { key: string; label: string }[];
}

export const api = {
  regions: (): Promise<RegionsResponse> => fetch('/api/regions').then((r) => r.json()),

  meta: (region: string): Promise<AnalyticsMeta> =>
    fetch('/api/meta?' + qs({ region: region || '' })).then((r) => r.json()),

  champions: (region: string, patch: string, tier: string, dateFrom?: string, dateTo?: string): Promise<ChampionStatRow[]> =>
    fetch('/api/champions?' + qs({ region, patch, tier, dateFrom, dateTo })).then((r) => r.json()),

  status: (region: string): Promise<CollectStatus> =>
    fetch('/api/status?' + qs({ region })).then((r) => r.json()),

  // Devuelve filas crudas; el tipo concreto depende de la página (lo afina el llamador).
  stats: <T = unknown>(page: StatsPage, region: string, f: StatFilter): Promise<T[]> =>
    fetch(
      `/api/${page}?` +
        qs({ region, patch: f.patch, tier: f.tier, role: f.role, champion: f.champion, dateFrom: f.dateFrom, dateTo: f.dateTo }),
    ).then((r) => r.json()),

  itemGames: (
    region: string,
    item: number,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<ItemGamesResponse> =>
    fetch(
      '/api/item-games?' +
        qs({
          region,
          item,
          patch: f.patch,
          tier: f.tier,
          role: f.role,
          champion: f.champion,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          limit,
          offset,
        }),
    ).then((r) => r.json()),

  streaks: (
    region: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<StreaksResponse> =>
    fetch(
      '/api/streaks?' +
        qs({
          region,
          patch: f.patch,
          tier: f.tier,
          role: f.role,
          champion: f.champion,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          limit,
          offset,
        }),
    ).then((r) => r.json()),

  playerGames: (
    region: string,
    puuid: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<PlayerGamesResponse> =>
    fetch(
      '/api/player-games?' +
        qs({
          region,
          puuid,
          patch: f.patch,
          tier: f.tier,
          role: f.role,
          champion: f.champion,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          limit,
          offset,
        }),
    ).then((r) => r.json()),

  recommend: (
    region: string,
    myChamps: string[],
    enemies: string[],
    allies: string[],
    role: string,
    f: Pick<StatFilter, 'patch' | 'tier' | 'dateFrom' | 'dateTo'>,
  ): Promise<RecommendResponse> =>
    fetch(
      '/api/recommend?' +
        qs({
          region,
          myChamps: myChamps.join(','),
          enemies: enemies.join(','),
          allies: allies.join(','),
          role,
          patch: f.patch,
          tier: f.tier,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
        }),
    ).then((r) => r.json()),

  // Partidas individuales detrás de un win rate de recommend ("+ Detalle")
  recommendGames: (
    region: string,
    champion: string,
    enemies: string[],
    allies: string[],
    role: string,
    f: Pick<StatFilter, 'patch' | 'tier' | 'dateFrom' | 'dateTo'>,
    limit = 20,
  ): Promise<RecommendGamesResponse> =>
    fetch(
      '/api/recommend-games?' +
        qs({
          region,
          champion,
          enemies: enemies.join(','),
          allies: allies.join(','),
          role,
          patch: f.patch,
          tier: f.tier,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          limit,
        }),
    ).then((r) => r.json()),

  games: (
    region: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<MatchListResponse> =>
    fetch(
      '/api/games?' +
        qs({
          region,
          patch: f.patch,
          tier: f.tier,
          role: f.role,
          champion: f.champion,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          limit,
          offset,
        }),
    ).then((r) => r.json()),

  match: (region: string, matchId: string): Promise<MatchDetail> =>
    fetch('/api/match?' + qs({ region, matchId })).then((r) => r.json()),

  collect: (req: unknown): Promise<Response> =>
    fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),

  collectHistory: (): Promise<{ region: string; totalGames: number; totalParticipants: number; patches: string[] }[]> =>
    fetch('/api/collect-history').then((r) => r.json()),

  collectPlayer: (req: { apiKey: string; riotId: string; limit: number; region?: string }): Promise<Response> =>
    fetch('/api/collect-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),

  collectPlayerStatus: (): Promise<{ phase: string; riotId?: string; downloaded?: number; skipped?: number; total?: number; error?: string }> =>
    fetch('/api/collect-player/status').then((r) => r.json()),

  knowledgeGet: (): Promise<KnowledgeNetwork> =>
    fetch('/api/knowledge').then((r) => r.json()),

  knowledgeSave: (net: KnowledgeNetwork): Promise<{ ok: true }> =>
    fetch('/api/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(net),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    }),

  // Recolección efímera para la página Perfil: la respuesta va directo al
  // navegador y no se persiste en el servidor.
  profileMatches: (req: { apiKey: string; riotId: string; limit: number; region: string }): Promise<ProfileData> =>
    fetch('/api/profile-matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    }),
};
