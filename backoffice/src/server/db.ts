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
  PlayerStatRow,
  CounterStatRow,
  SynergyStatRow,
  ItemGamesResponse,
  ItemGameRow,
  MatchDetail,
  MatchParticipantRow,
  MatchTeamObjectives,
  StreakPlayer,
  StreakGameRow,
  StreaksResponse,
} from './types';

// Versión usada solo si no hay red ni caché en disco; en cuanto haya internet
// el fetch en vivo la sustituye. Alineada con el último parche de los datos.
const DDRAGON_FALLBACK_VERSION = '16.9.1';

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

  private versionCacheFile(): string {
    return path.join(this.dataDir, 'ddragon-version.json');
  }

  /** manifest.json de la carpeta de assets compartida (raíz del repo). */
  private assetsManifestFile(): string {
    return path.resolve(process.cwd(), '..', 'assets', 'manifest.json');
  }

  /**
   * Última versión de Data Dragon (para construir URLs de iconos en la UI).
   * Prioriza la versión de los assets descargados (manifest.json) para que
   * coincida con lo servido en local; si no, intenta la red y cachea; en
   * último caso un fallback fijo. Nunca devuelve null para no dejar las
   * imágenes sin `src`.
   */
  async ddragonVersion(): Promise<string> {
    // 0) Versión de los assets descargados (fuente de verdad en local). Se lee
    //    SIEMPRE fresco (lectura barata) para no quedar con una versión vieja
    //    cacheada si los assets se descargan con el server ya en marcha.
    try {
      const man = JSON.parse(fs.readFileSync(this.assetsManifestFile(), 'utf8')) as { version?: string };
      if (man.version) return man.version;
    } catch { /* sin assets descargados todavía */ }
    if (this.ddVersion) return this.ddVersion;
    // 1) Red en vivo: si responde, fija y persiste para futuros arranques.
    try {
      const v = (await (
        await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      ).json()) as string[];
      if (v[0]) {
        this.ddVersion = v[0];
        try {
          fs.mkdirSync(this.dataDir, { recursive: true });
          fs.writeFileSync(this.versionCacheFile(), JSON.stringify({ version: v[0] }));
        } catch { /* la caché es best-effort */ }
        return this.ddVersion;
      }
    } catch { /* sin red: seguimos con la caché/fallback */ }
    // 2) Caché en disco de un arranque anterior con red.
    try {
      const cached = JSON.parse(fs.readFileSync(this.versionCacheFile(), 'utf8')) as { version?: string };
      if (cached.version) return (this.ddVersion = cached.version);
    } catch { /* no hay caché */ }
    // 3) Fallback fijo (versión reciente) para que el `src` nunca quede vacío.
    return (this.ddVersion = DDRAGON_FALLBACK_VERSION);
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

  private parsePatch(patch: string): string[] {
    if (!patch || patch === 'all') return [];
    return patch.split(',').filter(Boolean);
  }

  private patchClause(patches: string[], alias = 'm'): string {
    if (!patches.length) return '1=1';
    return `${alias}.patch IN (${patches.map((_, i) => `$p${i}`).join(', ')})`;
  }

  private patchBindings(patches: string[]): Record<string, string> {
    const r: Record<string, string> = {};
    patches.forEach((p, i) => { r[`$p${i}`] = p; });
    return r;
  }

  /** WHERE compartido por las páginas de items/runas/hechizos. */
  private scopeParams(f: StatFilter): Record<string, string> {
    const patches = this.parsePatch(f.patch);
    return {
      ...this.patchBindings(patches),
      $tier: f.tier,
      $role: f.role,
      $champion: f.champion,
      $dateFrom: f.dateFrom ?? '',
      $dateTo: f.dateTo ?? '',
    };
  }

  private get dateWhere(): string {
    return `($dateFrom = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') >= $dateFrom)
      AND ($dateTo = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') <= $dateTo)`;
  }

  private scopeClause(f: StatFilter): string {
    const patches = this.parsePatch(f.patch);
    return `p.team_position <> ''
      AND (${this.patchClause(patches)})
      AND ($tier = 'all' OR m.tier = $tier)
      AND ($role = 'ALL' OR p.team_position = $role)
      AND ($champion = 'all' OR p.champion_name = $champion)
      AND ${this.dateWhere}`;
  }

  async itemStats(region: string, f: StatFilter): Promise<ItemStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];
    const sql = `
      WITH scope AS (
        SELECT p.win win, p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)}
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

  /**
   * Partidas concretas en las que un participante llevó el ítem `item` en
   * cualquiera de sus 7 slots (item0..item6), respetando los filtros de scope.
   * Devuelve una página (limit/offset) ordenada por fecha desc y el total.
   */
  async itemGames(
    region: string,
    item: number,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<ItemGamesResponse> {
    const db = await this.open(region);
    if (!db) return { total: 0, games: [] };
    const itemWhere = `(p.item0 = $item OR p.item1 = $item OR p.item2 = $item
      OR p.item3 = $item OR p.item4 = $item OR p.item5 = $item OR p.item6 = $item)`;
    const where = `${this.scopeClause(f)} AND ${itemWhere}`;
    const params = { ...this.scopeParams(f), $item: String(item) };

    const totalRes = this.rows(
      db.exec(
        `SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE ${where}`,
        params,
      ),
    );
    const total = Number(totalRes[0]?.c ?? 0);

    const sql = `
      SELECT m.match_id, p.champion_name, p.team_position, p.win,
             p.kills, p.deaths, p.assists, p.kda, p.cs, p.kill_participation,
             m.game_duration, m.game_creation, m.tier,
             p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
             p.keystone, p.primary_style, p.sub_style, p.summoner1_id, p.summoner2_id
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${where}
      ORDER BY m.game_creation DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const games: ItemGameRow[] = this.rows(db.exec(sql, params)).map((r) => ({
      matchId: String(r.match_id),
      championName: String(r.champion_name),
      role: String(r.team_position),
      win: Number(r.win) === 1,
      kills: Number(r.kills),
      deaths: Number(r.deaths),
      assists: Number(r.assists),
      kda: Number(r.kda ?? 0),
      cs: Number(r.cs ?? 0),
      gameDuration: Number(r.game_duration ?? 0),
      gameCreation: Number(r.game_creation ?? 0),
      tier: r.tier == null ? null : String(r.tier),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
    }));
    return { total, games };
  }

  /** Scoreboard completo (10 jugadores) de una partida concreta. */
  async matchDetail(region: string, matchId: string): Promise<MatchDetail | null> {
    const db = await this.open(region);
    if (!db) return null;
    const mp = { $mid: matchId };
    const mrow = this.rows(db.exec('SELECT * FROM matches WHERE match_id = $mid', mp))[0];
    if (!mrow) return null;

    const participants: MatchParticipantRow[] = this.rows(
      db.exec(
        `SELECT team_id, participant_id, champion_name, team_position, riot_id, win,
                champ_level, kills, deaths, assists, kda, cs, kill_participation,
                dmg_to_champs, gold_earned,
                item0, item1, item2, item3, item4, item5, item6,
                summoner1_id, summoner2_id, keystone, primary_style, sub_style
         FROM participants WHERE match_id = $mid
         ORDER BY team_id, participant_id`,
        mp,
      ),
    ).map((r) => ({
      teamId: Number(r.team_id),
      participantId: Number(r.participant_id),
      championName: String(r.champion_name),
      role: String(r.team_position ?? ''),
      riotId: r.riot_id == null ? null : String(r.riot_id),
      win: Number(r.win) === 1,
      champLevel: Number(r.champ_level ?? 0),
      kills: Number(r.kills),
      deaths: Number(r.deaths),
      assists: Number(r.assists),
      kda: Number(r.kda ?? 0),
      cs: Number(r.cs ?? 0),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
      dmgToChamps: Number(r.dmg_to_champs ?? 0),
      goldEarned: Number(r.gold_earned ?? 0),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
    }));

    const teams: MatchTeamObjectives[] = this.rows(
      db.exec('SELECT * FROM team_objectives WHERE match_id = $mid ORDER BY team_id', mp),
    ).map((r) => ({
      teamId: Number(r.team_id),
      win: Number(r.win) === 1,
      baronKills: Number(r.baron_kills ?? 0),
      dragonKills: Number(r.dragon_kills ?? 0),
      riftHeraldKills: Number(r.rift_herald_kills ?? 0),
      towerKills: Number(r.tower_kills ?? 0),
      inhibitorKills: Number(r.inhibitor_kills ?? 0),
      championKills: Number(r.champion_kills ?? 0),
    }));

    return {
      matchId: String(mrow.match_id),
      patch: String(mrow.patch ?? ''),
      gameDuration: Number(mrow.game_duration ?? 0),
      gameCreation: Number(mrow.game_creation ?? 0),
      winningTeam: mrow.winning_team == null ? null : Number(mrow.winning_team),
      tier: mrow.tier == null ? null : String(mrow.tier),
      participants,
      teams,
    };
  }

  async spellStats(region: string, f: StatFilter): Promise<SpellStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];
    const sql = `
      WITH scope AS (
        SELECT p.win win,
          MIN(p.summoner1_id, p.summoner2_id) s1, MAX(p.summoner1_id, p.summoner2_id) s2
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)} AND p.summoner1_id > 0 AND p.summoner2_id > 0
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

  /** Jugadores que más han jugado el campeón del filtro. */
  async playerStats(region: string, f: StatFilter): Promise<PlayerStatRow[]> {
    const db = await this.open(region);
    if (!db || f.champion === 'all') return [];
    const sql = `
      WITH scope AS (
        SELECT p.puuid, p.riot_id, p.win, p.kda
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)}
      )
      SELECT MAX(riot_id) riot_id, COUNT(*) games, SUM(win) wins,
             ROUND(AVG(win), 4) win_rate, ROUND(AVG(kda), 2) kda
      FROM scope GROUP BY puuid ORDER BY games DESC, wins DESC LIMIT 25`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      riotId: r.riot_id == null ? null : String(r.riot_id),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      kda: Number(r.kda),
    }));
  }

  /** Campeones rivales en el mismo rol (counters), con win/pick rate. */
  async counterStats(region: string, f: StatFilter): Promise<CounterStatRow[]> {
    const db = await this.open(region);
    if (!db || f.champion === 'all') return [];
    const patches = this.parsePatch(f.patch);
    const patchW = this.patchClause(patches);
    const sql = `
      WITH base AS (
        SELECT p1.win win, p2.champion_name opp
        FROM participants p1
        JOIN participants p2 ON p2.match_id = p1.match_id
          AND p2.team_position = p1.team_position
          AND p2.team_id <> p1.team_id
        JOIN matches m ON m.match_id = p1.match_id
        WHERE p1.champion_name = $champion AND p1.team_position <> ''
          AND (${patchW})
          AND ($tier = 'all' OR m.tier = $tier)
          AND ($role = 'ALL' OR p1.team_position = $role)
      ),
      tot AS (SELECT COUNT(*) c FROM base)
      SELECT opp opponent, COUNT(*) games, SUM(win) wins,
             ROUND(AVG(win), 4) win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tot), 4) pick_rate
      FROM base GROUP BY opp ORDER BY games DESC LIMIT 25`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      opponent: String(r.opponent),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
    }));
  }

  /** Compañeros de equipo con mejor win rate junto al campeón (sinergia/duo). */
  async synergyStats(region: string, f: StatFilter): Promise<SynergyStatRow[]> {
    const db = await this.open(region);
    if (!db || f.champion === 'all') return [];
    const patches = this.parsePatch(f.patch);
    const patchW = this.patchClause(patches);
    const sql = `
      WITH base AS (
        SELECT p1.win win, p2.champion_name mate
        FROM participants p1
        JOIN participants p2 ON p2.match_id = p1.match_id
          AND p2.team_id = p1.team_id
          AND p2.participant_id <> p1.participant_id
        JOIN matches m ON m.match_id = p1.match_id
        WHERE p1.champion_name = $champion AND p1.team_position <> ''
          AND (${patchW})
          AND ($tier = 'all' OR m.tier = $tier)
          AND ($role = 'ALL' OR p1.team_position = $role)
      ),
      tot AS (SELECT COUNT(*) c FROM base)
      SELECT mate champion, COUNT(*) games, SUM(win) wins,
             ROUND(AVG(win), 4) win_rate,
             ROUND(COUNT(*) * 1.0 / (SELECT c FROM tot), 4) pick_rate
      FROM base GROUP BY mate ORDER BY win_rate DESC, games DESC LIMIT 25`;
    return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
      champion: String(r.champion),
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
        WHERE ${this.scopeClause(f)} AND p.keystone IS NOT NULL
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

  async champions(region: string, patch = 'all', tier = 'all', dateFrom = '', dateTo = ''): Promise<ChampionStatRow[]> {
    const db = await this.open(region);
    if (!db) return [];

    const patches = this.parsePatch(patch);
    const patchW = this.patchClause(patches);
    const dateW = `($dateFrom = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') >= $dateFrom)
        AND ($dateTo = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') <= $dateTo)`;
    const sql = `
      WITH tg AS (
        SELECT COUNT(*) c FROM matches m
        WHERE (${patchW}) AND ($tier = 'all' OR m.tier = $tier)
          AND ${dateW}
      ),
      bn AS (
        SELECT b.champion_name cn, COUNT(*) c
        FROM bans b JOIN matches m ON m.match_id = b.match_id
        WHERE (${patchW}) AND ($tier = 'all' OR m.tier = $tier)
          AND ${dateW}
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
        AND (${patchW}) AND ($tier = 'all' OR m.tier = $tier)
        AND ${dateW}
      GROUP BY p.champion_name, p.team_position`;

    return this.rows(db.exec(sql, { ...this.patchBindings(patches), $tier: tier, $dateFrom: dateFrom, $dateTo: dateTo })).map((r) => ({
      championName: String(r.champion_name),
      role: String(r.role),
      games: Number(r.games),
      wins: Number(r.wins),
      winRate: Number(r.win_rate),
      pickRate: Number(r.pick_rate),
      banRate: Number(r.ban_rate),
    }));
  }

  /**
   * Jugadores con rachas de victorias más largas en el scope filtrado.
   * Devuelve paginación por jugadores + todas sus partidas (para resaltar la racha).
   */
  async streaks(
    region: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<StreaksResponse> {
    const db = await this.open(region);
    if (!db) return { total: 0, players: [], matches: [] };

    const params = this.scopeParams(f);

    const playerSql = `
      WITH scoped AS (
        SELECT p.puuid, p.riot_id, p.win, m.game_creation
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)}
      ),
      rn AS (
        SELECT puuid, win, game_creation,
          ROW_NUMBER() OVER (PARTITION BY puuid ORDER BY game_creation) -
          ROW_NUMBER() OVER (PARTITION BY puuid, win ORDER BY game_creation) AS grp
        FROM scoped
      ),
      streak_sizes AS (
        SELECT puuid, win, grp, COUNT(*) len FROM rn GROUP BY puuid, win, grp
      ),
      player_win_streak AS (
        SELECT puuid, MAX(len) longest_win_streak
        FROM streak_sizes WHERE win = 1 GROUP BY puuid
      ),
      player_totals AS (
        SELECT puuid, MAX(riot_id) riot_id, COUNT(*) total_games, SUM(win) wins
        FROM scoped GROUP BY puuid
      ),
      player_stats AS (
        SELECT t.puuid, t.riot_id, t.total_games, t.wins,
               COALESCE(w.longest_win_streak, 0) longest_win_streak
        FROM player_totals t LEFT JOIN player_win_streak w ON w.puuid = t.puuid
      )
      SELECT (SELECT COUNT(*) FROM player_stats) total_count, p.*
      FROM player_stats p
      ORDER BY p.longest_win_streak DESC, p.total_games DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const playerRows = this.rows(db.exec(playerSql, params));
    const total = Number(playerRows[0]?.total_count ?? 0);
    const players: StreakPlayer[] = playerRows.map((r) => ({
      puuid: String(r.puuid),
      riotId: r.riot_id == null ? '' : String(r.riot_id),
      longestWinStreak: Number(r.longest_win_streak),
      totalGames: Number(r.total_games),
      wins: Number(r.wins),
    }));

    if (!players.length) return { total, players, matches: [] };

    // Embebemos los puuids directamente (vienen de nuestra propia BD, no de usuario).
    const puuidList = players.map((p) => `'${p.puuid.replace(/'/g, "''")}'`).join(',');
    const matchSql = `
      SELECT p.puuid, m.match_id, p.champion_name, p.team_position, p.win,
             p.kills, p.deaths, p.assists, p.kda, p.cs, p.kill_participation,
             m.game_duration, m.game_creation, m.tier,
             p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
             p.keystone, p.primary_style, p.sub_style, p.summoner1_id, p.summoner2_id
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE p.puuid IN (${puuidList}) AND ${this.scopeClause(f)}
      ORDER BY p.puuid, m.game_creation DESC`;

    const matches: StreakGameRow[] = this.rows(db.exec(matchSql, params)).map((r) => ({
      puuid: String(r.puuid),
      matchId: String(r.match_id),
      championName: String(r.champion_name),
      role: String(r.team_position),
      win: Number(r.win) === 1,
      kills: Number(r.kills),
      deaths: Number(r.deaths),
      assists: Number(r.assists),
      kda: Number(r.kda ?? 0),
      cs: Number(r.cs ?? 0),
      gameDuration: Number(r.game_duration ?? 0),
      gameCreation: Number(r.game_creation ?? 0),
      tier: r.tier == null ? null : String(r.tier),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
    }));

    return { total, players, matches };
  }
}
