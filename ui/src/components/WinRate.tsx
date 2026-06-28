import { pct, wrClass } from '../domain/format';

/** Win rate (0..1) coloreado: verde/neutro/rojo. Opcionalmente con sufijo "%". */
export function WinRate({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <span className={wrClass(value)}>
      {pct(value)}
      {suffix}
    </span>
  );
}
