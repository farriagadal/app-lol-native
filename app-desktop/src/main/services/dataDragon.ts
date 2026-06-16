import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const COMMUNITY_DRAGON = 'https://raw.communitydragon.org';

export interface ChampionSummary {
  key: number;       // id numérico (championId que usan las APIs)
  id: string;        // id textual (p.ej. "MonkeyKing")
  name: string;      // nombre mostrado (p.ej. "Wukong")
  title: string;
  tags: string[];    // roles: Fighter, Mage, ...
}

export interface ItemSummary {
  id: number;
  name: string;
  gold: number;
  tags: string[];
}

/** Progreso de una descarga de assets, emitido hacia la UI. */
export interface AssetsProgress {
  phase: 'check' | 'data' | 'icons' | 'done' | 'up-to-date';
  version: string | null;
  done: number;
  total: number;
}

/** Resumen del estado de assets para mostrarlo en Ajustes. */
export interface AssetsInfo {
  version: string | null;   // versión instalada en disco
  latest: string | null;    // última versión conocida (si se ha comprobado)
  ready: boolean;           // hay iconos descargados y servibles en local
}

type ProgressFn = (p: AssetsProgress) => void;

/**
 * Encapsula el acceso a Data Dragon manteniendo una copia local persistente
 * (JSON + iconos) en disco. Tras la primera descarga, todo se sirve desde
 * `file://` y no se vuelve a contactar a Riot hasta que el usuario actualiza.
 */
export class DataDragon {
  private version: string | null = null;
  private latestKnown: string | null = null;
  private assetsReady = false;
  private champsByKey = new Map<number, ChampionSummary>();
  private champsById = new Map<string, ChampionSummary>();
  private items = new Map<number, ItemSummary>();
  private cacheDir: string;
  private readonly locale: string;

  constructor(locale = 'es_ES', cacheDir?: string) {
    this.locale = locale;
    this.cacheDir = cacheDir ?? path.join(os.tmpdir(), 'lol-overlay-ddragon-cache');
  }

  /** Permite fijar el directorio (p.ej. userData) antes de `init()`. */
  setCacheDir(dir: string): void {
    this.cacheDir = dir;
  }

  getVersion(): string | null {
    return this.version;
  }

  isReady(): boolean {
    return this.assetsReady;
  }

  info(): AssetsInfo {
    return { version: this.version, latest: this.latestKnown, ready: this.assetsReady };
  }

  /* --------------------------- Rutas en disco --------------------------- */

  private get metaFile(): string {
    return path.join(this.cacheDir, 'installed.json');
  }
  /** Manifiesto de la carpeta compartida (assets/manifest.json, junto a cdn/). */
  private get sharedManifestFile(): string {
    return path.join(path.dirname(this.cacheDir), 'manifest.json');
  }
  private verDir(v: string): string {
    return path.join(this.cacheDir, v);
  }
  // JSON con el layout de Data Dragon (data/<locale>/…), igual que descarga
  // scripts/download-assets.mjs, para compartir la carpeta con el back office.
  private champJsonFile(v: string): string {
    return path.join(this.verDir(v), 'data', this.locale, 'champion.json');
  }
  private itemJsonFile(v: string): string {
    return path.join(this.verDir(v), 'data', this.locale, 'item.json');
  }
  private champIconFile(v: string, id: string): string {
    return path.join(this.verDir(v), 'img', 'champion', `${id}.png`);
  }
  private itemIconFile(v: string, id: number): string {
    return path.join(this.verDir(v), 'img', 'item', `${id}.png`);
  }

  /* ------------------------------- Init ------------------------------- */

  /**
   * Carga la copia local si existe (sin red). Solo si no hay nada instalado
   * descarga por primera vez desde Riot.
   */
  async init(onProgress?: ProgressFn): Promise<void> {
    await fsp.mkdir(this.cacheDir, { recursive: true }).catch(() => {});

    const installed = await this.readMeta();
    if (installed && (await this.loadFromDisk(installed))) {
      this.version = installed;
      this.assetsReady = await this.iconsPresent(installed);
      // Si los iconos no están completos, los completamos en segundo plano.
      if (!this.assetsReady) void this.downloadIcons(installed, onProgress).catch(() => {});
      return;
    }

    // Primer arranque: descargamos los JSON (rápido) y dejamos los iconos en
    // segundo plano. Mientras tanto los iconos se sirven por URL remota, así
    // que la UI no queda con placeholders.
    const latest = await this.fetchLatestVersion();
    this.latestKnown = latest;
    await this.ensureData(latest);
    void this.downloadIcons(latest, onProgress).catch(() => {});
  }

  private async readMeta(): Promise<string | null> {
    // 1) Carpeta compartida poblada por el script (assets/manifest.json).
    try {
      const raw = await fsp.readFile(this.sharedManifestFile, 'utf8');
      const man = JSON.parse(raw) as { version?: string };
      if (man.version) return man.version;
    } catch { /* sin manifest compartido */ }
    // 2) Descarga propia previa de la app (installed.json).
    try {
      const raw = await fsp.readFile(this.metaFile, 'utf8');
      const meta = JSON.parse(raw) as { version?: string };
      return meta.version ?? null;
    } catch {
      return null;
    }
  }

  /** Comprueba (a grosso modo) que los iconos ya están descargados. */
  private async iconsPresent(v: string): Promise<boolean> {
    const anyChamp = this.champsById.keys().next().value as string | undefined;
    if (!anyChamp) return false;
    try {
      await fsp.access(this.champIconFile(v, anyChamp));
      return true;
    } catch {
      return false;
    }
  }

  /* ------------------------------ Update ------------------------------ */

  /**
   * Comprueba la última versión en Riot; si difiere de la instalada (o se
   * fuerza), descarga JSON e iconos a disco. Devuelve la versión resultante
   * y si hubo cambios. Es la operación detrás del botón "Actualizar assets".
   */
  async update(
    onProgress?: ProgressFn,
    opts: { force?: boolean } = {},
  ): Promise<{ version: string; updated: boolean }> {
    const emit = (p: AssetsProgress) => onProgress?.(p);

    emit({ phase: 'check', version: this.version, done: 0, total: 0 });
    const latest = await this.fetchLatestVersion();
    this.latestKnown = latest;

    if (!opts.force && latest === this.version && this.assetsReady) {
      emit({ phase: 'up-to-date', version: latest, done: 0, total: 0 });
      return { version: latest, updated: false };
    }

    // 1) Datos JSON (rápido): deja la versión utilizable de inmediato.
    emit({ phase: 'data', version: latest, done: 0, total: 2 });
    await this.ensureData(latest, emit);

    // 2) Iconos (campeones + ítems) — aquí sí esperamos a que terminen.
    await this.downloadIcons(latest, emit);

    // 3) Limpieza best-effort de versiones antiguas.
    await this.pruneOldVersions(latest).catch(() => {});

    return { version: latest, updated: true };
  }

  /**
   * Descarga y parsea los JSON de campeones e ítems, fija la versión activa y
   * persiste el puntero. Tras esto los lookups y las URL (remotas) funcionan.
   */
  private async ensureData(v: string, emit?: ProgressFn): Promise<void> {
    await fsp.mkdir(path.join(this.verDir(v), 'data', this.locale), { recursive: true });
    await fsp.mkdir(path.join(this.verDir(v), 'img', 'champion'), { recursive: true });
    await fsp.mkdir(path.join(this.verDir(v), 'img', 'item'), { recursive: true });

    const champRaw = await this.fetchJson<ChampionFile>(
      `${DDRAGON}/cdn/${v}/data/${this.locale}/champion.json`,
    );
    await fsp.writeFile(this.champJsonFile(v), JSON.stringify(champRaw), 'utf8');
    emit?.({ phase: 'data', version: v, done: 1, total: 2 });

    const itemRaw = await this.fetchJson<ItemFile>(
      `${DDRAGON}/cdn/${v}/data/${this.locale}/item.json`,
    );
    await fsp.writeFile(this.itemJsonFile(v), JSON.stringify(itemRaw), 'utf8');
    emit?.({ phase: 'data', version: v, done: 2, total: 2 });

    this.parseChampions(champRaw);
    this.parseItems(itemRaw);

    // La versión ya es usable (iconos remotos hasta que bajen los locales).
    this.version = v;
    await fsp.writeFile(this.metaFile, JSON.stringify({ version: v }), 'utf8');
  }

  /** Descarga todos los iconos a disco y, al terminar, activa el modo local. */
  private async downloadIcons(v: string, emit?: ProgressFn): Promise<void> {
    await fsp.mkdir(path.join(this.verDir(v), 'img', 'champion'), { recursive: true });
    await fsp.mkdir(path.join(this.verDir(v), 'img', 'item'), { recursive: true });

    const champIds = [...this.champsById.keys()];
    const itemIds = [...this.items.keys()];
    const total = champIds.length + itemIds.length;
    let done = 0;
    emit?.({ phase: 'icons', version: v, done, total });

    const tasks: Array<() => Promise<void>> = [];
    for (const id of champIds) {
      tasks.push(async () => {
        await this.downloadFile(
          `${DDRAGON}/cdn/${v}/img/champion/${id}.png`,
          this.champIconFile(v, id),
        );
        emit?.({ phase: 'icons', version: v, done: ++done, total });
      });
    }
    for (const id of itemIds) {
      tasks.push(async () => {
        await this.downloadFile(
          `${DDRAGON}/cdn/${v}/img/item/${id}.png`,
          this.itemIconFile(v, id),
        );
        emit?.({ phase: 'icons', version: v, done: ++done, total });
      });
    }
    await runPool(tasks, 12);

    this.assetsReady = true;
    emit?.({ phase: 'done', version: v, done: total, total });
  }

  /** Borra carpetas de versiones distintas a la activa. */
  private async pruneOldVersions(keep: string): Promise<void> {
    const entries = await fsp.readdir(this.cacheDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name !== keep && /^\d/.test(e.name)) {
        await fsp.rm(path.join(this.cacheDir, e.name), { recursive: true, force: true });
      }
    }
  }

  /* ------------------------------ Carga ------------------------------ */

  private async loadFromDisk(v: string): Promise<boolean> {
    try {
      const champRaw = JSON.parse(await fsp.readFile(this.champJsonFile(v), 'utf8')) as ChampionFile;
      const itemRaw = JSON.parse(await fsp.readFile(this.itemJsonFile(v), 'utf8')) as ItemFile;
      this.parseChampions(champRaw);
      this.parseItems(itemRaw);
      return true;
    } catch {
      return false;
    }
  }

  private parseChampions(json: ChampionFile): void {
    this.champsByKey.clear();
    this.champsById.clear();
    for (const c of Object.values(json.data)) {
      const summary: ChampionSummary = {
        key: Number(c.key),
        id: c.id,
        name: c.name,
        title: c.title,
        tags: c.tags ?? [],
      };
      this.champsByKey.set(summary.key, summary);
      this.champsById.set(summary.id, summary);
    }
  }

  private parseItems(json: ItemFile): void {
    this.items.clear();
    for (const [idStr, it] of Object.entries(json.data)) {
      const id = Number(idStr);
      this.items.set(id, {
        id,
        name: it.name,
        gold: it.gold?.total ?? 0,
        tags: it.tags ?? [],
      });
    }
  }

  /* ------------------------------- Red ------------------------------- */

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Data Dragon ${res.status} en ${url}`);
    return (await res.json()) as T;
  }

  private async fetchLatestVersion(): Promise<string> {
    const versions = await this.fetchJson<string[]>(`${DDRAGON}/api/versions.json`);
    return versions[0];
  }

  /** Descarga un binario a disco (idempotente: omite si ya existe). */
  private async downloadFile(url: string, dest: string): Promise<void> {
    try {
      await fsp.access(dest);
      return; // ya descargado
    } catch {
      // no existe, continuamos
    }
    const res = await fetch(url);
    if (!res.ok) {
      // Algunos ítems del JSON no tienen icono (consumibles ocultos, etc.).
      if (res.status === 404) return;
      throw new Error(`Asset ${res.status} en ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(dest, buf);
  }

  /* --------------------------- Lookups --------------------------- */

  championByKey(key: number): ChampionSummary | undefined {
    return this.champsByKey.get(key);
  }

  championById(id: string): ChampionSummary | undefined {
    return this.champsById.get(id);
  }

  /** Resuelve por nombre mostrado (insensible a may/min y espacios). */
  championByName(name: string): ChampionSummary | undefined {
    const norm = name.toLowerCase().replace(/[^a-z]/g, '');
    for (const c of this.champsByKey.values()) {
      if (c.name.toLowerCase().replace(/[^a-z]/g, '') === norm) return c;
      if (c.id.toLowerCase() === norm) return c;
    }
    return undefined;
  }

  item(id: number): ItemSummary | undefined {
    return this.items.get(id);
  }

  /* --------------------------- URLs de imágenes --------------------------- */

  /** Devuelve el icono local (`file://`) si está descargado; si no, el remoto. */
  championIconUrl(id: string): string | null {
    if (!this.version) return null;
    if (this.assetsReady) return pathToFileURL(this.champIconFile(this.version, id)).href;
    return `${DDRAGON}/cdn/${this.version}/img/champion/${id}.png`;
  }

  itemIconUrl(itemId: number): string | null {
    if (!this.version) return null;
    if (this.assetsReady) return pathToFileURL(this.itemIconFile(this.version, itemId)).href;
    return `${DDRAGON}/cdn/${this.version}/img/item/${itemId}.png`;
  }

  /** Splash de Community Dragon (útil para fondos en champ select). */
  championSplashUrl(key: number): string {
    return `${COMMUNITY_DRAGON}/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${key}.png`;
  }

  allChampions(): ChampionSummary[] {
    return [...this.champsByKey.values()];
  }
}

/* ------------------------------ Tipos JSON ------------------------------ */

interface ChampionFile {
  data: Record<
    string,
    { key: string; id: string; name: string; title: string; tags: string[] }
  >;
}

interface ItemFile {
  data: Record<string, { name: string; gold: { total: number }; tags: string[] }>;
}

/* ------------------------------ Utilidades ------------------------------ */

/** Ejecuta `tasks` con como mucho `limit` en paralelo. */
async function runPool(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      try {
        await tasks[idx]();
      } catch {
        // Un icono que falle no debe abortar toda la descarga.
      }
    }
  });
  await Promise.all(workers);
}
