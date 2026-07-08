import { useEffect, useState } from 'react';
import {
  ChampionIcon,
  RoleIcon,
  Scoreboard,
  TIER_LABEL,
  type MatchDetail,
  type MatchListRow,
  type MatchListResponse,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { champHref, playerHref } from '../components/links';

const PAGE_SIZE = 50;
const matchCache = new Map<string, MatchDetail>();

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function TeamChamps({ champs, roles }: { champs: string[]; roles: string[] }) {
  return (
    <span className="gl-team">
      {champs.map((champ, i) => (
        <span key={i} className="gl-champ-wrap" title={`${champ}${roles[i] ? ' · ' + roles[i] : ''}`}>
          <ChampionIcon name={champ} lazy />
          {roles[i] && <RoleIcon role={roles[i]} className="gl-role-overlay" />}
        </span>
      ))}
    </span>
  );
}

function GameRow({ match, region }: { match: MatchListRow; region: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [error, setError] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (detail || error) return;
    const cached = matchCache.get(match.matchId);
    if (cached) { setDetail(cached); return; }
    try {
      const data = await api.match(region, match.matchId);
      if (data && !(data as { error?: string }).error) {
        matchCache.set(match.matchId, data);
        setDetail(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  };

  const blueWon = match.winningTeam === 100;
  const redWon = match.winningTeam === 200;

  return (
    <>
      <tr className="gl-row" onClick={toggle}>
        <td className="ig-caret">
          <span className="caret">{open ? '▾' : '▸'}</span>
        </td>
        <td className="num gl-date">
          {new Date(match.gameCreation).toLocaleDateString('es-CL')}
        </td>
        <td className="num">{fmtDuration(match.gameDuration)}</td>
        <td className="num">{match.patch ?? '—'}</td>
        <td className="num">{match.tier ? (TIER_LABEL[match.tier] ?? match.tier) : '—'}</td>
        <td>
          <span className={`gl-side ${blueWon ? 'gl-win' : redWon ? 'gl-lose' : ''}`}>
            <TeamChamps champs={match.blueChamps} roles={match.blueRoles} />
          </span>
        </td>
        <td>
          <span className={`gl-side ${redWon ? 'gl-win' : blueWon ? 'gl-lose' : ''}`}>
            <TeamChamps champs={match.redChamps} roles={match.redRoles} />
          </span>
        </td>
        <td>
          {match.winningTeam === 100 && <span className="result win">Azul</span>}
          {match.winningTeam === 200 && <span className="result win">Rojo</span>}
          {match.winningTeam == null && <span className="result">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="game-detail">
          <td colSpan={8}>
            <div className="detail-scroll">
              {error ? (
                <div className="empty">Error al cargar la partida.</div>
              ) : detail ? (
                <Scoreboard match={detail} playerHref={playerHref} champHref={champHref} />
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

export function GamesPage() {
  const s = useStore();
  const [resp, setResp] = useState<MatchListResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOffset(0);
  }, [s.region, s.patch, s.tier, s.role, s.champion]);

  useEffect(() => {
    let cancel = false;
    if (!s.region) { setResp(null); setLoading(false); return; }
    setLoading(true);
    api
      .games(s.region, s.statFilter(s.champion), PAGE_SIZE, offset)
      .then((r) => { if (!cancel) { setResp(r); setLoading(false); } })
      .catch(() => { if (!cancel) { setResp(null); setLoading(false); } });
    return () => { cancel = true; };
  }, [s.region, s.patch, s.tier, s.role, s.champion, offset]);

  const total = resp?.total ?? 0;
  const matches = resp?.matches ?? [];

  return (
    <section>
      <div className="cv-header">
        <div>
          <div className="name">Partidas</div>
          <div className="meta">
            {s.region || '—'} · parche {s.patch === 'all' ? 'todos' : s.patch} ·{' '}
            <b>{total}</b> partidas
          </div>
        </div>
      </div>

      <div className="table-host">
        {!s.region ? (
          <div className="empty">No hay datos. Recolecta primero.</div>
        ) : loading ? (
          <div className="empty">Cargando…</div>
        ) : !matches.length ? (
          <div className="empty">Ninguna partida para el filtro actual.</div>
        ) : (
          <table className="ig-table gl-table">
            <thead>
              <tr>
                <th className="ig-caret" />
                <th>Fecha</th>
                <th>Duración</th>
                <th>Parche</th>
                <th>Rango</th>
                <th>Equipo Azul</th>
                <th>Equipo Rojo</th>
                <th>Ganador</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <GameRow key={m.matchId} match={m} region={s.region} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="iv-pager">
          <button className="pager-btn" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            ← Anterior
          </button>
          <span className="pager-info">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
          </span>
          <button
            className="pager-btn"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </section>
  );
}
