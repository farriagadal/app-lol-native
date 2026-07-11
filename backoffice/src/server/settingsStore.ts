/**
 * Preferencias del panel web persistidas en la BD local: espejo de lo que la
 * UI guarda en localStorage (filtros, API key, pools, perfil, etc.). Vive en
 * data/settings.db, un archivo SQLite propio — separado de data/<region>/lol.db
 * porque esas bases se regeneran completas con buildDb y borrarían la tabla.
 */
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';

export class SettingsStore {
  private db: Database | null = null;
  private opening: Promise<Database> | null = null;

  constructor(private dataDir: string) {}

  private file(): string {
    return path.join(this.dataDir, 'settings.db');
  }

  private async open(): Promise<Database> {
    if (this.db) return this.db;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
      const SQL = await initSqlJs({ locateFile: () => wasmPath });
      const file = this.file();
      const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
      db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      this.db = db;
      return db;
    })();
    try { return await this.opening; } finally { this.opening = null; }
  }

  private persist(db: Database): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file(), Buffer.from(db.export()));
  }

  async getAll(): Promise<Record<string, string>> {
    const db = await this.open();
    const res = db.exec('SELECT key, value FROM settings');
    const out: Record<string, string> = {};
    for (const row of res[0]?.values ?? []) out[String(row[0])] = String(row[1]);
    return out;
  }

  /** value null/undefined elimina la clave. */
  async set(entries: Record<string, string | null>): Promise<void> {
    const db = await this.open();
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === undefined) {
        db.run('DELETE FROM settings WHERE key = ?', [key]);
      } else {
        db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
      }
    }
    this.persist(db);
  }
}
