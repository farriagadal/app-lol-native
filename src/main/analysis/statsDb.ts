import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type QueryExecResult } from 'sql.js';
import type { ChampionStatRow, AnalyticsMeta } from '../../shared/types';
import type { DataDragon } from '../services/dataDragon';

/**
 * Lee las bases SQLite generadas por el colector (data/<region>/lol.db) y
 * responde consultas para el back office. Cachea la base por región.
 *
 * El filtrado fino (rol, búsqueda, mín. juegos, orden, rangos) lo hace el
 * renderer en cliente sobre el conjunto devuelto; aquí resolvemos región y
 * parche (que requieren tocar SQL) y enriquecemos con el icono local del campeón.
 */
export class StatsDb {
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private cache = new Map<string, Database>();

  constructor(
    private ddragon: DataDragon,
    private dataDir = path.resolve(process.cwd(), 'data'),
  ) {}

  private async sql(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
    if (this.SQL) return this.SQL;
    // El .wasm vive junto al paquete; require.resolve lo localiza en dev y empaquetado.
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    this.SQL = await initSqlJs({ locateFile: () => wasmPath });
    return this.SQL;
  }

  private dbPath(region: string): string {
    return path.join(this.dataDir, region, 'lol.db');
  }

  /** Regiones con un lol.db disponible en disco. */
  regions(): string[] {
    if (!fs.existsSync(this.dataDir)) return [];
    return fs
      .readdirSync(this.dataDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(this.dbPath(e.name)))
      .map((e) => e.name)
      .sort();
  }

  private async open(region: string): Promise<Database | null> {
    if (this.cache.has(region)) return this.cache.get(region)!;
    const file = this.dbPath(region);
    if (!fs.existsSync(file)) return null;
    const SQL = await this.sql();
    const db = new SQL.Database(fs.readFileSync(file));
    this.cache.set(region, db);
    return db;
  }

  /** Invalida la cache (p.ej. tras reconstruir la base). */
  reload(region?: string): void {
    if (region) {
      this.cache.get(region)?.close();
      this.cache.delete(region);
    } else {
      for (const db of this.cache.values()) db.close();
      this.cache.clear();
    }
  }

  private rows(res: QueryExecResult[]): Array<Record<string, number | string | null>> {
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((row) => {
      const o: Record<string, number | string | null> = {};
      columns.forEach((c, i) => {
        const v = row[i];
        o[c] = v instanceof Uint8Array ? null : v;
      });
      return o;
    });
  }

  async meta(region?: string): Promise<AnalyticsMeta> {
    const regions = this.regions();
    const active = region && regions.includes(region) ? region : regions[0] ?? null;
    if (!active) {
      return { regions, region: null, patches: [], totalGames: 0, totalParticipants: 0 };
    }
    const db = await this.open(active);
    if (!db) return { regions, region: null, patches: [], totalGames: 0, totalParticipants: 0 };

    const m = this.rows(db.exec('SELECT * FROM v_meta'))[0] ?? {};
    const patches = this.rows(
      db.exec('SELECT DISTINCT patch FROM matches ORDER BY patch DESC'),
    ).map((r) => String(r.patch));

    return {
      regions,
      region: active,
      patches,
      totalGames: Number(m.total_games ?? 0),
      totalParticipants: Number(m.total_participants ?? 0),
    };
  }

  /** Filas por campeón+rol para una región y parche ('all' = todos). */
  async champions(region: string, patch = 'all'): Promise<ChampionStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];

    const sql = `
      WITH tg AS (
        SELECT COUNT(*) c FROM matches m WHERE ($patch = 'all' OR m.patch = $patch)
      ),
      bn AS (
        SELECT b.champion_name cn, COUNT(*) c
        FROM bans b JOIN matches m ON m.match_id = b.match_id
        WHERE ($patch = 'all' OR m.patch = $patch)
        GROUP BY b.champion_name
      )
      SELECT p.champion_name AS champion_name,
             p.team_position AS role,
             COUNT(*) AS games,
             SUM(p.win) AS wins,
             ROUND(AVG(p.win), 4) AS win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tg), 4) AS pick_rate,
             ROUND(COALESCE((SELECT c FROM bn WHERE cn = p.champion_name), 0)
                   * 1.0 / (SELECT c FROM tg), 4) AS ban_rate
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE p.team_position <> '' AND ($patch = 'all' OR m.patch = $patch)
      GROUP BY p.champion_name, p.team_position`;

    return this.rows(db.exec(sql, { $patch: patch })).map((r) => {
      const championName = String(r.champion_name);
      return {
        championName,
        iconUrl: this.ddragon.championIconUrl(championName),
        role: String(r.role),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.win_rate),
        pickRate: Number(r.pick_rate),
        banRate: Number(r.ban_rate),
      };
    });
  }
}
