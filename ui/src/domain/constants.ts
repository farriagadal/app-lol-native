/**
 * Constantes de dominio (roles y rangos de League of Legends). Puras: sin
 * dependencias de runtime, reutilizables tanto en el back office como en la app
 * Electron. Copiadas del antiguo backoffice/public/app.js.
 */

/** Roles/líneas en orden de presentación. El primero ('ALL') es el comodín. */
export const ROLES: ReadonlyArray<readonly [string, string]> = [
  ['ALL', 'Todos'], ['TOP', 'Top'], ['JUNGLE', 'Jungla'],
  ['MIDDLE', 'Mid'], ['BOTTOM', 'ADC'], ['UTILITY', 'Support'],
];
export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map(([k, v]) => [k, v]));

/** Rangos competitivos, de mayor a menor. */
export const TIERS: ReadonlyArray<readonly [string, string]> = [
  ['CHALLENGER', 'Challenger'], ['GRANDMASTER', 'Grandmaster'], ['MASTER', 'Master'],
  ['DIAMOND', 'Diamante'], ['EMERALD', 'Esmeralda'], ['PLATINUM', 'Platino'],
  ['GOLD', 'Oro'], ['SILVER', 'Plata'], ['BRONZE', 'Bronce'], ['IRON', 'Hierro'],
];
export const TIER_LABEL: Record<string, string> = Object.fromEntries(TIERS.map(([k, v]) => [k, v]));
export const TIER_ORDER: Record<string, number> = Object.fromEntries(TIERS.map(([k], i) => [k, i]));

/** Clave de icono (CommunityDragon) y orden de columnas para cada rol. */
export const ROLE_KEY: Record<string, string> = {
  TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility',
};
export const ROLE_ORDER: Record<string, number> = {
  TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4,
};

export const ROLE_TIP: Record<string, string> = {
  TOP: 'Top — Línea superior. Suelen jugar luchadores y tanques en duelos 1v1.',
  JUNGLE: 'Jungla — Sin línea fija; controla la jungla, hace ganks y objetivos.',
  MIDDLE: 'Mid — Línea central. Magos y asesinos de alto impacto.',
  BOTTOM: 'ADC — Línea inferior. Tirador de daño físico sostenido.',
  UTILITY: 'Support — Acompaña al ADC: protege, inicia y aporta visión.',
};

export const TIER_TIP: Record<string, string> = {
  IRON: 'Hierro — El rango más bajo de la escalera competitiva.',
  BRONZE: 'Bronce — Por encima de Hierro; jugadores en aprendizaje.',
  SILVER: 'Plata — Rango intermedio-bajo, de los más poblados.',
  GOLD: 'Oro — Rango medio; nivel de juego sólido.',
  PLATINUM: 'Platino — Por encima de la media; buena mecánica y macro.',
  EMERALD: 'Esmeralda — Introducido en 2023, entre Platino y Diamante.',
  DIAMOND: 'Diamante — Élite; aproximadamente el top 1-2%.',
  MASTER: 'Maestro — Alto nivel competitivo, sin divisiones.',
  GRANDMASTER: 'Gran Maestro — Por encima de Maestro; los mejores en LP.',
  CHALLENGER: 'Challenger — La cúspide: los mejores del servidor.',
};
