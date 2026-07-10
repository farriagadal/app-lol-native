/**
 * Grafo visual de la red de conocimiento: nodos = campeones con al menos una
 * arista, aristas verdes = sinergia y rojas = counter (con flecha de quién
 * countea a quién, grosor según peso). El layout se calcula con d3-force de
 * forma síncrona (N ticks al cambiar los datos) y se renderiza en SVG estático
 * — la red tiene decenas de nodos, no hace falta animación continua.
 */
import { useMemo, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { useAssets, ROLE_LABEL, type KnowledgeEdge, type KnowledgeNetwork } from '@ui';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const R = 22; // radio del nodo
const MARGIN = 40;

interface NodeDatum {
  id: string;
  x?: number;
  y?: number;
}

interface LinkDatum {
  source: NodeDatum;
  target: NodeDatum;
  edge: KnowledgeEdge;
}

interface Props {
  net: KnowledgeNetwork;
  /** 'all' = red completa; un campeón = solo su ego-grafo (él + vecinos). */
  focus: string;
  onSelectChampion?: (champ: string) => void;
}

function edgeTooltip(e: KnowledgeEdge): string {
  const rel = e.kind === 'synergy' ? `Sinergia ${e.a} + ${e.b}` : `${e.a} countea a ${e.b}`;
  const parts = [`${rel} · peso ${e.weight}`, e.role ? ROLE_LABEL[e.role] ?? e.role : 'Global'];
  if (e.note) parts.push(e.note);
  return parts.join(' · ');
}

export function NetworkGraph({ net, focus, onSelectChampion }: Props) {
  const a = useAssets();
  const [showSynergy, setShowSynergy] = useState(true);
  const [showCounter, setShowCounter] = useState(true);
  const [role, setRole] = useState('ALL');

  const { nodes, links, width, height } = useMemo(() => {
    let edges = net.edges.filter((e) => (e.kind === 'synergy' ? showSynergy : showCounter));
    if (role !== 'ALL') edges = edges.filter((e) => !e.role || e.role === role);
    if (focus !== 'all') edges = edges.filter((e) => e.a === focus || e.b === focus);

    const names = new Set<string>();
    for (const e of edges) {
      names.add(e.a);
      names.add(e.b);
    }
    const nodes: NodeDatum[] = [...names].sort().map((id) => ({ id }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: LinkDatum[] = edges.map((e) => ({
      source: byId.get(e.a)!,
      target: byId.get(e.b)!,
      edge: e,
    }));

    const n = nodes.length;
    const width = Math.max(680, Math.round(Math.sqrt(n || 1) * 190));
    const height = Math.max(440, Math.round(Math.sqrt(n || 1) * 140));
    if (n > 0) {
      // d3-force inicializa posiciones de forma determinista (filotaxis), así
      // que el mismo grafo produce siempre el mismo layout.
      const sim = forceSimulation(nodes)
        .force('link', forceLink<NodeDatum, LinkDatum>(links).distance(120).strength(0.5))
        .force('charge', forceManyBody().strength(-320))
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide(R + 16))
        .stop();
      for (let i = 0; i < 300; i++) sim.tick();
      for (const node of nodes) {
        node.x = Math.max(MARGIN, Math.min(width - MARGIN, node.x ?? width / 2));
        node.y = Math.max(MARGIN, Math.min(height - MARGIN, node.y ?? height / 2));
      }
    }
    return { nodes, links, width, height };
  }, [net, showSynergy, showCounter, role, focus]);

  return (
    <div className="net-graph">
      <div className="net-graph-controls">
        <label className="net-graph-check">
          <input type="checkbox" checked={showSynergy} onChange={(e) => setShowSynergy(e.target.checked)} />
          <span className="net-legend net-legend-syn" /> Sinergias
        </label>
        <label className="net-graph-check">
          <input type="checkbox" checked={showCounter} onChange={(e) => setShowCounter(e.target.checked)} />
          <span className="net-legend net-legend-ctr" /> Counters
        </label>
        <select className="net-role-select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="ALL">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
          ))}
        </select>
        <span className="net-graph-hint">
          {focus !== 'all' ? `Mostrando la red de ${focus}` : 'Clic en un nodo para editar ese campeón'}
        </span>
      </div>

      {nodes.length === 0 ? (
        <div className="empty">No hay interacciones que mostrar con los filtros actuales.</div>
      ) : (
        <svg className="net-graph-svg" viewBox={`0 0 ${width} ${height}`} role="img">
          <defs>
            <marker
              id="net-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="14"
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="net-arrow-head" />
            </marker>
          </defs>

          {links.map((l) => {
            const sx = l.source.x ?? 0;
            const sy = l.source.y ?? 0;
            const tx = l.target.x ?? 0;
            const ty = l.target.y ?? 0;
            const dx = tx - sx;
            const dy = ty - sy;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const isCounter = l.edge.kind === 'counter';
            // Recortar la línea al borde del nodo (y dejar hueco para la flecha)
            const x1 = sx + ux * R;
            const y1 = sy + uy * R;
            const x2 = tx - ux * (R + (isCounter ? 7 : 0));
            const y2 = ty - uy * (R + (isCounter ? 7 : 0));
            return (
              <line
                key={l.edge.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={isCounter ? 'net-edge net-edge-ctr' : 'net-edge net-edge-syn'}
                strokeWidth={1 + l.edge.weight * 1.3}
                strokeDasharray={l.edge.role ? '6 4' : undefined}
                markerEnd={isCounter ? 'url(#net-arrow)' : undefined}
              >
                <title>{edgeTooltip(l.edge)}</title>
              </line>
            );
          })}

          {nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              className="net-node"
              onClick={() => onSelectChampion?.(n.id)}
            >
              <clipPath id={`net-clip-${n.id}`}>
                <circle r={R} />
              </clipPath>
              <image
                href={a.champIcon(n.id)}
                x={-R}
                y={-R}
                width={R * 2}
                height={R * 2}
                clipPath={`url(#net-clip-${n.id})`}
              />
              <circle r={R} className={`net-node-ring${n.id === focus ? ' net-node-focus' : ''}`} />
              <text y={R + 15} textAnchor="middle" className="net-node-label">
                {n.id}
              </text>
              <title>{n.id}</title>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
