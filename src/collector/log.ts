/** Logger mínimo con marca de tiempo, sin dependencias. */

function ts(): string {
  // Hora local en formato HH:MM:SS para seguir el progreso de runs largos.
  return new Date().toTimeString().slice(0, 8);
}

export const log = {
  info(msg: string): void {
    console.log(`[${ts()}] ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`[${ts()}] ! ${msg}`);
  },
  error(msg: string): void {
    console.error(`[${ts()}] ✖ ${msg}`);
  },
};
