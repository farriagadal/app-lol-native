/**
 * Estado compartido de la red de conocimiento manual (sinergias/counters).
 * Carga el documento completo de GET /api/knowledge una vez y persiste cada
 * mutación con PUT debounced (el documento es pequeño: KBs). Editor, ranking
 * y grafo consumen la misma copia en memoria.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { KnowledgeEdge, KnowledgeNetwork } from '@ui';
import { api } from '../api';

export type NewEdge = Omit<KnowledgeEdge, 'id' | 'updatedAt'>;

interface Knowledge {
  net: KnowledgeNetwork;
  ready: boolean;
  saving: boolean;
  error: string | null;
  /** Devuelve mensaje de error (duplicado/mismo campeón) o null si se añadió. */
  addEdge: (e: NewEdge) => string | null;
  updateEdge: (id: string, patch: Partial<NewEdge>) => void;
  removeEdge: (id: string) => void;
}

const KnowledgeContext = createContext<Knowledge | null>(null);

export const useKnowledge = (): Knowledge => {
  const ctx = useContext(KnowledgeContext);
  if (!ctx) throw new Error('useKnowledge fuera de <KnowledgeProvider>');
  return ctx;
};

/** Normaliza una arista: en synergy el par se guarda con a < b. */
function normalize<T extends { kind: string; a: string; b: string }>(e: T): T {
  if (e.kind === 'synergy' && e.a.localeCompare(e.b) > 0) return { ...e, a: e.b, b: e.a };
  return e;
}

const edgeKey = (e: { kind: string; a: string; b: string; role?: string }) =>
  `${e.kind}|${e.a}|${e.b}|${e.role ?? ''}`;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'e' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
}

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const [net, setNet] = useState<KnowledgeNetwork>({ version: 1, edges: [] });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancel = false;
    api
      .knowledgeGet()
      .then((n) => {
        if (!cancel && n && Array.isArray(n.edges)) setNet(n);
      })
      .catch(() => setError('No se pudo cargar la red de conocimiento'))
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const scheduleSave = useCallback((next: KnowledgeNetwork) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      setSaving(true);
      api
        .knowledgeSave(next)
        .then(() => setError(null))
        .catch((err) => setError(err instanceof Error ? err.message : 'Error al guardar'))
        .finally(() => setSaving(false));
    }, 500);
  }, []);

  const mutate = useCallback(
    (fn: (edges: KnowledgeEdge[]) => KnowledgeEdge[]) => {
      setNet((cur) => {
        const next: KnowledgeNetwork = { version: 1, edges: fn(cur.edges) };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const addEdge = useCallback(
    (input: NewEdge): string | null => {
      const e = normalize(input);
      if (e.a === e.b) return 'Elige dos campeones distintos';
      const key = edgeKey(e);
      if (net.edges.some((x) => edgeKey(x) === key)) return 'Esa interacción ya existe';
      mutate((edges) => [...edges, { ...e, id: newId(), updatedAt: new Date().toISOString() }]);
      return null;
    },
    [net.edges, mutate],
  );

  const updateEdge = useCallback(
    (id: string, patch: Partial<NewEdge>) => {
      mutate((edges) =>
        edges.map((e) =>
          e.id === id ? normalize({ ...e, ...patch, updatedAt: new Date().toISOString() }) : e,
        ),
      );
    },
    [mutate],
  );

  const removeEdge = useCallback(
    (id: string) => {
      mutate((edges) => edges.filter((e) => e.id !== id));
    },
    [mutate],
  );

  return (
    <KnowledgeContext.Provider value={{ net, ready, saving, error, addEdge, updateEdge, removeEdge }}>
      {children}
    </KnowledgeContext.Provider>
  );
}
