/** Páginas de items / runas / hechizos: tabla ordenable con celda por tipo. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ItemIcon,
  RuneIcons,
  SpellPair,
  StatTable,
  WinRate,
  pct,
  useAssets,
  ROLE_LABEL,
  TIER_LABEL,
  type Column,
  type ItemStatRow,
  type RuneStatRow,
  type SpellStatRow,
} from '@ui';
import { api } from '../api';
import { LS, useStore } from '../state/store';
import { ItemLink } from '../components/links';

type StatsKind = 'items' | 'runes' | 'spells';
type Row = (ItemStatRow | RuneStatRow | SpellStatRow) & { _name?: string };

const LABEL: Record<StatsKind, string> = { items: 'Item', runes: 'Runas', spells: 'Hechizos' };

export function StatsPage({ kind }: { kind: StatsKind }) {
  const s = useStore();
  const a = useAssets();
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<string>(() => LS.get('statsSortKey', 'games'));
  const [sortDir, setSortDir] = useState<1 | -1>(() =>
    LS.get('statsSortDir', 'desc') === 'asc' ? 1 : -1,
  );

  useEffect(() => {
    let cancel = false;
    if (!s.region) {
      setRows([]);
      return;
    }
    api.stats<Row>(kind, s.region, s.statFilter('all')).then((r) => {
      if (cancel) return;
      const filtered = kind === 'items' ? r.filter((x) => !a.isTrinketOrConsumable((x as ItemStatRow).item)) : r;
      setRows(filtered);
    });
    return () => {
      cancel = true;
    };
  }, [kind, s.region, s.patch, s.tier, s.role]);

  // Nombre legible para ordenar/mostrar (depende del resolver de Data Dragon).
  const nameOf = (r: Row): string => {
    if (kind === 'items') return a.itemName((r as ItemStatRow).item);
    if (kind === 'spells') {
      const sp = r as SpellStatRow;
      return `${a.spellName(sp.spell1)} + ${a.spellName(sp.spell2)}`;
    }
    return a.runeName((r as RuneStatRow).keystone);
  };

  const onSort = (k: string) => {
    if (k === sortKey) {
      const d = (sortDir * -1) as 1 | -1;
      setSortDir(d);
      LS.set('statsSortDir', d === 1 ? 'asc' : 'desc');
    } else {
      setSortKey(k);
      const d: 1 | -1 = k === '_name' ? 1 : -1;
      setSortDir(d);
      LS.set('statsSortKey', k);
      LS.set('statsSortDir', d === 1 ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const withName = rows.map((r) => ({ ...r, _name: nameOf(r) }));
    const dir = sortDir;
    withName.sort((x, y) => {
      const av = (x as any)[sortKey];
      const bv = (y as any)[sortKey];
      return typeof av === 'string' ? av.localeCompare(bv) * dir : (av - bv) * dir;
    });
    return withName;
    // nameOf depende de `a`; lo incluimos para recalcular al cargar Data Dragon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, a]);

  const firstCell = (r: Row): ReactNode => {
    if (kind === 'items') {
      const it = r as ItemStatRow;
      return (
        <ItemLink id={it.item} className="cell-ico cell-link">
          <ItemIcon id={it.item} lazy />
          <span>{a.itemName(it.item)}</span>
        </ItemLink>
      );
    }
    if (kind === 'spells') {
      const sp = r as SpellStatRow;
      return (
        <span className="cell-ico">
          <SpellPair s1={sp.spell1} s2={sp.spell2} />
          <span>
            {a.spellName(sp.spell1)} + {a.spellName(sp.spell2)}
          </span>
        </span>
      );
    }
    const rn = r as RuneStatRow;
    return (
      <span className="cell-ico">
        <RuneIcons keystone={rn.keystone} primary={rn.primaryStyle} sub={rn.subStyle} />
        <span>
          {a.runeName(rn.keystone)}{' '}
          <span className="sub">
            {a.runeName(rn.primaryStyle)} › {a.runeName(rn.subStyle)}
          </span>
        </span>
      </span>
    );
  };

  const columns: Column<Row & { _name: string }>[] = [
    { key: '_name', label: LABEL[kind], cell: firstCell },
    { key: 'games', label: 'Juegos', tdClass: 'num', cell: (r) => r.games },
    { key: 'winRate', label: 'Win %', tdClass: 'num', cell: (r) => <WinRate value={r.winRate} /> },
    { key: 'pickRate', label: 'Pick %', tdClass: 'num', cell: (r) => pct(r.pickRate) },
  ];

  const role = s.role === 'ALL' ? 'todos los roles' : ROLE_LABEL[s.role] || s.role;
  const tier = s.tier === 'all' ? 'todos los rangos' : TIER_LABEL[s.tier] || s.tier;
  const rowKey = (r: Row & { _name: string }, i: number): string => {
    if (kind === 'items') return 'i' + (r as ItemStatRow).item;
    if (kind === 'spells') return 's' + (r as SpellStatRow).spell1 + '-' + (r as SpellStatRow).spell2;
    return 'r' + i;
  };

  return (
    <div className="page">
      <div className="summary">
        <b>{sorted.length}</b> entradas · {role} · {tier} · parche {s.patch === 'all' ? 'todos' : s.patch}
      </div>
      <div className="table-host">
        {!s.region ? (
          <div className="empty">No hay datos. Recolecta primero.</div>
        ) : !sorted.length ? (
          <div className="empty">Sin datos para este filtro.</div>
        ) : (
          <StatTable
            columns={columns}
            rows={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            rowKey={rowKey}
          />
        )}
      </div>
    </div>
  );
}
