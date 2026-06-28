import { kdaFixed } from '../domain/format';

/** Línea de KDA "k / d / a  ratio" con la D resaltada en rojo. */
export function KDA({
  k,
  d,
  a,
  kda,
}: {
  k: number;
  d: number;
  a: number;
  kda: number | null | undefined;
}) {
  return (
    <span className="kda">
      {k} / <span className="kda-d">{d}</span> / {a} <span className="kda-r">{kdaFixed(kda)}</span>
    </span>
  );
}
