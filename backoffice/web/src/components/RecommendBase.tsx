/**
 * Base reutilizable para las tres páginas de recomendación de picks:
 *   - 'rivals'  → vs rivales de carril
 *   - 'synergy' → con aliados del mismo equipo
 *   - 'full'    → ambas condiciones a la vez
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ChampionIcon, RoleIcon, ROLE_LABEL,
  type ProfileMatch, type RecommendGamesResponse, type RecommendRow, type RecommendResponse,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { MultiChipSelect } from './MultiChipSelect';
import { MatchHistory } from './MatchHistory';
import { loadPools, savePools } from './recommendPools';
import { champHref } from './links';

export type RecommendMode = 'rivals' | 'synergy' | 'full';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

const MODE_META: Record<RecommendMode, { title: string; subtitle: string }> = {
  rivals: {
    title: 'Recomendar vs rivales',
    subtitle: 'Win rate de tu pool contra los campeones que viste en champ select enemigo',
  },
  synergy: {
    title: 'Recomendar por sinergias',
    subtitle: 'Win rate de tu pool en partidas donde jugaste con esos aliados',
  },
  full: {
    title: 'Análisis completo',
    subtitle: 'Win rate considerando tanto los aliados confirmados como los rivales vistos',
  },
};

const champIcon = (c: string) => <ChampionIcon name={c} lazy className="champ-opt-ico" />;

function sampleClass(games: number): string {
  if (games === 0) return 'rec-sample-none';
  if (games < 10) return 'rec-sample-low';
  if (games < 30) return 'rec-sample-mid';
  return 'rec-sample-ok';
}

function rankClass(i: number): string {
  if (i === 0) return 'rec-rank-gold';
  if (i === 1) return 'rec-rank-silver';
  if (i === 2) return 'rec-rank-bronze';
  return '';
}

function WrColor({ wr }: { wr: number }) {
  const pct = (wr * 100).toFixed(1);
  const cls = wr >= 0.52 ? 'wr-good' : wr <= 0.48 ? 'wr-bad' : 'wr-even';
  return <span className={`rec-wr ${cls}`}>{pct}%</span>;
}

function ChampCard({ row, rank, detailOpen, onDetail }: {
  row: RecommendRow;
  rank: number;
  detailOpen: boolean;
  onDetail: () => void;
}) {
  return (
    <a href={champHref(row.championName)} className="rec-card cell-link">
      <span className={`rec-rank ${rankClass(rank)}`}>{rank + 1}°</span>
      <ChampionIcon name={row.championName} />
      <span className="rec-name">{row.championName}</span>
      {row.games > 0 ? (
        <>
          <WrColor wr={row.winRate} />
          <span className={`rec-sample ${sampleClass(row.games)}`}>
            {row.wins}V / {row.games - row.wins}D · {row.games} partidas
          </span>
          <button
            className={`rec-role-btn rec-detail-btn ${detailOpen ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDetail(); }}
            title="Ver las partidas detrás de este win rate"
          >
            {detailOpen ? 'Ocultar detalle' : '+ Detalle'}
          </button>
        </>
      ) : (
        <span className="rec-sample rec-sample-none">Sin datos</span>
      )}
    </a>
  );
}

/** Card inferior con las partidas reales detrás del win rate de un campeón. */
function DetailGames({ champ, data, loading }: {
  champ: string;
  data: RecommendGamesResponse | null;
  loading: boolean;
}) {
  return (
    <div className="rec-history-panel rec-detail-panel">
      <div className="meta">
        {loading
          ? `Cargando partidas de ${champ}…`
          : data
            ? `Partidas de ${champ} con los filtros actuales — ${Math.min(data.games.length, data.total)} de ${data.total}`
            : `Sin partidas de ${champ} para el filtro actual.`}
      </div>
      {data && data.games.length > 0 && (
        <div className="rec-history">
          {data.games.map((g) => {
            const myBlue = g.teamId === 100;
            return (
              <div key={g.region + g.matchId} className="rec-history-row rec-detail-row">
                <span className={`rec-history-result ${g.win ? 'win' : 'loss'}`}>{g.win ? 'V' : 'D'}</span>
                <span className="rec-history-team">
                  {(myBlue ? g.blueChamps : g.redChamps).map((c, i) => (
                    <span key={i} className={c === champ ? 'rec-history-hl' : undefined}>
                      <ChampionIcon name={c} lazy />
                    </span>
                  ))}
                </span>
                <span className="rec-history-vs">vs</span>
                <span className="rec-history-team">
                  {(myBlue ? g.redChamps : g.blueChamps).map((c, i) => <ChampionIcon key={i} name={c} lazy />)}
                </span>
                <span className="rec-history-meta">
                  {g.patch ? `parche ${g.patch} · ` : ''}{g.region.toUpperCase()} · {Math.round(g.gameDuration / 60)} min · {new Date(g.gameCreation).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContextChips({ label, champs }: { label: string; champs: string[] }) {
  if (!champs.length) return null;
  return (
    <div className="rec-context">
      <span>{label}:</span>
      {champs.map((c) => (
        <span key={c} className="rec-enemy-chip">
          <ChampionIcon name={c} />
          {c}
        </span>
      ))}
    </div>
  );
}

/**
 * Selección compartida (pool por rol, aliados, rivales, rol). FullPickPage la
 * crea una sola vez y la pasa a sus dos vistas para que alternar entre
 * "Red manual" y "Winrates (datos)" no pierda nada; las páginas sueltas usan
 * la suya propia.
 */
export interface RecommendSelection {
  pools: Record<string, string[]>;
  setPools: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  allies: string[];
  setAllies: (v: string[]) => void;
  enemies: string[];
  setEnemies: (v: string[]) => void;
  role: string;
  setRole: (v: string) => void;
}

export function useRecommendSelection(): RecommendSelection {
  const [pools, setPools] = useState<Record<string, string[]>>(loadPools);
  const [allies, setAllies] = useState<string[]>([]);
  const [enemies, setEnemies] = useState<string[]>([]);
  const [role, setRole] = useState<string>('ALL');

  useEffect(() => {
    savePools(pools);
  }, [pools]);

  return { pools, setPools, allies, setAllies, enemies, setEnemies, role, setRole };
}

interface Props {
  mode: RecommendMode;
  /** Selección externa compartida; si falta, el componente usa una propia. */
  selection?: RecommendSelection;
}

export function RecommendBase({ mode, selection }: Props) {
  const s = useStore();
  const champs = s.meta?.champions ?? [];

  const own = useRecommendSelection();
  const { pools, setPools, allies, setAllies, enemies, setEnemies, role, setRole } = selection ?? own;
  const [showHistory, setShowHistory] = useState(false);

  const hasProfile = !!s.profile?.matches?.length;

  // Importar los campeones de una partida del historial a los selectores
  const importMatch = (m: ProfileMatch) => {
    const me = m.participants.find((p) => p.me);
    if (!me) return;
    if (showAllies) setAllies(m.participants.filter((p) => p.teamId === me.teamId && !p.me).map((p) => p.championName));
    if (showEnemies) setEnemies(m.participants.filter((p) => p.teamId !== me.teamId).map((p) => p.championName));
    setShowHistory(false);
  };

  const myChamps = useMemo(() => pools[role] ?? [], [pools, role]);
  const setMyChamps = (v: string[]) => setPools((p) => ({ ...p, [role]: v }));
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // "+ Detalle": campeón cuyas partidas se listan en la card inferior
  const [detail, setDetail] = useState<string | null>(null);
  const [detailGames, setDetailGames] = useState<RecommendGamesResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const showEnemies = mode === 'rivals' || mode === 'full';
  const showAllies = mode === 'synergy' || mode === 'full';

  // Limpiar campos no usados al cambiar de modo
  useEffect(() => {
    if (!showEnemies) setEnemies([]);
    if (!showAllies) setAllies([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (myChamps.length === 0 || !s.region) { setResult(null); return; }
    let cancel = false;
    setLoading(true);
    api
      .recommend(s.region, myChamps, showEnemies ? enemies : [], showAllies ? allies : [], role, {
        patch: s.patch,
        tier: s.tier,
        dateFrom: s.dateFrom || undefined,
        dateTo: s.dateTo || undefined,
      })
      .then((r) => { if (!cancel) { setResult(r); setLoading(false); } })
      .catch(() => { if (!cancel) { setResult(null); setLoading(false); } });
    return () => { cancel = true; };
  }, [s.region, s.patch, s.tier, s.dateFrom, s.dateTo, myChamps, enemies, allies, role, showEnemies, showAllies]);

  // Cargar las partidas del detalle cuando cambia el campeón elegido o los filtros
  useEffect(() => {
    if (!detail || !s.region) { setDetailGames(null); return; }
    let cancel = false;
    setDetailLoading(true);
    api
      .recommendGames(s.region, detail, showEnemies ? enemies : [], showAllies ? allies : [], role, {
        patch: s.patch,
        tier: s.tier,
        dateFrom: s.dateFrom || undefined,
        dateTo: s.dateTo || undefined,
      })
      .then((r) => { if (!cancel) { setDetailGames(r); setDetailLoading(false); } })
      .catch(() => { if (!cancel) { setDetailGames(null); setDetailLoading(false); } });
    return () => { cancel = true; };
  }, [detail, s.region, s.patch, s.tier, s.dateFrom, s.dateTo, enemies, allies, role, showEnemies, showAllies]);

  // Cerrar el detalle si su campeón sale del pool
  useEffect(() => {
    if (detail && !myChamps.includes(detail)) setDetail(null);
  }, [detail, myChamps]);

  const recs = result?.recommendations ?? [];
  const withData = recs.filter((r) => r.games > 0);
  const noData = recs.filter((r) => r.games === 0);
  const sorted = [...withData, ...noData];

  const meta = MODE_META[mode];

  return (
    <section className="rec-section">
      <div className="cv-header">
        <div>
          <div className="name">{meta.title}</div>
          <div className="meta">{meta.subtitle}</div>
        </div>
        {hasProfile && (
          <button
            className={`rec-role-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory((v) => !v)}
            title="Historial de tu Perfil: haz clic en una partida para importar sus campeones a aliados/rivales"
          >
            Mis partidas ({s.profile!.matches.length})
          </button>
        )}
      </div>

      {showHistory && hasProfile && (
        <div className="rec-history-panel">
          <div className="meta">
            Últimas partidas de {s.profile!.riotId} — haz clic en una para importar sus campeones a
            {showAllies && showEnemies ? ' aliados y rivales' : showAllies ? ' aliados' : ' rivales'}.
          </div>
          <MatchHistory matches={s.profile!.matches} onPick={importMatch} />
        </div>
      )}

      <div className="rec-form">
        <div className={`rec-field-group ${showAllies && showEnemies ? 'rec-field-group-3' : ''}`}>
          <label className="rec-label">
            Mi pool de campeones
            <MultiChipSelect
              options={champs}
              value={myChamps}
              onChange={setMyChamps}
              getIcon={champIcon}
              placeholder="Busca y agrega campeones…"
            />
          </label>

          {showAllies && (
            <label className="rec-label">
              Aliados confirmados <span className="rec-label-hint">(opcional)</span>
              <MultiChipSelect
                options={champs}
                value={allies}
                onChange={setAllies}
                getIcon={champIcon}
                placeholder="Campeones en tu equipo…"
              />
            </label>
          )}

          {showEnemies && (
            <label className="rec-label">
              Rivales en champ select <span className="rec-label-hint">(opcional)</span>
              <MultiChipSelect
                options={champs}
                value={enemies}
                onChange={setEnemies}
                getIcon={champIcon}
                placeholder="Campeones rivales vistos…"
              />
            </label>
          )}
        </div>

        <div className="rec-roles">
          <span className="rec-label">Rol a jugar</span>
          <div className="rec-role-btns">
            <button className={`rec-role-btn ${role === 'ALL' ? 'active' : ''}`} onClick={() => setRole('ALL')}>
              Todos
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                className={`rec-role-btn ${role === r ? 'active' : ''}`}
                onClick={() => setRole(r)}
                title={ROLE_LABEL[r]}
              >
                <RoleIcon role={r} className="rec-role-ic" />
                <span>{ROLE_LABEL[r]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {myChamps.length === 0 ? (
        <div className="empty">Agrega al menos un campeón a tu pool para ver recomendaciones.</div>
      ) : !s.region ? (
        <div className="empty">No hay datos. Recolecta primero.</div>
      ) : loading ? (
        <div className="empty">Calculando…</div>
      ) : sorted.length === 0 ? (
        <div className="empty">Sin resultados para el filtro actual.</div>
      ) : (
        <>
          {(allies.length > 0 || enemies.length > 0) && (
            <div className="rec-context-group">
              <ContextChips label="Con aliados" champs={allies} />
              <ContextChips label="Vs rivales" champs={enemies} />
            </div>
          )}
          <div className="rec-grid">
            {sorted.map((row, i) => (
              <ChampCard
                key={row.championName}
                row={row}
                rank={i}
                detailOpen={detail === row.championName}
                onDetail={() => setDetail((d) => (d === row.championName ? null : row.championName))}
              />
            ))}
          </div>
          {detail && <DetailGames champ={detail} data={detailGames} loading={detailLoading} />}
        </>
      )}
    </section>
  );
}
