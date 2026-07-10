/**
 * Editor de la red de conocimiento manual: para un campeón foco se listan y
 * editan sus sinergias y counters (peso 1..3, rol opcional, nota), con los
 * winrates reales de la base como referencia al lado. Incluye la vista de
 * grafo de toda la red.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChampionIcon,
  ROLE_LABEL,
  type CounterStatRow,
  type KnowledgeEdge,
  type SynergyStatRow,
} from '@ui';
import { api } from '../api';
import { useStore } from '../state/store';
import { useKnowledge, type NewEdge } from '../state/knowledge';
import { ChampionSelect } from '../components/ChampionSelect';
import { NetworkGraph } from '../components/NetworkGraph';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const WEIGHTS = [1, 2, 3] as const;
const WEIGHT_TIP: Record<number, string> = { 1: 'leve', 2: 'notable', 3: 'fuerte' };

/** Relación desde el punto de vista del campeón foco. */
type Relation = 'synergy' | 'counters' | 'countered-by';

const RELATION_LABEL: Record<Relation, string> = {
  synergy: 'Sinergia con',
  counters: 'Countea a',
  'countered-by': 'Es counteado por',
};

function toNewEdge(rel: Relation, focus: string, target: string, weight: 1 | 2 | 3, role: string, note: string): NewEdge {
  const base = {
    weight,
    ...(role ? { role } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  if (rel === 'synergy') return { kind: 'synergy', a: focus, b: target, ...base };
  if (rel === 'counters') return { kind: 'counter', a: focus, b: target, ...base };
  return { kind: 'counter', a: target, b: focus, ...base };
}

function EdgeRow({ edge, focus }: { edge: KnowledgeEdge; focus: string }) {
  const k = useKnowledge();
  const other = edge.a === focus ? edge.b : edge.a;
  return (
    <div className="net-edge-row">
      <span className="net-edge-champ">
        <ChampionIcon name={other} lazy className="champ-opt-ico" />
        {other}
      </span>
      <span className="net-weight-btns">
        {WEIGHTS.map((w) => (
          <button
            key={w}
            className={`net-weight-btn ${edge.weight === w ? 'active' : ''}`}
            title={WEIGHT_TIP[w]}
            onClick={() => k.updateEdge(edge.id, { weight: w })}
          >
            {w}
          </button>
        ))}
      </span>
      <select
        className="net-role-select"
        value={edge.role ?? ''}
        onChange={(e) => k.updateEdge(edge.id, { role: e.target.value || undefined })}
        title="Rol en el que aplica esta interacción"
      >
        <option value="">Global</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
        ))}
      </select>
      <input
        key={edge.id + ':note'}
        className="net-note-input"
        defaultValue={edge.note ?? ''}
        placeholder="Nota…"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (edge.note ?? '')) k.updateEdge(edge.id, { note: v || undefined });
        }}
      />
      <button className="net-del-btn" title="Borrar interacción" onClick={() => k.removeEdge(edge.id)}>
        ×
      </button>
    </div>
  );
}

function EdgeGroup({ title, edges, focus }: { title: string; edges: KnowledgeEdge[]; focus: string }) {
  return (
    <div className="net-edge-group">
      <h3>{title} <span className="net-count">({edges.length})</span></h3>
      {edges.length === 0 ? (
        <div className="net-empty-group">Sin interacciones.</div>
      ) : (
        edges.map((e) => <EdgeRow key={e.id} edge={e} focus={focus} />)
      )}
    </div>
  );
}

interface RefData {
  counters: CounterStatRow[];
  synergy: SynergyStatRow[];
}

function RefWr({ wr }: { wr: number }) {
  const cls = wr >= 0.52 ? 'wr-good' : wr <= 0.48 ? 'wr-bad' : 'wr-even';
  return <span className={cls}>{(wr * 100).toFixed(1)}%</span>;
}

export function NetworkEditorPage() {
  const s = useStore();
  const k = useKnowledge();
  const [params, setParams] = useSearchParams();
  const champs = s.meta?.champions ?? [];

  const focus = params.get('champ') || 'all';
  const setFocus = (c: string) => setParams(c === 'all' ? {} : { champ: c }, { replace: true });

  const [view, setView] = useState<'editor' | 'graph'>('editor');

  // Formulario de nueva interacción
  const [rel, setRel] = useState<Relation>('synergy');
  const [target, setTarget] = useState('all');
  const [weight, setWeight] = useState<1 | 2 | 3>(2);
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Referencia: winrates reales del campeón foco (solo lectura)
  const [ref, setRef] = useState<RefData | null>(null);
  useEffect(() => {
    if (!s.region || focus === 'all') {
      setRef(null);
      return;
    }
    let cancel = false;
    const f = s.statFilter(focus);
    Promise.all([
      api.stats<CounterStatRow>('counters', s.region, f),
      api.stats<SynergyStatRow>('synergy', s.region, f),
    ])
      .then(([counters, synergy]) => {
        if (!cancel) setRef({ counters, synergy });
      })
      .catch(() => {
        if (!cancel) setRef(null);
      });
    return () => {
      cancel = true;
    };
  }, [s.region, s.statFilter, focus]);

  const { synergies, countersTo, counteredBy, related } = useMemo(() => {
    const synergies = k.net.edges.filter((e) => e.kind === 'synergy' && (e.a === focus || e.b === focus));
    const countersTo = k.net.edges.filter((e) => e.kind === 'counter' && e.a === focus);
    const counteredBy = k.net.edges.filter((e) => e.kind === 'counter' && e.b === focus);
    const related = new Set<string>();
    for (const e of [...synergies, ...countersTo, ...counteredBy]) related.add(e.a === focus ? e.b : e.a);
    return { synergies, countersTo, counteredBy, related };
  }, [k.net, focus]);

  const submit = () => {
    if (focus === 'all' || target === 'all') {
      setFormError('Elige el campeón foco y el campeón de la interacción');
      return;
    }
    const err = k.addEdge(toNewEdge(rel, focus, target, weight, role, note));
    setFormError(err);
    if (!err) {
      setTarget('all');
      setNote('');
    }
  };

  const prefill = (relation: Relation, champ: string) => {
    setRel(relation);
    setTarget(champ);
    setFormError(null);
  };

  const refCounters = useMemo(
    () => (ref ? [...ref.counters].sort((x, y) => y.games - x.games).slice(0, 20) : []),
    [ref],
  );
  const refSynergy = useMemo(
    () => (ref ? [...ref.synergy].sort((x, y) => y.games - x.games).slice(0, 20) : []),
    [ref],
  );

  return (
    <section className="rec-section">
      <div className="cv-header">
        <div>
          <div className="name">Red de conocimiento</div>
          <div className="meta">
            Codifica tus sinergias y counters entre campeones; la pestaña Pick completo puntúa tu pool con esta red
          </div>
        </div>
        <div className="net-status">
          {k.saving && <span className="net-saving">Guardando…</span>}
          {k.error && <span className="net-error">{k.error}</span>}
          <div className="rec-role-btns">
            <button className={`rec-role-btn ${view === 'editor' ? 'active' : ''}`} onClick={() => setView('editor')}>
              Editor
            </button>
            <button className={`rec-role-btn ${view === 'graph' ? 'active' : ''}`} onClick={() => setView('graph')}>
              Grafo ({k.net.edges.length})
            </button>
          </div>
        </div>
      </div>

      {view === 'graph' ? (
        <NetworkGraph
          net={k.net}
          focus={focus}
          onSelectChampion={(c) => {
            setFocus(c);
            setView('editor');
          }}
        />
      ) : (
        <>
          <div className="net-focus-row">
            <label className="rec-label">
              Campeón foco
              <ChampionSelect options={champs} value={focus} onChange={setFocus} placeholder="Elige un campeón…" />
            </label>
          </div>

          {focus === 'all' ? (
            <div className="empty">Elige un campeón para ver y editar sus interacciones.</div>
          ) : (
            <div className="net-editor-cols">
              <div className="net-editor-main">
                <div className="net-add-form">
                  <h3>Nueva interacción</h3>
                  <div className="net-add-row">
                    <span className="net-focus-chip">
                      <ChampionIcon name={focus} className="champ-opt-ico" />
                      {focus}
                    </span>
                    <select className="net-role-select" value={rel} onChange={(e) => setRel(e.target.value as Relation)}>
                      {(Object.keys(RELATION_LABEL) as Relation[]).map((r) => (
                        <option key={r} value={r}>{RELATION_LABEL[r]}</option>
                      ))}
                    </select>
                    <ChampionSelect
                      options={champs.filter((c) => c !== focus)}
                      value={target}
                      onChange={setTarget}
                      placeholder="Campeón…"
                    />
                    <span className="net-weight-btns">
                      {WEIGHTS.map((w) => (
                        <button
                          key={w}
                          className={`net-weight-btn ${weight === w ? 'active' : ''}`}
                          title={WEIGHT_TIP[w]}
                          onClick={() => setWeight(w)}
                        >
                          {w}
                        </button>
                      ))}
                    </span>
                    <select className="net-role-select" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="">Global</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
                      ))}
                    </select>
                    <input
                      className="net-note-input"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota (opcional)…"
                    />
                    <button className="rec-role-btn active" onClick={submit}>Añadir</button>
                  </div>
                  {formError && <div className="net-error">{formError}</div>}
                </div>

                <EdgeGroup title="Sinergias" edges={synergies} focus={focus} />
                <EdgeGroup title="Countea a" edges={countersTo} focus={focus} />
                <EdgeGroup title="Es counteado por" edges={counteredBy} focus={focus} />
              </div>

              <aside className="net-ref">
                <h3>Referencia (datos reales)</h3>
                <div className="meta">
                  Winrates de {focus} en la base según los filtros globales. No afectan al score: son para contrastar
                  tu conocimiento. «＋» pre-rellena el formulario.
                </div>
                {!s.region ? (
                  <div className="net-empty-group">Sin datos recolectados.</div>
                ) : !ref ? (
                  <div className="net-empty-group">Cargando…</div>
                ) : (
                  <>
                    <h4>vs rivales de carril</h4>
                    <table className="net-ref-table">
                      <tbody>
                        {refCounters.map((r) => (
                          <tr key={r.opponent} className={related.has(r.opponent) ? 'net-ref-linked' : ''}>
                            <td className="net-ref-champ">
                              <ChampionIcon name={r.opponent} lazy className="champ-opt-ico" />
                              {r.opponent}
                            </td>
                            <td><RefWr wr={r.winRate} /></td>
                            <td className="net-ref-games">{r.games} p.</td>
                            <td>
                              <button
                                className="net-add-mini"
                                title={`Añadir interacción con ${r.opponent}`}
                                onClick={() => prefill(r.winRate < 0.5 ? 'countered-by' : 'counters', r.opponent)}
                              >
                                ＋
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <h4>con aliados</h4>
                    <table className="net-ref-table">
                      <tbody>
                        {refSynergy.map((r) => (
                          <tr key={r.champion} className={related.has(r.champion) ? 'net-ref-linked' : ''}>
                            <td className="net-ref-champ">
                              <ChampionIcon name={r.champion} lazy className="champ-opt-ico" />
                              {r.champion}
                            </td>
                            <td><RefWr wr={r.winRate} /></td>
                            <td className="net-ref-games">{r.games} p.</td>
                            <td>
                              <button
                                className="net-add-mini"
                                title={`Añadir sinergia con ${r.champion}`}
                                onClick={() => prefill('synergy', r.champion)}
                              >
                                ＋
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  );
}
