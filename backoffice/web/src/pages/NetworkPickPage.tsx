/**
 * Pick completo por red de conocimiento: puntúa tu pool (por rol) contra los
 * aliados confirmados y rivales vistos usando SOLO la red manual de
 * sinergias/counters (pestaña Red). El score es la suma de pesos de las
 * aristas aplicables, con desglose por interacción.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChampionIcon, RoleIcon, ROLE_LABEL, type ProfileMatch } from '@ui';
import { useStore } from '../state/store';
import { useKnowledge } from '../state/knowledge';
import { MultiChipSelect } from '../components/MultiChipSelect';
import { MatchHistory } from '../components/MatchHistory';
import { useRecommendSelection, type RecommendSelection } from '../components/RecommendBase';
import { scorePool, type NetworkScore, type ScoreContribution } from '../components/networkScore';
import { champHref } from '../components/links';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

const champIcon = (c: string) => <ChampionIcon name={c} lazy className="champ-opt-ico" />;

function rankClass(i: number): string {
  if (i === 0) return 'rec-rank-gold';
  if (i === 1) return 'rec-rank-silver';
  if (i === 2) return 'rec-rank-bronze';
  return '';
}

function contribTitle(c: ScoreContribution): string {
  const e = c.edge;
  const rel =
    c.reason === 'synergy'
      ? `Sinergia ${e.a} + ${e.b}`
      : `${e.a} countea a ${e.b}`;
  const parts = [`${rel} · peso ${e.weight}`, e.role ? ROLE_LABEL[e.role] ?? e.role : 'Global'];
  if (e.note) parts.push(e.note);
  parts.push('Clic para editar en la Red');
  return parts.join(' · ');
}

function ContribChip({ c, onEdit }: { c: ScoreContribution; onEdit: () => void }) {
  const label = c.reason === 'synergy' ? 'sinergia' : c.reason === 'counters' ? 'lo counteas' : 'te countea';
  return (
    <button
      className={`net-chip ${c.delta > 0 ? 'net-chip-good' : 'net-chip-bad'}`}
      title={contribTitle(c)}
      onClick={onEdit}
    >
      <span className="net-chip-delta">{c.delta > 0 ? `+${c.delta}` : c.delta}</span>
      <ChampionIcon name={c.other} lazy className="champ-opt-ico" />
      <span>{c.other}</span>
      <span className="net-chip-reason">{label}</span>
    </button>
  );
}

function ScoreRow({ s, rank, onEdit }: { s: NetworkScore; rank: number; onEdit: (champ: string) => void }) {
  const cls = s.total > 0 ? 'wr-good' : s.total < 0 ? 'wr-bad' : 'wr-even';
  return (
    <div className="net-score-row">
      <span className={`rec-rank ${rankClass(rank)}`}>{rank + 1}°</span>
      <a href={champHref(s.champion)} className="net-score-champ cell-link">
        <ChampionIcon name={s.champion} />
        <span className="rec-name">{s.champion}</span>
      </a>
      <span className={`net-score-total ${cls}`}>{s.total > 0 ? `+${s.total}` : s.total}</span>
      <div className="net-score-chips">
        {s.contributions.length === 0 ? (
          <span className="rec-sample rec-sample-none">Sin señales en la red</span>
        ) : (
          s.contributions.map((c) => <ContribChip key={c.edge.id + c.reason} c={c} onEdit={() => onEdit(s.champion)} />)
        )}
      </div>
    </div>
  );
}

export function NetworkPickPage({ selection }: { selection?: RecommendSelection } = {}) {
  const s = useStore();
  const k = useKnowledge();
  const navigate = useNavigate();
  const champs = s.meta?.champions ?? [];

  const own = useRecommendSelection();
  const { pools, setPools, allies, setAllies, enemies, setEnemies, role, setRole } = selection ?? own;
  const [showHistory, setShowHistory] = useState(false);

  const hasProfile = !!s.profile?.matches?.length;

  // Importar los campeones de una partida del historial a los selectores
  const importMatch = (m: ProfileMatch) => {
    const me = m.participants.find((p) => p.me);
    if (!me) return;
    setAllies(m.participants.filter((p) => p.teamId === me.teamId && !p.me).map((p) => p.championName));
    setEnemies(m.participants.filter((p) => p.teamId !== me.teamId).map((p) => p.championName));
    setShowHistory(false);
  };

  const myChamps = useMemo(() => pools[role] ?? [], [pools, role]);
  const setMyChamps = (v: string[]) => setPools((p) => ({ ...p, [role]: v }));

  // Sin fetch: la red completa está en memoria y el score es una suma de lookups.
  const scores = useMemo(
    () => scorePool(k.net, myChamps, role, allies, enemies),
    [k.net, myChamps, role, allies, enemies],
  );

  const goEdit = (champ: string) => navigate(`/network?champ=${encodeURIComponent(champ)}`);

  return (
    <section className="rec-section">
      <div className="cv-header">
        <div>
          <div className="name">Pick completo — red de conocimiento</div>
          <div className="meta">
            Puntúa tu pool con tus sinergias y counters manuales: +peso por sinergia con aliados y por countear a un
            rival, −peso cuando el rival te countea
          </div>
          {role === 'ALL' && (
            <div className="meta">Con rol «Todos» solo aplican las interacciones globales (sin rol asignado)</div>
          )}
        </div>
        <div className="rec-role-btns">
          {hasProfile && (
            <button
              className={`rec-role-btn ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory((v) => !v)}
              title="Historial de tu Perfil: haz clic en una partida para importar sus campeones a aliados/rivales"
            >
              Mis partidas ({s.profile!.matches.length})
            </button>
          )}
          <button className="rec-role-btn" onClick={() => navigate('/network')}>
            Editar red ({k.net.edges.length})
          </button>
        </div>
      </div>

      {showHistory && hasProfile && (
        <div className="rec-history-panel">
          <div className="meta">
            Últimas partidas de {s.profile!.riotId} — haz clic en una para importar sus campeones a aliados y rivales.
          </div>
          <MatchHistory matches={s.profile!.matches} onPick={importMatch} />
        </div>
      )}

      <div className="rec-form">
        <div className="rec-field-group rec-field-group-3">
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
      ) : k.net.edges.length === 0 ? (
        <div className="empty">
          Tu red está vacía. Ve a la pestaña <a href="/network" onClick={(e) => { e.preventDefault(); navigate('/network'); }}>Red</a> y
          codifica tus primeras sinergias y counters.
        </div>
      ) : allies.length === 0 && enemies.length === 0 ? (
        <div className="empty">Agrega aliados confirmados o rivales vistos para puntuar tu pool.</div>
      ) : (
        <div className="net-score-list">
          {scores.map((sc, i) => (
            <ScoreRow key={sc.champion} s={sc} rank={i} onEdit={goEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
