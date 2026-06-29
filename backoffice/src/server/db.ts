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
  PlayerGamesResponse,
  ItemGameRow,
  MatchDetail,
  MatchParticipantRow,
  MatchTeamObjectives,
  StreakGameRow,
  StreaksResponse,
} from './types';

// Versión usada solo si no hay red ni caché en disco; en cuanto haya internet
// el fetch en vivo la sustituye. Alineada con el último parche de los datos.
const DDRAGON_FALLBACK_VERSION = '16.9.1';

/**
 * Lee las bases SQLite (data/<region>/lol.db) y responde consultas para el
 * panel. Cachea la base por región e invalida tras reconstruirla.
 * Acepta region como clave única, lista separada por comas o 'all' (todas).
 */
export class StatsDb {
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private cache = new Map<string, Database>();
  private opening = new Map<string, Promise<Database | null>>();
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
    const pending = this.opening.get(region);
    if (pending) return pending;
    const promise = this._openFile(region);
    this.opening.set(region, promise);
    try { return await promise; } finally { this.opening.delete(region); }
  }

  private async _openFile(region: string): Promise<Database | null> {
    const file = this.dbPath(region);
    if (!fs.existsSync(file)) return null;
    const SQL = await this.sql();
    const t0 = Date.now();
    const buf = fs.readFileSync(file);
    const db = new SQL.Database(buf);
    console.log(`[db] open ${region} (${(buf.length / 1024 / 1024).toFixed(1)} MB) [${Date.now() - t0}ms]`);
    this.cache.set(region, db);
    return db;
  }

  reload(region?: string): void {
    if (region) {
      this.cache.get(region)?.close();
      this.cache.delete(region);
      this.opening.delete(region);
    } else {
      for (const db of this.cache.values()) db.close();
      this.cache.clear();
      this.opening.clear();
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

  /** Convierte el parámetro region (clave, coma-separado o 'all') en lista de claves válidas. */
  private parseRegionList(region: string | undefined): string[] {
    const available = this.regions();
    if (!region || region === 'all') return available;
    return region.split(',').filter((r) => available.includes(r));
  }

  /** Cuenta filas de participantes que cumplen el scope (denominador de pick_rate por items/runas/hechizos). */
  private countScopeSync(db: Database, f: StatFilter): number {
    const sql = `SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE ${this.scopeClause(f)}`;
    return Number(this.rows(db.exec(sql, this.scopeParams(f)))[0]?.c ?? 0);
  }

  async meta(region?: string): Promise<AnalyticsMeta> {
    const allAvailable = this.regions();
    const regionList = this.parseRegionList(region);
    const ddragonVersion = await this.ddragonVersion();

    if (!regionList.length) {
      return { regions: allAvailable, region: null, patches: [], tiers: [], champions: [], totalGames: 0, totalParticipants: 0, ddragonVersion };
    }

    if (regionList.length === 1) {
      const r = regionList[0];
      const db = await this.open(r);
      if (!db) {
        return { regions: allAvailable, region: null, patches: [], tiers: [], champions: [], totalGames: 0, totalParticipants: 0, ddragonVersion };
      }
      const m = this.rows(db.exec('SELECT * FROM v_meta'))[0] ?? {};
      const patches = this.rows(
        db.exec('SELECT DISTINCT patch FROM matches ORDER BY patch DESC'),
      ).map((row) => String(row.patch));
      const tiers = this.rows(
        db.exec("SELECT DISTINCT tier FROM matches WHERE tier IS NOT NULL ORDER BY tier"),
      ).map((row) => String(row.tier));
      const champions = this.rows(
        db.exec("SELECT DISTINCT champion_name FROM participants WHERE team_position <> '' ORDER BY champion_name"),
      ).map((row) => String(row.champion_name));
      return {
        regions: allAvailable,
        region: r,
        patches,
        tiers,
        champions,
        totalGames: Number(m.total_games ?? 0),
        totalParticipants: Number(m.total_participants ?? 0),
        ddragonVersion,
      };
    }

    // Multi-región: unión de parches/tiers/campeones, suma de totales.
    let totalGames = 0, totalParticipants = 0;
    const patchSet = new Set<string>(), tierSet = new Set<string>(), champSet = new Set<string>();
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      const m = this.rows(db.exec('SELECT * FROM v_meta'))[0] ?? {};
      totalGames += Number(m.total_games ?? 0);
      totalParticipants += Number(m.total_participants ?? 0);
      this.rows(db.exec('SELECT DISTINCT patch FROM matches ORDER BY patch DESC'))
        .forEach((row) => patchSet.add(String(row.patch)));
      this.rows(db.exec("SELECT DISTINCT tier FROM matches WHERE tier IS NOT NULL ORDER BY tier"))
        .forEach((row) => tierSet.add(String(row.tier)));
      this.rows(db.exec("SELECT DISTINCT champion_name FROM participants WHERE team_position <> '' ORDER BY champion_name"))
        .forEach((row) => champSet.add(String(row.champion_name)));
    }
    const patches = [...patchSet].sort((a, b) => b.localeCompare(a));
    const tiers = [...tierSet].sort();
    const champions = [...champSet].sort();
    return { regions: allAvailable, region: null, patches, tiers, champions, totalGames, totalParticipants, ddragonVersion };
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

  private parseTier(tier: string): string[] {
    if (!tier || tier === 'all') return [];
    return tier.split(',').filter(Boolean);
  }

  private tierClause(tiers: string[], alias = 'm'): string {
    if (!tiers.length) return '1=1';
    return `${alias}.tier IN (${tiers.map((_, i) => `$t${i}`).join(', ')})`;
  }

  private tierBindings(tiers: string[]): Record<string, string> {
    const r: Record<string, string> = {};
    tiers.forEach((t, i) => { r[`$t${i}`] = t; });
    return r;
  }

  /** WHERE compartido por las páginas de items/runas/hechizos. */
  private scopeParams(f: StatFilter): Record<string, string> {
    const patches = this.parsePatch(f.patch);
    const tiers = this.parseTier(f.tier);
    return {
      ...this.patchBindings(patches),
      ...this.tierBindings(tiers),
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
    const tiers = this.parseTier(f.tier);
    return `p.team_position <> ''
      AND m.game_duration >= 240
      AND (${this.patchClause(patches)})
      AND (${this.tierClause(tiers)})
      AND ($role = 'ALL' OR p.team_position = $role)
      AND ($champion = 'all' OR p.champion_name = $champion)
      AND ${this.dateWhere}`;
  }

  async itemStats(region: string, f: StatFilter): Promise<ItemStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return [];

    const itemSql = `
      WITH scope AS (
        SELECT p.win win, p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)}
      ),
      it AS (
        SELECT item0 item, win FROM scope WHERE item0 > 0
        UNION ALL SELECT item1, win FROM scope WHERE item1 > 0
        UNION ALL SELECT item2, win FROM scope WHERE item2 > 0
        UNION ALL SELECT item3, win FROM scope WHERE item3 > 0
        UNION ALL SELECT item4, win FROM scope WHERE item4 > 0
        UNION ALL SELECT item5, win FROM scope WHERE item5 > 0
        UNION ALL SELECT item6, win FROM scope WHERE item6 > 0
      )
      SELECT item, COUNT(*) games, SUM(win) wins
      FROM it GROUP BY item ORDER BY games DESC LIMIT 80`;

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      const totalScope = this.countScopeSync(db, f);
      return this.rows(db.exec(itemSql, this.scopeParams(f))).map((r) => ({
        item: Number(r.item),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
        pickRate: totalScope > 0 ? Number(r.games) / totalScope : 0,
      }));
    }

    const merged = new Map<number, { games: number; wins: number }>();
    let totalScope = 0;
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      totalScope += this.countScopeSync(db, f);
      for (const row of this.rows(db.exec(itemSql, this.scopeParams(f)))) {
        const item = Number(row.item);
        const ex = merged.get(item);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(item, { games: Number(row.games), wins: Number(row.wins) });
      }
    }
    return [...merged.entries()]
      .map(([item, { games, wins }]) => ({
        item, games, wins,
        winRate: games > 0 ? wins / games : 0,
        pickRate: totalScope > 0 ? games / totalScope : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 80);
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
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return { total: 0, games: [] };

    const itemWhere = `(p.item0 = $item OR p.item1 = $item OR p.item2 = $item
      OR p.item3 = $item OR p.item4 = $item OR p.item5 = $item OR p.item6 = $item)`;
    const where = `${this.scopeClause(f)} AND ${itemWhere}`;
    const params = { ...this.scopeParams(f), $item: String(item) };

    const mapRow = (r: Record<string, number | string | null>): ItemGameRow => ({
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
      patch: r.patch == null ? null : String(r.patch),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
    });

    const gameSql = `
      SELECT m.match_id, p.champion_name, p.team_position, p.win,
             p.kills, p.deaths, p.assists, p.kda, p.cs, p.kill_participation,
             m.game_duration, m.game_creation, m.tier, m.patch,
             p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
             p.keystone, p.primary_style, p.sub_style, p.summoner1_id, p.summoner2_id
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${where}
      ORDER BY m.game_creation DESC`;

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return { total: 0, games: [] };
      const totalRes = this.rows(db.exec(
        `SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE ${where}`, params,
      ));
      const total = Number(totalRes[0]?.c ?? 0);
      const games = this.rows(db.exec(gameSql + ` LIMIT ${limit} OFFSET ${offset}`, params)).map(mapRow);
      return { total, games };
    }

    // Multi-región: reunir todas las partidas, ordenar y paginar.
    const allGames: ItemGameRow[] = [];
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      allGames.push(...this.rows(db.exec(gameSql, params)).map(mapRow));
    }
    allGames.sort((a, b) => b.gameCreation - a.gameCreation);
    return { total: allGames.length, games: allGames.slice(offset, offset + limit) };
  }

  /** Scoreboard completo (10 jugadores) de una partida concreta. */
  async matchDetail(region: string, matchId: string): Promise<MatchDetail | null> {
    const regionList = this.parseRegionList(region);

    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      const mp = { $mid: matchId };
      const mrow = this.rows(db.exec('SELECT * FROM matches WHERE match_id = $mid', mp))[0];
      if (!mrow) continue;

      const participants: MatchParticipantRow[] = this.rows(
        db.exec(
          `SELECT team_id, participant_id, puuid, champion_name, team_position, riot_id, win,
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
        puuid: r.puuid == null ? null : String(r.puuid),
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
    return null;
  }

  async spellStats(region: string, f: StatFilter): Promise<SpellStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return [];

    const spellSql = `
      WITH scope AS (
        SELECT p.win win,
          MIN(p.summoner1_id, p.summoner2_id) s1, MAX(p.summoner1_id, p.summoner2_id) s2
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)} AND p.summoner1_id > 0 AND p.summoner2_id > 0
      )
      SELECT s1, s2, COUNT(*) games, SUM(win) wins
      FROM scope GROUP BY s1, s2 ORDER BY games DESC LIMIT 40`;

    const countSql = `
      SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${this.scopeClause(f)} AND p.summoner1_id > 0 AND p.summoner2_id > 0`;

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      const totalScope = Number(this.rows(db.exec(countSql, this.scopeParams(f)))[0]?.c ?? 0);
      return this.rows(db.exec(spellSql, this.scopeParams(f))).map((r) => ({
        spell1: Number(r.s1),
        spell2: Number(r.s2),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
        pickRate: totalScope > 0 ? Number(r.games) / totalScope : 0,
      }));
    }

    const merged = new Map<string, { s1: number; s2: number; games: number; wins: number }>();
    let totalScope = 0;
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      totalScope += Number(this.rows(db.exec(countSql, this.scopeParams(f)))[0]?.c ?? 0);
      for (const row of this.rows(db.exec(spellSql, this.scopeParams(f)))) {
        const key = `${row.s1}|${row.s2}`;
        const ex = merged.get(key);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(key, { s1: Number(row.s1), s2: Number(row.s2), games: Number(row.games), wins: Number(row.wins) });
      }
    }
    return [...merged.values()]
      .map(({ s1, s2, games, wins }) => ({
        spell1: s1, spell2: s2, games, wins,
        winRate: games > 0 ? wins / games : 0,
        pickRate: totalScope > 0 ? games / totalScope : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 40);
  }

  /** Jugadores que más han jugado el campeón del filtro. */
  async playerStats(region: string, f: StatFilter): Promise<PlayerStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length || f.champion === 'all') return [];

    const sql = `
      WITH scope AS (
        SELECT p.puuid, p.riot_id, p.win, p.kda, m.game_creation
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)}
      )
      SELECT puuid,
        (SELECT s2.riot_id FROM scope s2 WHERE s2.puuid = scope.puuid ORDER BY s2.game_creation DESC LIMIT 1) riot_id,
        COUNT(*) games, SUM(win) wins,
        ROUND(AVG(win), 4) win_rate, ROUND(AVG(kda), 2) kda
      FROM scope GROUP BY puuid ORDER BY games DESC, wins DESC LIMIT 25`;

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      return this.rows(db.exec(sql, this.scopeParams(f))).map((r) => ({
        puuid: r.puuid == null ? null : String(r.puuid),
        riotId: r.riot_id == null ? null : String(r.riot_id),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.win_rate),
        kda: Number(r.kda),
      }));
    }

    const merged = new Map<string, { riotId: string | null; games: number; wins: number; kdaSum: number }>();
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      for (const row of this.rows(db.exec(sql, this.scopeParams(f)))) {
        const puuid = String(row.puuid);
        const ex = merged.get(puuid);
        if (ex) {
          ex.games += Number(row.games);
          ex.wins += Number(row.wins);
          ex.kdaSum += Number(row.kda) * Number(row.games);
          if (!ex.riotId && row.riot_id != null) ex.riotId = String(row.riot_id);
        } else {
          merged.set(puuid, {
            riotId: row.riot_id == null ? null : String(row.riot_id),
            games: Number(row.games),
            wins: Number(row.wins),
            kdaSum: Number(row.kda) * Number(row.games),
          });
        }
      }
    }
    return [...merged.entries()]
      .map(([puuid, { riotId, games, wins, kdaSum }]) => ({
        puuid,
        riotId,
        games,
        wins,
        winRate: games > 0 ? wins / games : 0,
        kda: games > 0 ? kdaSum / games : 0,
      }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, 25);
  }

  /** Partidas de un jugador específico (por puuid). */
  async playerGames(
    region: string,
    puuid: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<PlayerGamesResponse> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return { total: 0, riotId: null, games: [] };

    const patches = this.parsePatch(f.patch);
    const patchW = this.patchClause(patches);
    const tiers = this.parseTier(f.tier);
    const tierW = this.tierClause(tiers);
    const dateW = this.dateWhere;

    const where = `p.puuid = $puuid AND p.team_position <> ''
      AND m.game_duration >= 240
      AND (${patchW})
      AND (${tierW})
      AND ($role = 'ALL' OR p.team_position = $role)
      AND ${dateW}`;

    const baseParams: Record<string, string> = {
      ...this.patchBindings(patches),
      ...this.tierBindings(tiers),
      $puuid: puuid,
      $role: f.role,
      $dateFrom: f.dateFrom ?? '',
      $dateTo: f.dateTo ?? '',
    };

    const gameSql = `
      SELECT m.match_id, p.champion_name, p.team_position, p.win,
             p.kills, p.deaths, p.assists, p.kda, p.cs, p.kill_participation,
             m.game_duration, m.game_creation, m.tier, m.patch,
             p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
             p.keystone, p.primary_style, p.sub_style, p.summoner1_id, p.summoner2_id
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${where}
      ORDER BY m.game_creation DESC`;

    const mapGame = (r: Record<string, number | string | null>): ItemGameRow => ({
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
      patch: r.patch == null ? null : String(r.patch),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
    });

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return { total: 0, riotId: null, games: [] };
      const infoRows = this.rows(db.exec(
        `SELECT p.riot_id FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE p.puuid = $puuid ORDER BY m.game_creation DESC LIMIT 1`,
        { $puuid: puuid },
      ));
      const riotId = infoRows[0]?.riot_id == null ? null : String(infoRows[0].riot_id);
      const totalRes = this.rows(db.exec(`SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE ${where}`, baseParams));
      const total = Number(totalRes[0]?.c ?? 0);
      const games = this.rows(db.exec(gameSql + ` LIMIT ${limit} OFFSET ${offset}`, baseParams)).map(mapGame);
      return { total, riotId, games };
    }

    // Multi-región: reunir todas las partidas, ordenar y paginar.
    let riotId: string | null = null;
    const allGames: ItemGameRow[] = [];
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      if (!riotId) {
        const info = this.rows(db.exec(
          `SELECT p.riot_id FROM participants p JOIN matches m ON m.match_id = p.match_id WHERE p.puuid = $puuid ORDER BY m.game_creation DESC LIMIT 1`,
          { $puuid: puuid },
        ));
        if (info[0]?.riot_id != null) riotId = String(info[0].riot_id);
      }
      allGames.push(...this.rows(db.exec(gameSql, baseParams)).map(mapGame));
    }
    allGames.sort((a, b) => b.gameCreation - a.gameCreation);
    return { total: allGames.length, riotId, games: allGames.slice(offset, offset + limit) };
  }

  /** Campeones rivales en el mismo rol (counters), con win/pick rate. */
  async counterStats(region: string, f: StatFilter): Promise<CounterStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length || f.champion === 'all') return [];

    const patches = this.parsePatch(f.patch);
    const patchW = this.patchClause(patches);
    const tiers = this.parseTier(f.tier);
    const tierW = this.tierClause(tiers);
    const sql = `
      WITH base AS (
        SELECT p1.win win, p2.champion_name opp
        FROM participants p1
        JOIN participants p2 ON p2.match_id = p1.match_id
          AND p2.team_position = p1.team_position
          AND p2.team_id <> p1.team_id
        JOIN matches m ON m.match_id = p1.match_id
        WHERE p1.champion_name = $champion AND p1.team_position <> ''
          AND m.game_duration >= 240
          AND (${patchW})
          AND (${tierW})
          AND ($role = 'ALL' OR p1.team_position = $role)
      )
      SELECT opp opponent, COUNT(*) games, SUM(win) wins
      FROM base GROUP BY opp ORDER BY games DESC LIMIT 25`;

    const countSql = `
      SELECT COUNT(*) c FROM participants p1
      JOIN matches m ON m.match_id = p1.match_id
      WHERE p1.champion_name = $champion AND p1.team_position <> ''
        AND m.game_duration >= 240
        AND (${patchW})
        AND (${tierW})
        AND ($role = 'ALL' OR p1.team_position = $role)`;

    const params = this.scopeParams(f);

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      const totalBase = Number(this.rows(db.exec(countSql, params))[0]?.c ?? 0);
      return this.rows(db.exec(sql, params)).map((r) => ({
        opponent: String(r.opponent),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
        pickRate: totalBase > 0 ? Number(r.games) / totalBase : 0,
      }));
    }

    const merged = new Map<string, { games: number; wins: number }>();
    let totalBase = 0;
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      totalBase += Number(this.rows(db.exec(countSql, params))[0]?.c ?? 0);
      for (const row of this.rows(db.exec(sql, params))) {
        const opp = String(row.opponent);
        const ex = merged.get(opp);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(opp, { games: Number(row.games), wins: Number(row.wins) });
      }
    }
    return [...merged.entries()]
      .map(([opponent, { games, wins }]) => ({
        opponent, games, wins,
        winRate: games > 0 ? wins / games : 0,
        pickRate: totalBase > 0 ? games / totalBase : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 25);
  }

  /** Compañeros de equipo con mejor win rate junto al campeón (sinergia/duo). */
  async synergyStats(region: string, f: StatFilter): Promise<SynergyStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length || f.champion === 'all') return [];

    const patches = this.parsePatch(f.patch);
    const patchW = this.patchClause(patches);
    const tiers = this.parseTier(f.tier);
    const tierW = this.tierClause(tiers);
    const sql = `
      WITH base AS (
        SELECT p1.win win, p2.champion_name mate
        FROM participants p1
        JOIN participants p2 ON p2.match_id = p1.match_id
          AND p2.team_id = p1.team_id
          AND p2.participant_id <> p1.participant_id
        JOIN matches m ON m.match_id = p1.match_id
        WHERE p1.champion_name = $champion AND p1.team_position <> ''
          AND m.game_duration >= 240
          AND (${patchW})
          AND (${tierW})
          AND ($role = 'ALL' OR p1.team_position = $role)
      )
      SELECT mate champion, COUNT(*) games, SUM(win) wins
      FROM base GROUP BY mate ORDER BY wins DESC, games DESC LIMIT 25`;

    const countSql = `
      SELECT COUNT(*) c FROM participants p1
      JOIN matches m ON m.match_id = p1.match_id
      WHERE p1.champion_name = $champion AND p1.team_position <> ''
        AND m.game_duration >= 240
        AND (${patchW})
        AND (${tierW})
        AND ($role = 'ALL' OR p1.team_position = $role)`;

    const params = this.scopeParams(f);

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      const totalBase = Number(this.rows(db.exec(countSql, params))[0]?.c ?? 0);
      return this.rows(db.exec(sql, params)).map((r) => ({
        champion: String(r.champion),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
        pickRate: totalBase > 0 ? Number(r.games) / totalBase : 0,
      }));
    }

    const merged = new Map<string, { games: number; wins: number }>();
    let totalBase = 0;
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      totalBase += Number(this.rows(db.exec(countSql, params))[0]?.c ?? 0);
      for (const row of this.rows(db.exec(sql, params))) {
        const mate = String(row.champion);
        const ex = merged.get(mate);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(mate, { games: Number(row.games), wins: Number(row.wins) });
      }
    }
    return [...merged.entries()]
      .map(([champion, { games, wins }]) => ({
        champion, games, wins,
        winRate: games > 0 ? wins / games : 0,
        pickRate: totalBase > 0 ? games / totalBase : 0,
      }))
      .sort((a, b) => b.wins / (b.games || 1) - a.wins / (a.games || 1) || b.games - a.games)
      .slice(0, 25);
  }

  async runeStats(region: string, f: StatFilter): Promise<RuneStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return [];

    const runeSql = `
      WITH scope AS (
        SELECT p.win win, p.keystone, p.primary_style, p.sub_style
        FROM participants p JOIN matches m ON m.match_id = p.match_id
        WHERE ${this.scopeClause(f)} AND p.keystone IS NOT NULL
      )
      SELECT keystone, primary_style, sub_style, COUNT(*) games, SUM(win) wins
      FROM scope GROUP BY keystone, primary_style, sub_style ORDER BY games DESC LIMIT 40`;

    const countSql = `
      SELECT COUNT(*) c FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${this.scopeClause(f)} AND p.keystone IS NOT NULL`;

    if (regionList.length === 1) {
      const db = await this.open(regionList[0]);
      if (!db) return [];
      const totalScope = Number(this.rows(db.exec(countSql, this.scopeParams(f)))[0]?.c ?? 0);
      return this.rows(db.exec(runeSql, this.scopeParams(f))).map((r) => ({
        keystone: Number(r.keystone),
        primaryStyle: Number(r.primary_style),
        subStyle: Number(r.sub_style),
        games: Number(r.games),
        wins: Number(r.wins),
        winRate: Number(r.games) > 0 ? Number(r.wins) / Number(r.games) : 0,
        pickRate: totalScope > 0 ? Number(r.games) / totalScope : 0,
      }));
    }

    const merged = new Map<string, { keystone: number; primaryStyle: number; subStyle: number; games: number; wins: number }>();
    let totalScope = 0;
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      totalScope += Number(this.rows(db.exec(countSql, this.scopeParams(f)))[0]?.c ?? 0);
      for (const row of this.rows(db.exec(runeSql, this.scopeParams(f)))) {
        const key = `${row.keystone}|${row.primary_style}|${row.sub_style}`;
        const ex = merged.get(key);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(key, {
          keystone: Number(row.keystone),
          primaryStyle: Number(row.primary_style),
          subStyle: Number(row.sub_style),
          games: Number(row.games),
          wins: Number(row.wins),
        });
      }
    }
    return [...merged.values()]
      .map((x) => ({
        ...x,
        winRate: x.games > 0 ? x.wins / x.games : 0,
        pickRate: totalScope > 0 ? x.games / totalScope : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 40);
  }

  async champions(region: string, patch = 'all', tier = 'all', dateFrom = '', dateTo = ''): Promise<ChampionStatRow[]> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return [];

    const patches = this.parsePatch(patch);
    const patchW = this.patchClause(patches);
    const tiers = this.parseTier(tier);
    const tierW = this.tierClause(tiers);
    const dateW = `($dateFrom = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') >= $dateFrom)
        AND ($dateTo = '' OR strftime('%Y-%m-%d', m.game_creation / 1000, 'unixepoch') <= $dateTo)`;
    const bindings = { ...this.patchBindings(patches), ...this.tierBindings(tiers), $dateFrom: dateFrom, $dateTo: dateTo };

    const champSql = `
      SELECT p.champion_name AS champion_name,
             p.team_position AS role,
             COUNT(*) AS games,
             SUM(p.win) AS wins
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE p.team_position <> ''
        AND (${patchW}) AND (${tierW})
        AND ${dateW}
      GROUP BY p.champion_name, p.team_position`;

    const banSql = `
      SELECT b.champion_name cn, COUNT(*) c
      FROM bans b JOIN matches m ON m.match_id = b.match_id
      WHERE (${patchW}) AND (${tierW}) AND ${dateW}
      GROUP BY b.champion_name`;

    const totalMatchSql = `
      SELECT COUNT(*) c FROM matches m
      WHERE (${patchW}) AND (${tierW}) AND ${dateW}`;

    // Merge entries by (champion, role).
    const merged = new Map<string, { championName: string; role: string; games: number; wins: number }>();
    const bansByChamp = new Map<string, number>(); // champion → total bans across regions
    let grandTotalMatches = 0;

    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      const regionTotal = Number(this.rows(db.exec(totalMatchSql, bindings))[0]?.c ?? 0);
      grandTotalMatches += regionTotal;

      for (const row of this.rows(db.exec(champSql, bindings))) {
        const key = `${row.champion_name}|${row.role}`;
        const ex = merged.get(key);
        if (ex) { ex.games += Number(row.games); ex.wins += Number(row.wins); }
        else merged.set(key, {
          championName: String(row.champion_name),
          role: String(row.role),
          games: Number(row.games),
          wins: Number(row.wins),
        });
      }

      // Bans: back-calc del count usando el total de partidas de la región.
      for (const row of this.rows(db.exec(banSql, bindings))) {
        const champ = String(row.cn);
        bansByChamp.set(champ, (bansByChamp.get(champ) ?? 0) + Number(row.c));
      }
    }

    return [...merged.values()].map(({ championName, role, games, wins }) => ({
      championName,
      role,
      games,
      wins,
      winRate: games > 0 ? wins / games : 0,
      pickRate: grandTotalMatches > 0 ? games / grandTotalMatches : 0,
      banRate: grandTotalMatches > 0 ? (bansByChamp.get(championName) ?? 0) / grandTotalMatches : 0,
    }));
  }

  /**
   * Jugadores con rachas de victorias más largas en el scope filtrado.
   * Las rachas se computan en JavaScript (iteración O(n)) en lugar de usar
   * window functions SQL, que son extremadamente lentas en sql.js (WASM).
   */
  async streaks(
    region: string,
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<StreaksResponse> {
    const regionList = this.parseRegionList(region);
    if (!regionList.length) return { total: 0, players: [], matches: [] };

    const params = this.scopeParams(f);

    // Query simple sin window functions: partidas ordenadas por jugador y tiempo.
    const rawSql = `
      SELECT p.puuid, p.riot_id, p.win, m.game_creation
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE ${this.scopeClause(f)}
      ORDER BY p.puuid, m.game_creation`;

    type Acc = { riotId: string; totalGames: number; wins: number; cur: number; longestWinStreak: number };
    const playerMap = new Map<string, { riotId: string; totalGames: number; wins: number; longestWinStreak: number }>();

    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      // Acumular partidas de esta región y calcular racha máxima por jugador en JS.
      const regionAcc = new Map<string, Acc>();
      for (const row of this.rows(db.exec(rawSql, params))) {
        const puuid = String(row.puuid);
        let p = regionAcc.get(puuid);
        if (!p) { p = { riotId: '', totalGames: 0, wins: 0, cur: 0, longestWinStreak: 0 }; regionAcc.set(puuid, p); }
        if (row.riot_id != null && !p.riotId) p.riotId = String(row.riot_id);
        p.totalGames++;
        const win = Number(row.win) === 1;
        if (win) { p.wins++; p.cur++; if (p.cur > p.longestWinStreak) p.longestWinStreak = p.cur; }
        else p.cur = 0;
      }
      // Mergear en el mapa global (por si el mismo puuid aparece en varias regiones).
      for (const [puuid, rp] of regionAcc) {
        const ex = playerMap.get(puuid);
        if (ex) {
          ex.totalGames += rp.totalGames;
          ex.wins += rp.wins;
          ex.longestWinStreak = Math.max(ex.longestWinStreak, rp.longestWinStreak);
          if (!ex.riotId && rp.riotId) ex.riotId = rp.riotId;
        } else {
          playerMap.set(puuid, { riotId: rp.riotId, totalGames: rp.totalGames, wins: rp.wins, longestWinStreak: rp.longestWinStreak });
        }
      }
    }

    const sortedAll = [...playerMap.entries()]
      .map(([puuid, p]) => ({ puuid, riotId: p.riotId || '', longestWinStreak: p.longestWinStreak, totalGames: p.totalGames, wins: p.wins }))
      .filter((p) => p.longestWinStreak >= 3)
      .sort((a, b) => b.longestWinStreak - a.longestWinStreak || b.totalGames - a.totalGames);
    const total = sortedAll.length;
    const players = sortedAll.slice(offset, offset + limit);

    if (!players.length) return { total, players, matches: [] };

    const puuidList = players.map((p) => `'${p.puuid.replace(/'/g, "''")}'`).join(',');
    const matchSql = `
      SELECT p.puuid, m.match_id, p.champion_name, p.team_position, p.win,
             p.kills, p.deaths, p.assists, p.kda, p.cs, p.kill_participation,
             m.game_duration, m.game_creation, m.tier, m.patch,
             p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
             p.keystone, p.primary_style, p.sub_style, p.summoner1_id, p.summoner2_id
      FROM participants p JOIN matches m ON m.match_id = p.match_id
      WHERE p.puuid IN (${puuidList}) AND ${this.scopeClause(f)}
      ORDER BY p.puuid, m.game_creation DESC`;

    const allMatches: StreakGameRow[] = [];
    for (const r of regionList) {
      const db = await this.open(r);
      if (!db) continue;
      allMatches.push(...this.rows(db.exec(matchSql, params)).map((row) => this.mapStreakRow(row)));
    }
    allMatches.sort((a, b) => {
      if (a.puuid !== b.puuid) return a.puuid.localeCompare(b.puuid);
      return b.gameCreation - a.gameCreation;
    });

    return { total, players, matches: allMatches };
  }

  private mapStreakRow(r: Record<string, number | string | null>): StreakGameRow {
    return {
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
      patch: r.patch == null ? null : String(r.patch),
      items: [r.item0, r.item1, r.item2, r.item3, r.item4, r.item5, r.item6].map((x) => Number(x ?? 0)),
      keystone: r.keystone == null ? null : Number(r.keystone),
      primaryStyle: r.primary_style == null ? null : Number(r.primary_style),
      subStyle: r.sub_style == null ? null : Number(r.sub_style),
      summoner1: r.summoner1_id == null ? null : Number(r.summoner1_id),
      summoner2: r.summoner2_id == null ? null : Number(r.summoner2_id),
      killParticipation: r.kill_participation == null ? null : Number(r.kill_participation),
    };
  }
}
