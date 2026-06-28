/** Vista de jugador: historial de partidas guardadas + link a OP.GG. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BuildRow,
  ChampionIcon,
  KDA,
  RoleIcon,
  RuneIcons,
  Scoreboard,
  SpellPair,
  ROLE_LABEL,
  type ItemStatRow,
  type ItemGameRow,
  type PlayerGamesResponse,
  type MatchDetail,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { opggUrl } from '../opgg';
import { watchReplay } from '../downloadReplay';

const PAGE = 50;
const matchCache = new Map<string, MatchDetail>();

function cmpPatch(a: string, b: string): number {
  const [aMaj = 0, aMin = 0] = a.split('.').map(Number);
  const [bMaj = 0, bMin = 0] = b.split('.').map(Number);
  return aMaj !== bMaj ? aMaj - bMaj : aMin - bMin;
}
function newestPatch(patches: (string | null)[]): string | null {
  return patches.reduce<string | null>((best, p) => {
    if (!p) return best;
    if (!best) return p;
    return cmpPatch(p, best) > 0 ? p : best;
  }, null);
}

function GameRow({ g, region, showReplay, itemStats }: { g: ItemGameRow; region: string; showReplay: boolean; itemStats: Map<number, ItemStatRow> }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (detail || loadError) return;
    const cached = matchCache.get(g.matchId);
    if (cached) { setDetail(cached); return; }
    try {
      const data = await api.match(region, g.matchId);
      if (data && !(data as { error?: string }).error) {
        matchCache.set(g.matchId, data);
        setDetail(data);
      } else { setLoadError(true); }
    } catch { setLoadError(true); }
  };

  return (
    <>
      <tr className={`ig-row ${g.win ? 'win' : 'lose'}`} onClick={toggle}>
        <td className="ig-caret"><span className="caret">{open ? '▾' : '▸'}</span></td>
        <td>
          <span className="cell-ico">
            <ChampionIcon name={g.championName} lazy />
            <span>{g.championName}</span>
          </span>
        </td>
        <td className="role-cell">
          <RoleIcon role={g.role} className="role-ic" />
          <span>{ROLE_LABEL[g.role] || g.role || '—'}</span>
        </td>
        <td><KDA k={g.kills} d={g.deaths} a={g.assists} kda={g.kda} /></td>
        <td className="num">{g.cs}</td>
        <td><SpellPair s1={g.summoner1} s2={g.summoner2} /></td>
        <td><RuneIcons keystone={g.keystone} sub={g.subStyle} /></td>
        <td><BuildRow items={g.items} withTrinket itemStats={itemStats} /></td>
        <td className="num">{g.patch ?? '—'}</td>
        <td className="num">{new Date(g.gameCreation).toLocaleDateString('es-CL')}</td>
        <td>
          <span className={`result ${g.win ? 'win' : 'lose'}`}>{g.win ? 'Victoria' : 'Derrota'}</span>
          {showReplay && (
            <button
              className="dl-btn"
              title="Reproducir replay en el cliente de LoL"
              disabled={downloading}
              onClick={(e) => { e.stopPropagation(); void watchReplay(g.matchId, setDownloading); }}
            >{downloading ? '…' : '▶'}</button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="game-detail">
          <td colSpan={11}>
            <div className="detail-scroll">
              {loadError ? (
                <div className="empty">Error al cargar la partida.</div>
              ) : detail ? (
                <Scoreboard match={detail} playerHref={(id) => opggUrl(id, region)} />
              ) : (
                <div className="empty">Cargando partida…</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PlayerView() {
  const { puuid = '' } = useParams();
  const s = useStore();
  const [resp, setResp] = useState<PlayerGamesResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [itemStatsMap, setItemStatsMap] = useState<Map<number, ItemStatRow>>(new Map());

  useEffect(() => { setOffset(0); }, [puuid, s.region, s.patch, s.tier, s.role, s.dateFrom, s.dateTo]);

  useEffect(() => {
    let cancel = false;
    if (!s.region || !puuid) { setResp(null); setLoading(false); return; }
    setLoading(true);
    api.playerGames(s.region, decodeURIComponent(puuid), s.statFilter('all'), PAGE, offset)
      .then((r) => { if (!cancel) { setResp(r); setLoading(false); } })
      .catch(() => { if (!cancel) { setResp(null); setLoading(false); } });
    return () => { cancel = true; };
  }, [puuid, s.region, s.patch, s.tier, s.role, s.dateFrom, s.dateTo, offset]);

  useEffect(() => {
    if (!s.region) { setItemStatsMap(new Map()); return; }
    api.stats<ItemStatRow>('items', s.region, s.statFilter('all'))
      .then((rows) => {
        const m = new Map<number, ItemStatRow>();
        for (const r of rows) m.set(r.item, r);
        setItemStatsMap(m);
      })
      .catch(() => {});
  }, [s.region, s.patch, s.tier, s.role, s.dateFrom, s.dateTo]);

  const total = resp?.total ?? 0;
  const games = resp?.games ?? [];
  const riotId = resp?.riotId ?? null;
  const newest = newestPatch(games.map((g) => g.patch));

  const wins = games.filter((g) => g.win).length;
  const winRatePct = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;
  const avgKda = games.length > 0
    ? (games.reduce((s, g) => s + g.kda, 0) / games.length).toFixed(2)
    : '—';

  return (
    <section>
      <div className="cv-header">
        <div className="player-avatar">
          <span className="player-avatar-icon">👤</span>
        </div>
        <div style={{ flex: 1 }}>
          <div className="name">{riotId ?? (puuid ? puuid.slice(0, 20) + '…' : '—')}</div>
          <div className="meta">
            {total > 0
              ? `${total} partidas guardadas · ${winRatePct}% victorias · KDA prom. ${avgKda}`
              : 'Sin partidas para el filtro actual'}
          </div>
        </div>
        {riotId && s.region && (
          <a
            className="opgg-btn"
            href={opggUrl(riotId, s.region)}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver en OP.GG"
          >
            <img
              className="opgg-favicon"
              src="https://www.op.gg/favicon.ico"
              alt="OP.GG"
              width={16}
              height={16}
            />
            Ver en OP.GG
          </a>
        )}
      </div>

      <div className="table-host">
        {!s.region ? (
          <div className="empty">No hay datos. Recolecta primero.</div>
        ) : loading ? (
          <div className="empty">Cargando…</div>
        ) : !games.length ? (
          <div className="empty">Sin partidas guardadas para este jugador con el filtro actual.</div>
        ) : (
          <table className="ig-table">
            <thead>
              <tr>
                <th className="ig-caret" />
                <th>Campeón</th>
                <th>Rol</th>
                <th>KDA</th>
                <th>CS</th>
                <th>Hechizos</th>
                <th>Runas</th>
                <th>Build</th>
                <th>Parche</th>
                <th>Fecha</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <GameRow key={g.matchId} g={g} region={s.region} showReplay={g.patch === newest} itemStats={itemStatsMap} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE && (
        <div className="iv-pager">
          <button
            className="pager-btn"
            disabled={offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            ← Anterior
          </button>
          <span className="pager-info">
            {offset + 1}–{Math.min(offset + PAGE, total)} de {total}
          </span>
          <button
            className="pager-btn"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </section>
  );
}
