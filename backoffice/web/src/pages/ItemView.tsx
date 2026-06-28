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
  type ItemGameRow,
  type ItemGamesResponse,
  type MatchDetail,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';

const ITEM_PAGE = 50;
// Cache en memoria de partidas ya cargadas (compartida entre filas).
const matchCache = new Map<string, MatchDetail>();

function GameRow({ g, region, item }: { g: ItemGameRow; region: string; item: number }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [error, setError] = useState(false);

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
          <BuildRow items={g.items} withTrinket highlight={item} />
        </td>
        <td>
          <span className={`result ${g.win ? 'win' : 'lose'}`}>{g.win ? 'Victoria' : 'Derrota'}</span>
        </td>
      </tr>
      {open && (
        <tr className="game-detail">
          <td colSpan={9}>
            {error ? (
              <div className="empty">Error al cargar la partida.</div>
            ) : detail ? (
              <Scoreboard match={detail} highlight={item} />
            ) : (
              <div className="empty">Cargando partida…</div>
            )}
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

  const scope = (() => {
    const role = s.role === 'ALL' ? 'todos los roles' : ROLE_LABEL[s.role] || s.role;
    const tier = s.tier === 'all' ? 'todos los rangos' : TIER_LABEL[s.tier] || s.tier;
    const champ = s.champion === 'all' ? 'todos los campeones' : s.champion;
    return `${champ} · ${role} · ${tier} · parche ${s.patch === 'all' ? 'todos' : s.patch}`;
  })();

  const total = resp?.total || 0;
  const games = resp?.games || [];

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
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <GameRow key={g.matchId} g={g} region={s.region} item={item} />
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
