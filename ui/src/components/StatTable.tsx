/**
 * Tabla genérica ordenable (controlada). El padre decide el orden de `rows` y
 * conserva sortKey/sortDir; la tabla solo pinta y avisa con onSort al pulsar una
 * cabecera. Cubre la tabla de campeones y las de items/runas/hechizos.
 */
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  /** Clase del <td> (p.ej. "num", "role-cell"). La 1ª columna suele ir sin clase. */
  tdClass?: string;
  cell: (row: T) => ReactNode;
}

export function StatTable<T>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  rowKey,
  tableClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  sortKey: string;
  /** 1 = ascendente, -1 = descendente. */
  sortDir: 1 | -1;
  onSort: (key: string) => void;
  rowKey: (row: T, index: number) => string | number;
  tableClassName?: string;
}) {
  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          {columns.map((c) => {
            const sorted = sortKey === c.key ? ' sorted' + (sortDir === 1 ? ' asc' : '') : '';
            return (
              <th key={c.key} className={sorted.trim()} onClick={() => onSort(c.key)}>
                {c.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={rowKey(r, i)}>
            {columns.map((c) => (
              <td key={c.key} className={c.tdClass}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
