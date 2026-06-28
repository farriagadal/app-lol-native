/** Formateadores puros de presentación. Copiados de backoffice/public/app.js. */

/** Fracción 0..1 -> porcentaje con un decimal (sin el signo %). */
export function pct(x: number): string {
  return (x * 100).toFixed(1);
}

/** Clase CSS de color según el win rate (0..1): verde / neutro / rojo. */
export function wrClass(w: number): string {
  return w >= 0.52 ? 'wr-good' : w >= 0.485 ? 'wr-even' : 'wr-bad';
}

/** Redondea un KDA a 2 decimales de forma segura (admite null/undefined). */
export function kdaFixed(kda: number | null | undefined): string {
  return (kda || 0).toFixed(2);
}
