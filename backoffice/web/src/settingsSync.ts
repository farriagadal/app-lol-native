/**
 * Espejo del localStorage en la BD local del servidor (tabla settings de
 * data/settings.db). Al arrancar, la BD hidrata el localStorage (fuente de
 * verdad entre navegadores/reinstalaciones); después cada escritura se
 * replica al servidor en segundo plano (write-through, con debounce por clave).
 */

/** Claves completas de localStorage que se respaldan en la BD. */
const SYNCED_PREFIXES = ['bo:', 'bff.'];

const isSynced = (key: string) => SYNCED_PREFIXES.some((p) => key.startsWith(p));

const pending = new Map<string, string | null>();
let timer: number | null = null;

function flush(): void {
  timer = null;
  if (!pending.size) return;
  const entries = Object.fromEntries(pending);
  pending.clear();
  void fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  }).catch(() => {
    /* sin servidor: el localStorage sigue siendo el respaldo local */
  });
}

/** Replica una clave de localStorage a la BD (null = borrar). */
export function syncSetting(key: string, value: string | null): void {
  if (!isSynced(key)) return;
  pending.set(key, value);
  if (timer === null) timer = window.setTimeout(flush, 400);
}

/**
 * Carga la tabla settings y la vuelca al localStorage ANTES de montar React,
 * para que todos los useState(() => localStorage…) vean los valores de la BD.
 * Si el localStorage tiene claves sincronizables que la BD no conoce (primera
 * vez tras esta migración), se suben a la BD en vez de perderse.
 */
export async function hydrateSettings(): Promise<void> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const db: Record<string, string> = await res.json();

    // Subir claves locales que aún no están en la BD (migración inicial)
    const missing: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (isSynced(key) && !(key in db)) missing[key] = localStorage.getItem(key)!;
    }
    if (Object.keys(missing).length) {
      void fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missing),
      }).catch(() => {});
    }

    // La BD manda para el resto
    for (const [key, value] of Object.entries(db)) {
      try { localStorage.setItem(key, value); } catch { /* storage lleno/no disponible */ }
    }
  } catch {
    // servidor caído: se sigue con el localStorage tal cual
  }
}
