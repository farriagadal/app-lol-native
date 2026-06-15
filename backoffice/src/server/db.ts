import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type QueryExecResult } from 'sql.js';
import type {
  ChampionStatRow,
  AnalyticsMeta,
  StatFilter,
  ItemStatRow,
  SpellStatRow,
  RuneStatRow,
} from './types';

/**
 * Lee las bases SQLite (data/<region>/lol.db) y responde consultas para el
 * panel. Cachea la base por región e invalida tras reconstruirla.
 */
export class StatsDb {
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private cache = new Map<string, Database>();
  private ddVersion: string | null = null;

  constructor(private dataDir: string) {}

  private async sql(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
    if (this.SQL) return this.SQL;
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    this.SQL = await initSqlJs({ locateFile: () => wasmPath });
    return this.SQL;
  }

  private dbPath(region: string): string {
    return path.join(this.dataDir, region, 'lol.db');
  }

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

  reload(region?: string): void {
    if (region) {
      this.cache.get(region)?.close();
      this.cache.delete(region);
    } else {
      for (const db of this.cache.values()) db.close();
      this.cache.clear();
    }
  }

  /** Última versión de Data Dragon (para construir URLs de iconos en la UI). */
  async ddragonVersion(): Promise<string | null> {
    if (this.ddVersion) return this.ddVersion;
    try {
      const v = (await (
        await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      ).json()) as string[];
      this.ddVersion = v[0] ?? null;
    } catch {
      this.ddVersion = null;
    }
    return this.ddVersion;
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
    const ddragonVersion = await this.ddragonVersion();
    if (!active) {
      return { regions, region: null, patches: [], tiers: [], champions: [], totalGames: 0, totalParticipants: 0, ddragonVersion };
    }
    const db = await this.open(active);
    if (!db) {
      return { regions, region: null, patches: [], tiers: [], champions: [], totalGames: 0, totalParticipants: 0, ddragonVersion };
    }

    const m = this.rows(db.exec('SELECT * FROM v_meta'))[0] ?? {};
    const patches = this.rows(
      db.exec('SELECT DISTINCT patch FROM matches ORDER BY patch DESC'),
    ).map((r) => String(r.patch));
    const tiers = this.rows(
      db.exec("SELECT DISTINCT tier FROM matches WHERE tier IS NOT NULL ORDER BY tier"),
    ).map((r) => String(r.tier));
    const champions = this.rows(
      db.exec("SELECT DISTINCT champion_name FROM participants WHERE team_position <> '' ORDER BY champion_name"),
    ).map((r) => String(r.champion_name));

    return {
      regions,
      region: active,
      patches,
      tiers,
      champions,
      totalGames: Number(m.total_games ?? 0),
      totalParticipants: Number(m.total_participants ?? 0),
      ddragonVersion,
    };
  }

  /** WHERE compartido por las páginas de items/runas/hechizos. */
  private scopeParams(f: StatFilter): Record<string, string> {
    return { $patch: f.patch, $tier: f.tier, $role: f.role, $champion: f.champion };
  }
  private get scopeWhere(): string {
    return `p.team_position <> ''
      AND ($patch = 'all' OR m.patch = $patch)
      AND ($tier = 'all' OR m.tier = $tier)
      AND ($role = 'ALL' OR p.team_position = $role)
      AND ($champion = 'all' OR p.champion_name = $champion)`;
  }

  async itemStats(region: string, f: StatFilter): Promise<ItemStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];
    const sql = `
      WITH scope AS (
        SELECT p.win win, p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeWhere}
      ),
      tot AS (SELECT COUNT(*) c FROM scope),
      it AS (
        SELECT item0 item, win FROM scope WHERE item0 > 0
        UNION ALL SELECT item1, win FROM scope WHERE item1 > 0
        UNION ALL SELECT item2, win FROM scope WHERE item2 > 0
        UNION ALL SELECT item3, win FROM scope WHERE item3 > 0
        UNION ALL SELECT item4, win FROM scope WHERE item4 > 0
        UNION ALL SELECT item5, win FROM scope WHERE item5 > 0
        UNION ALL SELECT item6, win FROM scope WHERE item6 > 0
      )
      SELECT item, COUNT(*) games, SUM(win) wins, ROUND(AVG(win), 4) win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tot), 4) pick_rate
      FROM it GROUP BY item ORDER BY games DESC LIMIT 80`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      item: Number(r.item),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
    }));
  }

  async spellStats(region: string, f: StatFilter): Promise<SpellStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];
    const sql = `
      WITH scope AS (
        SELECT p.win win,
          MIN(p.summoner1_id, p.summoner2_id) s1, MAX(p.summoner1_id, p.summoner2_id) s2
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeWhere} AND p.summoner1_id > 0 AND p.summoner2_id > 0
      ),
      tot AS (SELECT COUNT(*) c FROM scope)
      SELECT s1, s2, COUNT(*) games, SUM(win) wins, ROUND(AVG(win), 4) win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tot), 4) pick_rate
      FROM scope GROUP BY s1, s2 ORDER BY games DESC LIMIT 40`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      spell1: Number(r.s1),
      spell2: Number(r.s2),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
    }));
  }

  async runeStats(region: string, f: StatFilter): Promise<RuneStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];
    const sql = `
      WITH scope AS (
        SELECT p.win win, p.keystone, p.primary_style, p.sub_style
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeWhere} AND p.keystone IS NOT NULL
      ),
      tot AS (SELECT COUNT(*) c FROM scope)
      SELECT keystone, primary_style, sub_style, COUNT(*) games, SUM(win) wins,
             ROUND(AVG(win), 4) win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tot), 4) pick_rate
      FROM scope GROUP BY keystone, primary_style, sub_style ORDER BY games DESC LIMIT 40`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      keystone: Number(r.keystone),
      primaryStyle: Number(r.primary_style),
      subStyle: Number(r.sub_style),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
    }));
  }

  async champions(region: string, patch = 'all', tier = 'all'): Promise<ChampionStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];

    const sql = `
      WITH tg AS (
        SELECT COUNT(*) c FROM matches m
        WHERE ($patch = 'all' OR m.patch = $patch) AND ($tier = 'all' OR m.tier = $tier)
      ),
      bn AS (
        SELECT b.champion_name cn, COUNT(*) c
        FROM bans b JOIN matches m ON m.match_id = b.match_id
        WHERE ($patch = 'all' OR m.patch = $patch) AND ($tier = 'all' OR m.tier = $tier)
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
      WHERE p.team_position <> ''
        AND ($patch = 'all' OR m.patch = $patch) AND ($tier = 'all' OR m.tier = $tier)
      GROUP BY p.champion_name, p.team_position`;

    return this.rows(db.exec(sql, { $patch: patch, $tier: tier })).map((r) => ({
      championName: String(r.champion_name),
      role: String(r.role),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
      banRate: Number(r.ban_rate),
    }));
  }
}
