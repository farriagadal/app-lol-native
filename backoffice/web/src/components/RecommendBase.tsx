/**
 * Base reutilizable para las tres páginas de recomendación de picks:
 *   - 'rivals'  → vs rivales de carril
 *   - 'synergy' → con aliados del mismo equipo
 *   - 'full'    → ambas condiciones a la vez
 */
import { useEffect, useState } from 'react';
import { ChampionIcon, RoleIcon, ROLE_LABEL, type RecommendRow, type RecommendResponse } from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { MultiChipSelect } from './MultiChipSelect';
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

function ChampCard({ row, rank }: { row: RecommendRow; rank: number }) {
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
        </>
      ) : (
        <span className="rec-sample rec-sample-none">Sin datos</span>
      )}
    </a>
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

interface Props {
  mode: RecommendMode;
}

export function RecommendBase({ mode }: Props) {
  const s = useStore();
  const champs = s.meta?.champions ?? [];

  const [myChamps, setMyChamps] = useState<string[]>([]);
  const [enemies, setEnemies] = useState<string[]>([]);
  const [allies, setAllies] = useState<string[]>([]);
  const [role, setRole] = useState<string>('ALL');
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const showEnemies = mode === 'rivals' || mode === 'full';
  const showAllies = mode === 'synergy' || mode === 'full';

  // Limpiar campos no usados al cambiar de modo
  useEffect(() => {
    if (!showEnemies) setEnemies([]);
    if (!showAllies) setAllies([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!s.region || myChamps.length === 0) { setResult(null); return; }
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
      </div>

      <div className="rec-form">
        <div className={`rec-field-group ${showAllies && showEnemies ? 'rec-field-group-3' : ''}`}>
          <label className="rec-label">
            Mi pool de campeones
            <MultiChipSelect
              options={champs}
              value={myChamps}
              onChange={setMyChamps}
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
              <ChampCard key={row.championName} row={row} rank={i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
