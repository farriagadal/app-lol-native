/**
 * Estado global del back office: filtros (región/parche/rango/rol/campeón),
 * metadatos, lista de regiones/servidores y datos de Data Dragon. Persiste los
 * filtros en localStorage (prefijo "bo:") igual que el app.js original y expone
 * el AssetResolver a la librería ui/ vía <AssetsProvider>.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AssetsProvider,
  createAssetResolver,
  type AnalyticsMeta,
  type DataDragonDicts,
  type StatFilter,
} from '@ui';
import { api, type RegionsResponse } from '../api';
import { checkAssets, loadDataDragon } from '../datadragon';

export const LS = {
  get: (k: string, d = ''): string => {
    try {
      return localStorage.getItem('bo:' + k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem('bo:' + k, v);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

const EMPTY_DD: DataDragonDicts = { items: {}, spells: {}, runes: {} };

interface Store {
  // filtros
  region: string;
  patch: string;
  tier: string;
  role: string;
  champion: string;
  dateFrom: string;
  dateTo: string;
  setRegion: (v: string) => void;
  setPatch: (v: string) => void;
  setTier: (v: string) => void;
  setRole: (v: string) => void;
  setChampion: (v: string) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  /** Filtro común para las consultas de stats (con el campeón indicado). */
  statFilter: (champion?: string) => StatFilter;
  // metadatos / catálogos
  meta: AnalyticsMeta | null;
  dataRegions: string[];
  servers: { key: string; label: string }[];
  ddVersion: string | null;
  ready: boolean; // regiones cargadas al menos una vez
  reloadRegions: () => Promise<string[]>;
}

const StoreContext = createContext<Store | null>(null);
export const useStore = (): Store => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fuera de <StoreProvider>');
  return ctx;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [region, setRegionRaw] = useState(() => LS.get('region', 'all'));
  const [patch, setPatchRaw] = useState(() => LS.get('patch', 'all'));
  const [tier, setTierRaw] = useState(() => LS.get('tier', 'all'));
  const [role, setRoleRaw] = useState(() => LS.get('role', 'ALL'));
  const [champion, setChampionRaw] = useState(() => LS.get('champion', 'all'));
  const [dateFrom, setDateFromRaw] = useState(() => LS.get('dateFrom', ''));
  const [dateTo, setDateToRaw] = useState(() => LS.get('dateTo', ''));

  const [meta, setMeta] = useState<AnalyticsMeta | null>(null);
  const [dataRegions, setDataRegions] = useState<string[]>([]);
  const [servers, setServers] = useState<{ key: string; label: string }[]>([]);
  const [ready, setReady] = useState(false);

  const [assetsLocal, setAssetsLocal] = useState(false);
  const [ddVersion, setDdVersion] = useState<string | null>(null);
  const [dd, setDd] = useState<DataDragonDicts>(EMPTY_DD);

  // setters que persisten
  const persist = useCallback((key: string, set: (v: string) => void) => {
    return (v: string) => {
      set(v);
      LS.set(key, v);
    };
  }, []);
  const setRegion = useMemo(() => persist('region', setRegionRaw), [persist]);
  const setPatch = useMemo(() => persist('patch', setPatchRaw), [persist]);
  const setTier = useMemo(() => persist('tier', setTierRaw), [persist]);
  const setRole = useMemo(() => persist('role', setRoleRaw), [persist]);
  const setChampion = useMemo(() => persist('champion', setChampionRaw), [persist]);
  const setDateFrom = useMemo(() => persist('dateFrom', setDateFromRaw), [persist]);
  const setDateTo = useMemo(() => persist('dateTo', setDateToRaw), [persist]);

  const reloadRegions = useCallback(async (): Promise<string[]> => {
    const reg: RegionsResponse = await api.regions();
    setServers(reg.servers);
    setDataRegions(reg.dataRegions);
    setReady(true);
    return reg.dataRegions;
  }, []);

  // Arranque: assets locales + regiones.
  useEffect(() => {
    checkAssets().then(setAssetsLocal);
    reloadRegions().then((regions) => {
      setRegionRaw((cur) => {
        // '' (valor antiguo) y 'all' son siempre válidos.
        if (!cur) { LS.set('region', 'all'); return 'all'; }
        if (cur === 'all') return cur;
        // Validar cada región en la lista separada por comas.
        const selected = cur.split(',');
        const valid = selected.filter((r) => regions.includes(r));
        if (valid.length === selected.length) return cur;
        const next = valid.length ? valid.join(',') : 'all';
        LS.set('region', next);
        return next;
      });
    });
  }, [reloadRegions]);

  // Cargar metadatos al cambiar de región (y reconciliar filtros).
  // 'all' → todas las regiones disponibles; coma-separado → solo esas.
  useEffect(() => {
    let cancel = false;
    api.meta(region || 'all').then((m) => {
      if (cancel) return;
      setMeta(m);
      setDdVersion(m.ddragonVersion);
      if (patch !== 'all' && patch) {
        const valid = patch.split(',').filter((p) => m.patches.includes(p));
        if (!valid.length) setPatch('all');
        else if (valid.join(',') !== patch) setPatch(valid.join(','));
      }
      if (tier !== 'all' && tier) {
        const valid = tier.split(',').filter((t) => (m.tiers || []).includes(t));
        if (!valid.length) setTier('all');
        else if (valid.join(',') !== tier) setTier(valid.join(','));
      }
      if (champion !== 'all' && !(m.champions || []).includes(champion)) setChampion('all');
    });
    return () => {
      cancel = true;
    };
    // Solo depende de la región; los filtros se reconcilian dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  // Cargar Data Dragon cuando se conoce la versión.
  useEffect(() => {
    if (!ddVersion) {
      setDd(EMPTY_DD);
      return;
    }
    let cancel = false;
    loadDataDragon(assetsLocal, ddVersion).then((d) => {
      if (!cancel) setDd(d);
    });
    return () => {
      cancel = true;
    };
  }, [ddVersion, assetsLocal]);

  const resolver = useMemo(
    () => createAssetResolver({ local: assetsLocal, ddVersion, dd }),
    [assetsLocal, ddVersion, dd],
  );

  const statFilter = useCallback(
    (champ: string = 'all'): StatFilter => ({
      patch,
      tier,
      role,
      champion: champ,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [patch, tier, role, dateFrom, dateTo],
  );

  const value: Store = {
    region,
    patch,
    tier,
    role,
    champion,
    dateFrom,
    dateTo,
    setRegion,
    setPatch,
    setTier,
    setRole,
    setChampion,
    setDateFrom,
    setDateTo,
    statFilter,
    meta,
    dataRegions,
    servers,
    ddVersion,
    ready,
    reloadRegions,
  };

  return (
    <StoreContext.Provider value={value}>
      <AssetsProvider resolver={resolver}>{children}</AssetsProvider>
    </StoreContext.Provider>
  );
}
