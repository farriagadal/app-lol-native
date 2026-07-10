/**
 * Scoring de picks sobre la red de conocimiento manual: para cada candidato
 * del pool se suman los pesos de sinergia con los aliados y los de counter
 * contra/desde los enemigos, con desglose por arista para la UI. Todo es
 * client-side: la red completa vive en memoria (KBs).
 */
import type { KnowledgeEdge, KnowledgeNetwork } from '@ui';

export type ContributionReason = 'synergy' | 'counters' | 'countered-by';

export interface ScoreContribution {
  edge: KnowledgeEdge;
  /** El campeón del contexto (aliado o enemigo) que origina la contribución. */
  other: string;
  /** Valor firmado aplicado al total. */
  delta: number;
  reason: ContributionReason;
}

export interface NetworkScore {
  champion: string;
  total: number;
  contributions: ScoreContribution[];
}

export interface NetworkIndex {
  /** Sinergias por par normalizado "a|b" (a < b). */
  synergy: Map<string, KnowledgeEdge[]>;
  /** Counters direccionales "a|b" = a countea a b. */
  counter: Map<string, KnowledgeEdge[]>;
}

const pairKey = (x: string, y: string) => (x.localeCompare(y) <= 0 ? `${x}|${y}` : `${y}|${x}`);

export function buildIndex(net: KnowledgeNetwork): NetworkIndex {
  const synergy = new Map<string, KnowledgeEdge[]>();
  const counter = new Map<string, KnowledgeEdge[]>();
  for (const e of net.edges) {
    const map = e.kind === 'synergy' ? synergy : counter;
    const key = e.kind === 'synergy' ? pairKey(e.a, e.b) : `${e.a}|${e.b}`;
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return { synergy, counter };
}

/**
 * Elige la arista aplicable entre las candidatas de un par: la específica del
 * rol jugado gana sobre la global; con rol 'ALL' solo aplica la global.
 */
function pick(edges: KnowledgeEdge[] | undefined, role: string): KnowledgeEdge | undefined {
  if (!edges) return undefined;
  if (role !== 'ALL') {
    const specific = edges.find((e) => e.role === role);
    if (specific) return specific;
  }
  return edges.find((e) => !e.role);
}

export function scoreCandidate(
  idx: NetworkIndex,
  candidate: string,
  role: string,
  allies: string[],
  enemies: string[],
): NetworkScore {
  const contributions: ScoreContribution[] = [];

  for (const ally of allies) {
    if (ally === candidate) continue;
    const e = pick(idx.synergy.get(pairKey(candidate, ally)), role);
    if (e) contributions.push({ edge: e, other: ally, delta: e.weight, reason: 'synergy' });
  }

  for (const enemy of enemies) {
    if (enemy === candidate) continue;
    const wins = pick(idx.counter.get(`${candidate}|${enemy}`), role);
    if (wins) contributions.push({ edge: wins, other: enemy, delta: wins.weight, reason: 'counters' });
    const loses = pick(idx.counter.get(`${enemy}|${candidate}`), role);
    if (loses) contributions.push({ edge: loses, other: enemy, delta: -loses.weight, reason: 'countered-by' });
  }

  const total = contributions.reduce((acc, c) => acc + c.delta, 0);
  return { champion: candidate, total, contributions };
}

/** Puntúa todo el pool y ordena: total desc, con señales antes que sin señales, alfabético. */
export function scorePool(
  net: KnowledgeNetwork,
  pool: string[],
  role: string,
  allies: string[],
  enemies: string[],
): NetworkScore[] {
  const idx = buildIndex(net);
  return pool
    .map((c) => scoreCandidate(idx, c, role, allies, enemies))
    .sort(
      (x, y) =>
        y.total - x.total ||
        y.contributions.length - x.contributions.length ||
        x.champion.localeCompare(y.champion),
    );
}
