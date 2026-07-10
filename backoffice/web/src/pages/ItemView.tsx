/**
 * Detalle de ítem: partidas en las que se usó, con paginador y filas que se
 * expanden mostrando el scoreboard completo (cargado bajo demanda). Portado de
 * loadItemView/renderItemGames/toggleGameRow del app.js.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AssetImg,
  BuildRow,
  ChampionIcon,
  KDA,
  RoleIcon,
  RuneIcons,
  Scoreboard,
  SpellPair,
  useAssets,
  ROLE_LABEL,
  TIER_LABEL,
  type ItemStatRow,
  type ItemGameRow,
  type ItemGamesResponse,
  type MatchDetail,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { champHref, playerHref, ChampLink } from '../components/links';
import { watchReplay } from '../downloadReplay';

const ITEM_PAGE = 50;
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

function GameRow({ g, region, item, showReplay, itemStats }: { g: ItemGameRow; region: string; item: number; showReplay: boolean; itemStats: Map<number, ItemStatRow> }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail || error) return;
    const cached = matchCache.get(g.matchId);
    if (cached) {
      setDetail(cached);
      return;
    }
    try {
      const data = await api.match(region, g.matchId);
      if (data && !(data as { error?: string }).error) {
        matchCache.set(g.matchId, data);
        setDetail(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <tr className={`ig-row ${g.win ? 'win' : 'lose'}`} onClick={toggle}>
        <td className="ig-caret">
          <span className="caret">{open ? '▾' : '▸'}</span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <ChampLink name={g.championName} className="cell-ico">
            <ChampionIcon name={g.championName} lazy />
            <span>{g.championName}</span>
          </ChampLink>
        </td>
        <td className="role-cell">
          <RoleIcon role={g.role} className="role-ic" />
          <span>{ROLE_LABEL[g.role] || g.role || '—'}</span>
        </td>
        <td>
          <KDA k={g.kills} d={g.deaths} a={g.assists} kda={g.kda} />
        </td>
        <td className="num">{g.cs}</td>
        <td>
          <SpellPair s1={g.summoner1} s2={g.summoner2} />
        </td>
        <td>
          <RuneIcons keystone={g.keystone} sub={g.subStyle} />
        </td>
        <td>
          <BuildRow items={g.items} withTrinket highlight={item} itemStats={itemStats} />
        </td>
        <td className="num">{g.patch ?? '—'}</td>
        <td className="num">{new Date(g.gameCreation).toLocaleDateString('es-CL')}</td>
        <td>
          <span className={`result ${g.win ? 'win' : 'lose'}`}>{g.win ? 'Victoria' : 'Derrota'}</span>
          {showReplay && (
            <button
              className="dl-btn"
              title="Reproducir replay en el cliente de LoL"
              disabled={downloading}
              onClick={(e) => { e.stopPropagation(); void watchReplay(g.matchId, setDownloading, g.puuid); }}
            >{downloading ? '…' : '▶'}</button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="game-detail">
          <td colSpan={11}>
            <div className="detail-scroll">
              {error ? (
                <div className="empty">Error al cargar la partida.</div>
              ) : detail ? (
                <Scoreboard match={detail} highlight={item} playerHref={playerHref} champHref={champHref} />
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

export function ItemView() {
  const { id = '' } = useParams();
  const item = Number(id);
  const s = useStore();
  const a = useAssets();
  const [resp, setResp] = useState<ItemGamesResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [itemStatsMap, setItemStatsMap] = useState<Map<number, ItemStatRow>>(new Map());

  // Reinicia la página al cambiar de ítem o de filtros.
  useEffect(() => {
    setOffset(0);
  }, [item, s.region, s.patch, s.tier, s.role, s.champion]);

  useEffect(() => {
    let cancel = false;
    if (!s.region || !Number.isFinite(item)) {
      setResp(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .itemGames(s.region, item, s.statFilter(s.champion), ITEM_PAGE, offset)
      .then((r) => {
        if (!cancel) {
          setResp(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancel) {
          setResp(null);
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [item, s.region, s.patch, s.tier, s.role, s.champion, offset]);

  useEffect(() => {
    if (!s.region) { setItemStatsMap(new Map()); return; }
    api.stats<ItemStatRow>('items', s.region, s.statFilter(s.champion))
      .then((rows) => {
        const m = new Map<number, ItemStatRow>();
        for (const r of rows) m.set(r.item, r);
        setItemStatsMap(m);
      })
      .catch(() => {});
  }, [s.region, s.patch, s.tier, s.role, s.champion]);

  const scope = (() => {
    const role = s.role === 'ALL' ? 'todos los roles' : ROLE_LABEL[s.role] || s.role;
    const tier = s.tier === 'all' || !s.tier ? 'todos los rangos' : s.tier.split(',').map((t) => TIER_LABEL[t] || t).join(', ');
    const champ = s.champion === 'all' ? 'todos los campeones' : s.champion;
    return `${champ} · ${role} · ${tier} · parche ${s.patch === 'all' ? 'todos' : s.patch}`;
  })();

  const total = resp?.total || 0;
  const games = resp?.games || [];
  const newest = newestPatch(games.map((g) => g.patch));

  return (
    <section>
      <div className="cv-header">
        <AssetImg src={a.itemIcon(item)} />
        <div>
          <div className="name">{a.itemName(item)}</div>
          <div className="meta">
            {scope} · <b>{total}</b> partidas
          </div>
        </div>
      </div>

      <div className="table-host">
        {!s.region ? (
          <div className="empty">No hay datos. Recolecta primero.</div>
        ) : loading ? (
          <div className="empty">Cargando…</div>
        ) : !games.length ? (
          <div className="empty">Ninguna partida con este ítem para el filtro actual.</div>
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
                <GameRow key={g.matchId} g={g} region={s.region} item={item} showReplay={g.patch === newest} itemStats={itemStatsMap} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="iv-pager">
          <button className="pager-btn" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - ITEM_PAGE))}>
            ← Anterior
          </button>
          <span className="pager-info">
            {offset + 1}–{Math.min(offset + ITEM_PAGE, total)} de {total}
          </span>
          <button
            className="pager-btn"
            disabled={offset + ITEM_PAGE >= total}
            onClick={() => setOffset(offset + ITEM_PAGE)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </section>
  );
}
