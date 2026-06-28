/** Página de campeones: tabla ordenable + subfiltros (buscar, sliders). */
import { useEffect, useMemo, useState } from 'react';
import {
  ChampionIcon,
  RoleIcon,
  ROLE_LABEL,
  ROLE_ORDER,
  ROLE_TIP,
  StatTable,
  WinRate,
  pct,
  type ChampionStatRow,
  type Column,
} from '@ui';
import { api } from '../api';
import { LS, useStore } from '../state/store';
import { ChampLink } from '../components/links';

type SortKey = 'championName' | 'role' | 'games' | 'winRate' | 'pickRate' | 'banRate';

export function ChampionsPage() {
  const s = useStore();
  const [rows, setRows] = useState<ChampionStatRow[]>([]);
  const [search, setSearch] = useState('');
  const [minGames, setMinGames] = useState(() => Number(LS.get('minGames', '1')));
  const [minWR, setMinWR] = useState(() => Number(LS.get('minWR', '0')));
  const [sortKey, setSortKey] = useState<SortKey>(() => LS.get('sortKey', 'games') as SortKey);
  const [sortDir, setSortDir] = useState<1 | -1>(() => (LS.get('sortDir', 'desc') === 'asc' ? 1 : -1));

  // Carga al cambiar región/parche/rango.
  useEffect(() => {
    let cancel = false;
    if (!s.region) {
      setRows([]);
      return;
    }
    api.champions(s.region, s.patch, s.tier).then((r) => {
      if (!cancel) setRows(r);
    });
    return () => {
      cancel = true;
    };
  }, [s.region, s.patch, s.tier]);

  const onSort = (k: string) => {
    if (k === sortKey) {
      const d = (sortDir * -1) as 1 | -1;
      setSortDir(d);
      LS.set('sortDir', d === 1 ? 'asc' : 'desc');
    } else {
      setSortKey(k as SortKey);
      const d: 1 | -1 = k === 'championName' ? 1 : -1;
      setSortDir(d);
      LS.set('sortKey', k);
      LS.set('sortDir', d === 1 ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (s.role === 'ALL' || r.role === s.role) &&
        r.games >= minGames &&
        r.winRate * 100 >= minWR &&
        (!q || r.championName.toLowerCase().includes(q)),
    );
    const dir = sortDir;
    out.sort((a, b) => {
      if (sortKey === 'role') return ((ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)) * dir;
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      return typeof av === 'string' ? av.localeCompare(bv as string) * dir : (av - (bv as number)) * dir;
    });
    return out;
  }, [rows, search, minGames, minWR, s.role, sortKey, sortDir]);

  const columns: Column<ChampionStatRow>[] = [
    {
      key: 'championName',
      label: 'Campeón',
      cell: (r) => (
        <ChampLink name={r.championName} className="champ">
          <ChampionIcon name={r.championName} lazy />
          <span className="champ-name">{r.championName}</span>
        </ChampLink>
      ),
    },
    {
      key: 'role',
      label: 'Rol',
      tdClass: 'role-cell',
      cell: (r) => (
        <span title={ROLE_TIP[r.role] || ''}>
          <RoleIcon role={r.role} className="role-ic" />
          {ROLE_LABEL[r.role] || r.role}
        </span>
      ),
    },
    { key: 'games', label: 'Juegos', tdClass: 'num', cell: (r) => r.games },
    { key: 'winRate', label: 'Win %', tdClass: 'num', cell: (r) => <WinRate value={r.winRate} /> },
    { key: 'pickRate', label: 'Pick %', tdClass: 'num', cell: (r) => pct(r.pickRate) },
    { key: 'banRate', label: 'Ban %', tdClass: 'num', cell: (r) => pct(r.banRate) },
  ];

  return (
    <div className="page">
      <div className="subfilters">
        <label>
          Buscar
          <input type="search" placeholder="Campeón…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="slider">
          <div className="slider-top">
            <span>Mín. juegos</span>
            <b>{minGames}</b>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={minGames}
            onChange={(e) => {
              setMinGames(Number(e.target.value));
              LS.set('minGames', e.target.value);
            }}
          />
        </div>
        <div className="slider">
          <div className="slider-top">
            <span>WR mín. %</span>
            <b>{minWR}</b>
          </div>
          <input
            type="range"
            min={0}
            max={60}
            value={minWR}
            onChange={(e) => {
              setMinWR(Number(e.target.value));
              LS.set('minWR', e.target.value);
            }}
          />
        </div>
      </div>

      <div className="summary">
        <b>{filtered.length}</b> campeones · parche {s.patch === 'all' ? 'todos' : s.patch}
      </div>

      <div className="table-host">
        {!s.region ? (
          <div className="empty">
            No hay datos. Ve a la pestaña <b>Recolección</b> para descargar partidas.
          </div>
        ) : !filtered.length ? (
          <div className="empty">Ningún campeón pasa los filtros.</div>
        ) : (
          <StatTable
            columns={columns}
            rows={filtered}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            rowKey={(r) => r.championName + r.role}
          />
        )}
      </div>
    </div>
  );
}
