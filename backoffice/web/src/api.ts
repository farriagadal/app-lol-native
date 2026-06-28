/** Cliente de los endpoints /api/* del back office. Portado de app.js. */
import type {
  AnalyticsMeta,
  ChampionStatRow,
  CollectStatus,
  ItemGamesResponse,
  MatchDetail,
  StatFilter,
} from '@ui';

const qs = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
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

  champions: (region: string, patch: string, tier: string): Promise<ChampionStatRow[]> =>
    fetch('/api/champions?' + qs({ region, patch, tier })).then((r) => r.json()),

  status: (region: string): Promise<CollectStatus> =>
    fetch('/api/status?' + qs({ region })).then((r) => r.json()),

  // Devuelve filas crudas; el tipo concreto depende de la página (lo afina el llamador).
  stats: <T = unknown>(page: StatsPage, region: string, f: StatFilter): Promise<T[]> =>
    fetch(
      `/api/${page}?` +
        qs({ region, patch: f.patch, tier: f.tier, role: f.role, champion: f.champion }),
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
          limit,
          offset,
        }),
    ).then((r) => r.json()),

  match: (region: string, matchId: string): Promise<MatchDetail> =>
    fetch('/api/match?' + qs({ region, matchId })).then((r) => r.json()),

  collect: (req: unknown): Promise<Response> =>
    fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
};
