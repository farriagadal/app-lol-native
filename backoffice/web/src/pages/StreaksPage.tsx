/** Página Rachas: lista de jugadores ordenados por racha de victorias más larga. */
import { useEffect, useState } from 'react';
import {
  BuildRow,
  ChampionIcon,
  KDA,
  RoleIcon,
  RuneIcons,
  Scoreboard,
  SpellPair,
  TierEmblem,
  ROLE_LABEL,
  TIER_LABEL,
  TIER_ORDER,
  type ItemStatRow,
  type StreakGameRow,
  type StreakPlayer,
  type StreaksResponse,
  type MatchDetail,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { champHref, playerHref, ChampLink, PlayerLink } from '../components/links';
import { watchReplay } from '../downloadReplay';

const PLAYERS_PER_PAGE = 50;
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

function mostCommonTier(matches: StreakGameRow[]): string | null {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (m.tier) counts.set(m.tier, (counts.get(m.tier) ?? 0) + 1);
  }
  let best: string | null = null, bestN = 0;
  for (const [t, n] of counts) if (n > bestN) { bestN = n; best = t; }
  return best;
}

function longestWinStreakIndices(matches: StreakGameRow[]): Set<number> {
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].win) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curLen = 0;
    }
  }
  const s = new Set<number>();
  for (let i = bestStart; i < bestStart + bestLen; i++) s.add(i);
  return s;
}

function GameRow({ g, region, isStreak, showReplay, itemStats }: { g: StreakGameRow; region: string; isStreak: boolean; showReplay: boolean; itemStats: Map<number, ItemStatRow> }) {
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
      <tr className={`ig-row ${g.win ? 'win' : 'lose'}${isStreak ? ' streak-row' : ''}`} onClick={toggle}>
        <td className="ig-caret"><span className="caret">{open ? '▾' : '▸'}</span></td>
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
              onClick={(e) => { e.stopPropagation(); void watchReplay(g.matchId, setDownloading, g.puuid); }}
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
                <>
                  <Scoreboard match={detail} playerHref={playerHref} champHref={champHref} />
                </>
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

function PlayerCard({ player, matches, region, itemStats, duoOnly, duoMatchIds }: { player: StreakPlayer; matches: StreakGameRow[]; region: string; itemStats: Map<number, ItemStatRow>; duoOnly: boolean; duoMatchIds: Set<string> }) {
  const visibleMatches = duoOnly ? matches.filter((m) => !duoMatchIds.has(m.matchId)) : matches;
  const streakIndices = longestWinStreakIndices(visibleMatches);
  const winRatePct = player.totalGames > 0 ? Math.round((player.wins / player.totalGames) * 100) : 0;
  const tier = mostCommonTier(visibleMatches);
  const newest = newestPatch(visibleMatches.map((m) => m.patch));
  const matchRegion = matches[0]?.matchId.split('_')[0]?.toUpperCase() ?? null;

  return (
    <div className="streak-player card">
      <div className="streak-header">
        {tier && <TierEmblem tier={tier} className="streak-tier-emb" />}
        <PlayerLink puuid={player.puuid} className="streak-name player-link">
          {player.riotId || player.puuid.slice(0, 20) + '…'}
        </PlayerLink>
        {matchRegion && <span className="server-badge">{matchRegion}</span>}
        {player.longestWinStreak > 0 && (
          <span className="streak-badge">{player.longestWinStreak} victorias seguidas</span>
        )}
        <span className="streak-meta">
          {player.totalGames} partidas · {winRatePct}% victorias
        </span>
      </div>
      {visibleMatches.length > 0 && (
        <div className="table-host" style={{ marginTop: 10 }}>
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
              {visibleMatches.map((g, i) => (
                <GameRow key={g.matchId} g={g} region={region} isStreak={streakIndices.has(i)} showReplay={g.patch === newest} itemStats={itemStats} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {duoOnly && visibleMatches.length === 0 && (
        <div className="empty" style={{ padding: '10px 0' }}>Todas las partidas de este jugador fueron en duo.</div>
      )}
    </div>
  );
}

export function StreaksPage() {
  const s = useStore();
  const [resp, setResp] = useState<StreaksResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [itemStatsMap, setItemStatsMap] = useState<Map<number, ItemStatRow>>(new Map());
  const [duoOnly, setDuoOnly] = useState(false);
  const [minStreak, setMinStreak] = useState('');
  const [minGames, setMinGames] = useState('');
  const [maxGames, setMaxGames] = useState('');
  const [minWr, setMinWr] = useState('');
  const [maxWr, setMaxWr] = useState('');
  const [sortBy, setSortBy] = useState<'racha' | 'rango' | 'winrate' | 'partidas'>('racha');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => { setOffset(0); }, [s.region, s.patch, s.tier, s.role, s.champion, s.dateFrom, s.dateTo]);

  useEffect(() => {
    let cancel = false;
    if (!s.region) { setResp(null); return; }
    setLoading(true);
    api.streaks(s.region, s.statFilter(s.champion), PLAYERS_PER_PAGE, offset)
      .then((r) => { if (!cancel) { setResp(r); setLoading(false); } })
      .catch(() => { if (!cancel) { setResp(null); setLoading(false); } });
    return () => { cancel = true; };
  }, [s.region, s.patch, s.tier, s.role, s.champion, s.dateFrom, s.dateTo, offset]);

  useEffect(() => {
    if (!s.region) { setItemStatsMap(new Map()); return; }
    api.stats<ItemStatRow>('items', s.region, s.statFilter(s.champion))
      .then((rows) => {
        const m = new Map<number, ItemStatRow>();
        for (const r of rows) m.set(r.item, r);
        setItemStatsMap(m);
      })
      .catch(() => {});
  }, [s.region, s.patch, s.tier, s.role, s.champion, s.dateFrom, s.dateTo]);

  const players = resp?.players ?? [];
  const matchesByPuuid = new Map<string, StreakGameRow[]>();
  for (const m of (resp?.matches ?? [])) {
    const arr = matchesByPuuid.get(m.puuid) ?? [];
    arr.push(m);
    matchesByPuuid.set(m.puuid, arr);
  }
  const total = resp?.total ?? 0;

  const filteredPlayers = players
    .filter((p) => {
      const wr = p.totalGames > 0 ? (p.wins / p.totalGames) * 100 : 0;
      if (minStreak !== '' && p.longestWinStreak < Number(minStreak)) return false;
      if (minGames !== '' && p.totalGames < Number(minGames)) return false;
      if (maxGames !== '' && p.totalGames > Number(maxGames)) return false;
      if (minWr !== '' && wr < Number(minWr)) return false;
      if (maxWr !== '' && wr > Number(maxWr)) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'desc' ? 1 : -1;
      if (sortBy === 'rango') {
        const tierA = mostCommonTier(matchesByPuuid.get(a.puuid) ?? []);
        const tierB = mostCommonTier(matchesByPuuid.get(b.puuid) ?? []);
        const oA = tierA ? (TIER_ORDER[tierA as keyof typeof TIER_ORDER] ?? 99) : 99;
        const oB = tierB ? (TIER_ORDER[tierB as keyof typeof TIER_ORDER] ?? 99) : 99;
        // desc = mejor rango primero (oA < oB), asc = peor rango primero
        return oA !== oB ? (oA - oB) * dir : b.longestWinStreak - a.longestWinStreak;
      }
      if (sortBy === 'winrate') {
        const wrA = a.totalGames > 0 ? a.wins / a.totalGames : 0;
        const wrB = b.totalGames > 0 ? b.wins / b.totalGames : 0;
        return wrB !== wrA ? (wrB - wrA) * dir : b.longestWinStreak - a.longestWinStreak;
      }
      if (sortBy === 'partidas') {
        return b.totalGames !== a.totalGames ? (b.totalGames - a.totalGames) * dir : b.longestWinStreak - a.longestWinStreak;
      }
      // racha
      return (b.longestWinStreak - a.longestWinStreak) * dir;
    });

  // Detectar partidas en duo: matchId donde ≥2 jugadores rastreados comparten equipo (mismo win).
  const duoMatchIds = (() => {
    const teamMap = new Map<string, Map<number, string[]>>();
    for (const m of (resp?.matches ?? [])) {
      let byWin = teamMap.get(m.matchId);
      if (!byWin) { byWin = new Map(); teamMap.set(m.matchId, byWin); }
      const key = m.win ? 1 : 0;
      const arr = byWin.get(key) ?? [];
      arr.push(m.puuid);
      byWin.set(key, arr);
    }
    const ids = new Set<string>();
    for (const [matchId, byWin] of teamMap) {
      for (const puuids of byWin.values()) {
        if (puuids.length >= 2) { ids.add(matchId); break; }
      }
    }
    return ids;
  })();

  const scopeDesc = (() => {
    const role = s.role === 'ALL' ? 'todos los roles' : ROLE_LABEL[s.role] || s.role;
    const tier = s.tier === 'all' || !s.tier ? 'todos los rangos' : s.tier.split(',').map((t) => TIER_LABEL[t] || t).join(', ');
    const champ = s.champion === 'all' ? 'todos los campeones' : s.champion;
    return `${champ} · ${role} · ${tier} · parche ${s.patch === 'all' ? 'todos' : s.patch}`;
  })();

  return (
    <div className="page">
      <div className="summary">
        {total > 0 ? (
          <>
            <b>{filteredPlayers.length}</b>{filteredPlayers.length !== total ? ` de ${total}` : ''} jugadores · {scopeDesc}
          </>
        ) : (
          <span>{scopeDesc}</span>
        )}
      </div>
      <div className="streak-filters">
        <span className="streak-filter-group">
          <label className="streak-filter-label">Racha mín.</label>
          <input className="streak-filter-input" type="number" min={3} placeholder="3" value={minStreak} onChange={(e) => setMinStreak(e.target.value)} />
        </span>
        <span className="streak-filter-group">
          <label className="streak-filter-label">Partidas</label>
          <input className="streak-filter-input" type="number" min={0} placeholder="mín" value={minGames} onChange={(e) => setMinGames(e.target.value)} />
          <span className="streak-filter-sep">–</span>
          <input className="streak-filter-input" type="number" min={0} placeholder="máx" value={maxGames} onChange={(e) => setMaxGames(e.target.value)} />
        </span>
        <span className="streak-filter-group">
          <label className="streak-filter-label">% victorias</label>
          <input className="streak-filter-input" type="number" min={0} max={100} placeholder="mín" value={minWr} onChange={(e) => setMinWr(e.target.value)} />
          <span className="streak-filter-sep">–</span>
          <input className="streak-filter-input" type="number" min={0} max={100} placeholder="máx" value={maxWr} onChange={(e) => setMaxWr(e.target.value)} />
        </span>
        <button
          className={`pill${duoOnly ? ' on' : ''}`}
          onClick={() => setDuoOnly((v) => !v)}
          title="Ocultar partidas jugadas en duo con otro jugador rastreado"
        >
          Sin duo
        </button>
        <span className="streak-filter-group">
          <label className="streak-filter-label">Orden</label>
          {(['racha', 'rango', 'winrate', 'partidas'] as const).map((opt) => {
            const active = sortBy === opt;
            const label = opt === 'racha' ? 'Racha' : opt === 'rango' ? 'Rango' : opt === 'winrate' ? 'Win Rate' : 'Partidas';
            const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
            return (
              <button
                key={opt}
                className={`pill${active ? ' on' : ''}`}
                onClick={() => {
                  if (active) {
                    setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
                  } else {
                    setSortBy(opt);
                    setSortDir('desc');
                  }
                }}
              >
                {label}{arrow}
              </button>
            );
          })}
        </span>
      </div>
      {!s.region ? (
        <div className="empty">No hay datos. Recolecta primero.</div>
      ) : loading ? (
        <div className="empty">Calculando rachas…</div>
      ) : !players.length ? (
        <div className="empty">Sin datos para el filtro actual.</div>
      ) : (
        <>
          {filteredPlayers.map((p) => (
            <PlayerCard
              key={p.puuid}
              player={p}
              matches={matchesByPuuid.get(p.puuid) ?? []}
              region={s.region}
              itemStats={itemStatsMap}
              duoOnly={duoOnly}
              duoMatchIds={duoMatchIds}
            />
          ))}
          {!filteredPlayers.length && (
            <div className="empty">Sin jugadores para los filtros aplicados.</div>
          )}
          {total > PLAYERS_PER_PAGE && (
            <div className="iv-pager">
              <button
                className="pager-btn"
                disabled={offset <= 0}
                onClick={() => setOffset(Math.max(0, offset - PLAYERS_PER_PAGE))}
              >
                ← Anterior
              </button>
              <span className="pager-info">
                {offset + 1}–{Math.min(offset + PLAYERS_PER_PAGE, total)} de {total}
              </span>
              <button
                className="pager-btn"
                disabled={offset + PLAYERS_PER_PAGE >= total}
                onClick={() => setOffset(offset + PLAYERS_PER_PAGE)}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
