/**
 * Base reutilizable para las tres páginas de recomendación de picks:
 *   - 'rivals'  → vs rivales de carril
 *   - 'synergy' → con aliados del mismo equipo
 *   - 'full'    → ambas condiciones a la vez
 */
import { useEffect, useMemo, useState } from 'react';
import { ChampionIcon, RoleIcon, ROLE_LABEL, type RecommendRow, type RecommendResponse } from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { MultiChipSelect } from './MultiChipSelect';
import { recommendFromProfile } from './profileRecommend';
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

  const [pools, setPools] = useState<Record<string, string[]>>(loadPools);
  const [enemies, setEnemies] = useState<string[]>([]);
  const [allies, setAllies] = useState<string[]>([]);
  const [role, setRole] = useState<string>('ALL');

  const hasProfile = !!s.profile?.matches?.length;
  const usingProfile = s.myMatches && hasProfile;

  const myChamps = useMemo(() => pools[role] ?? [], [pools, role]);
  const setMyChamps = (v: string[]) => setPools((p) => ({ ...p, [role]: v }));
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    savePools(pools);
  }, [pools]);

  const showEnemies = mode === 'rivals' || mode === 'full';
  const showAllies = mode === 'synergy' || mode === 'full';

  // Limpiar campos no usados al cambiar de modo
  useEffect(() => {
    if (!showEnemies) setEnemies([]);
    if (!showAllies) setAllies([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    // Modo "Mis partidas": cálculo local con el perfil efímero, sin tocar la
    // base. Con pool vacío se listan todos los campeones jugados por el dueño.
    if (usingProfile) {
      setLoading(false);
      setResult({
        recommendations: recommendFromProfile(
          s.profile!.matches,
          myChamps,
          showEnemies ? enemies : [],
          showAllies ? allies : [],
          role,
        ),
      });
      return;
    }
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
  }, [s.region, s.patch, s.tier, s.dateFrom, s.dateTo, myChamps, enemies, allies, role, showEnemies, showAllies, usingProfile, s.profile]);

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
          {usingProfile && (
            <div className="meta">
              Calculando solo con las {s.profile!.matches.length} partidas de {s.profile!.riotId} · los
              filtros globales (servidor/parche/rango/fechas) no aplican
            </div>
          )}
        </div>
        {hasProfile && (
          <button
            className={`rec-role-btn ${s.myMatches ? 'active' : ''}`}
            onClick={() => s.setMyMatches(!s.myMatches)}
            title="Usar solo las partidas descargadas en tu Perfil (no se mezclan con la base global)"
          >
            Mis partidas ({s.profile!.matches.length})
          </button>
        )}
      </div>

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

      {myChamps.length === 0 && !usingProfile ? (
        <div className="empty">Agrega al menos un campeón a tu pool para ver recomendaciones.</div>
      ) : !s.region && !usingProfile ? (
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
