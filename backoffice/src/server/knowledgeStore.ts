/**
 * Persistencia de la red de conocimiento manual (sinergias/counters).
 * Documento JSON completo en knowledge/champion-network.json — fuera de data/
 * porque data/ se regenera desde el colector y este conocimiento es del
 * analista (debe poder versionarse en git). Escritura atómica (tmp + rename).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeEdge, KnowledgeNetwork } from './types';

const ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

const EMPTY: KnowledgeNetwork = { version: 1, edges: [] };

/** Clave lógica de unicidad de una arista. */
function edgeKey(e: KnowledgeEdge): string {
  return `${e.kind}|${e.a}|${e.b}|${e.role ?? ''}`;
}

/** Valida el documento completo; lanza Error con mensaje claro si algo no cuadra. */
export function validateNetwork(net: unknown): KnowledgeNetwork {
  if (!net || typeof net !== 'object' || Array.isArray(net)) throw new Error('el documento debe ser un objeto');
  const doc = net as Record<string, unknown>;
  if (doc.version !== 1) throw new Error('version debe ser 1');
  if (!Array.isArray(doc.edges)) throw new Error('edges debe ser un array');

  const seen = new Set<string>();
  const edges: KnowledgeEdge[] = doc.edges.map((raw, i) => {
    const at = `edges[${i}]`;
    if (!raw || typeof raw !== 'object') throw new Error(`${at}: debe ser un objeto`);
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id) throw new Error(`${at}: falta id`);
    if (e.kind !== 'synergy' && e.kind !== 'counter') throw new Error(`${at}: kind debe ser synergy|counter`);
    if (typeof e.a !== 'string' || !e.a) throw new Error(`${at}: falta campeón a`);
    if (typeof e.b !== 'string' || !e.b) throw new Error(`${at}: falta campeón b`);
    if (e.a === e.b) throw new Error(`${at}: a y b no pueden ser el mismo campeón (${e.a})`);
    if (e.weight !== 1 && e.weight !== 2 && e.weight !== 3) throw new Error(`${at}: weight debe ser 1, 2 o 3`);
    if (e.role !== undefined && (typeof e.role !== 'string' || !ROLES.has(e.role)))
      throw new Error(`${at}: role inválido (${String(e.role)})`);
    if (e.note !== undefined && typeof e.note !== 'string') throw new Error(`${at}: note debe ser texto`);

    // Sinergia simétrica: almacenar siempre con a < b para que no haya duplicados espejo.
    let a = e.a, b = e.b;
    if (e.kind === 'synergy' && a.localeCompare(b) > 0) [a, b] = [b, a];

    const edge: KnowledgeEdge = {
      id: e.id,
      kind: e.kind,
      a,
      b,
      weight: e.weight,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date().toISOString(),
    };
    if (e.role !== undefined) edge.role = e.role as string;
    if (typeof e.note === 'string' && e.note.trim()) edge.note = e.note.trim();

    const key = edgeKey(edge);
    if (seen.has(key)) {
      const rel = edge.kind === 'synergy' ? `${edge.a} + ${edge.b}` : `${edge.a} → ${edge.b}`;
      throw new Error(`${at}: arista duplicada (${edge.kind} ${rel}${edge.role ? ' en ' + edge.role : ''})`);
    }
    seen.add(key);
    return edge;
  });

  return { version: 1, edges };
}

export class KnowledgeStore {
  private readonly file: string;

  constructor(baseDir: string) {
    this.file = path.join(baseDir, 'champion-network.json');
    fs.mkdirSync(baseDir, { recursive: true });
  }

  load(): KnowledgeNetwork {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return validateNetwork(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY, edges: [] };
      // Archivo corrupto: no lo pisamos en silencio; avisar y servir vacío.
      console.warn(`[knowledge] ${this.file} ilegible: ${err instanceof Error ? err.message : err}`);
      return { ...EMPTY, edges: [] };
    }
  }

  save(net: unknown): KnowledgeNetwork {
    const valid = validateNetwork(net);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(valid, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    return valid;
  }
}
