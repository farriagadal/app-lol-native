import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import initSqlJs from 'sql.js';
import type { MatchDTO } from '../collector/riotTypes';

/**
 * Construye data/<region>/lol.db (SQLite normalizada) desde el raw store
 * data/<region>/matches.jsonl, con sql.js (sin compilador nativo).
 */

const SCHEMA = `
CREATE TABLE matches (
  match_id TEXT PRIMARY KEY,
  patch TEXT, game_version TEXT, queue_id INTEGER, game_mode TEXT,
  game_duration INTEGER, game_creation INTEGER, platform_id TEXT, winning_team INTEGER,
  tier TEXT
);
CREATE TABLE participants (
  match_id TEXT, participant_id INTEGER, puuid TEXT, team_id INTEGER,
  champion_id INTEGER, champion_name TEXT, team_position TEXT, win INTEGER,
  kills INTEGER, deaths INTEGER, assists INTEGER, kda REAL, kill_participation REAL,
  champ_level INTEGER, gold_earned INTEGER, gold_per_minute REAL,
  cs INTEGER, minions_killed INTEGER, jungle_minions INTEGER,
  vision_score INTEGER, wards_placed INTEGER, wards_killed INTEGER, control_wards INTEGER,
  dmg_to_champs INTEGER, magic_dmg_champs INTEGER, physical_dmg_champs INTEGER, true_dmg_champs INTEGER,
  team_dmg_pct REAL, dmg_taken INTEGER, self_mitigated INTEGER,
  total_heal INTEGER, heals_on_teammates INTEGER,
  turret_takedowns INTEGER, dragon_takedowns REAL, baron_kills INTEGER, solo_kills REAL,
  double_kills INTEGER, triple_kills INTEGER, quadra_kills INTEGER, penta_kills INTEGER,
  time_played INTEGER, summoner1_id INTEGER, summoner2_id INTEGER,
  primary_style INTEGER, sub_style INTEGER, keystone INTEGER,
  item0 INTEGER, item1 INTEGER, item2 INTEGER, item3 INTEGER, item4 INTEGER, item5 INTEGER, item6 INTEGER,
  riot_id TEXT,
  PRIMARY KEY (match_id, participant_id)
);
CREATE TABLE bans (
  match_id TEXT, team_id INTEGER, champion_id INTEGER, champion_name TEXT, pick_turn INTEGER
);
CREATE TABLE team_objectives (
  match_id TEXT, team_id INTEGER, win INTEGER,
  baron_kills INTEGER, dragon_kills INTEGER, rift_herald_kills INTEGER,
  horde_kills INTEGER, atakhan_kills INTEGER, tower_kills INTEGER,
  inhibitor_kills INTEGER, champion_kills INTEGER,
  PRIMARY KEY (match_id, team_id)
);
`;

const VIEWS = `
CREATE VIEW v_champion_stats AS
SELECT p.champion_name, p.team_position AS role,
  COUNT(*) AS games, SUM(p.win) AS wins,
  ROUND(AVG(p.win), 4) AS win_rate,
  ROUND(COUNT(*) * 1.0 / (SELECT COUNT(*) FROM matches), 4) AS pick_rate,
  ROUND((SELECT COUNT(*) FROM bans b WHERE b.champion_name = p.champion_name)
        * 1.0 / (SELECT COUNT(*) FROM matches), 4) AS ban_rate
FROM participants p WHERE p.team_position <> ''
GROUP BY p.champion_name, p.team_position;

CREATE VIEW v_meta AS
SELECT (SELECT COUNT(*) FROM matches) AS total_games,
       (SELECT COUNT(*) FROM participants) AS total_participants,
       (SELECT COUNT(DISTINCT patch) FROM matches) AS patches;
`;

const INDEXES = `
CREATE INDEX ix_part_champ ON participants(champion_name);
CREATE INDEX ix_part_role ON participants(team_position);
CREATE INDEX ix_part_champ_role ON participants(champion_name, team_position);
CREATE INDEX ix_match_patch ON matches(patch);
CREATE INDEX ix_match_tier ON matches(tier);
CREATE INDEX ix_ban_champ ON bans(champion_name);
`;

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const ch = (p: Record<string, unknown>, k: string): number | null => {
  const c = p.challenges as Record<string, unknown> | undefined;
  return c && typeof c[k] === 'number' ? (c[k] as number) : null;
};
const patchOf = (gv: string): string => {
  const a = (gv || '').split('.');
  return a.length >= 2 ? `${a[0]}.${a[1]}` : gv || '';
};

interface ChampionJson {
  data: Record<string, { key: string; id: string }>;
}

/** numericId -> id de Data Dragon (p.ej. 103 -> "Ahri"), para los baneos. */
async function championMap(): Promise<Map<number, string>> {
  const versions = (await (
    await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  ).json()) as string[];
  const v = versions[0];
  const champ = (await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`)
  ).json()) as ChampionJson;
  const map = new Map<number, string>();
  for (const c of Object.values(champ.data)) map.set(Number(c.key), c.id);
  return map;
}

export async function buildDb(
  region: string,
  dataDir: string,
): Promise<{ matches: number; outPath: string }> {
  const jsonl = path.join(dataDir, region, 'matches.jsonl');
  if (!fs.existsSync(jsonl)) {
    throw new Error(`No hay datos en ${jsonl} (ejecuta una recolección primero).`);
  }

  // Rango (tier) por partida, escrito por el colector en match-tier.tsv.
  const tierMap = new Map<string, string>();
  const tierFile = path.join(dataDir, region, 'match-tier.tsv');
  if (fs.existsSync(tierFile)) {
    for (const line of fs.readFileSync(tierFile, 'utf8').split('\n')) {
      const i = line.indexOf('\t');
      if (i <= 0) continue;
      const id = line.slice(0, i).trim();
      const t = line.slice(i + 1).trim();
      if (id && t && !tierMap.has(id)) tierMap.set(id, t);
    }
  }

  const map = await championMap();
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(SCHEMA);
  db.run('BEGIN TRANSACTION;');

  const insMatch = db.prepare('INSERT OR IGNORE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insPart = db.prepare(
    `INSERT OR IGNORE INTO participants VALUES (${Array(54).fill('?').join(',')})`,
  );
  const insBan = db.prepare('INSERT INTO bans VALUES (?,?,?,?,?)');
  const insTeam = db.prepare(
    'INSERT OR IGNORE INTO team_objectives VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );

  let matches = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(jsonl, 'utf8'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let m: MatchDTO;
    try {
      m = JSON.parse(t) as MatchDTO;
    } catch {
      continue;
    }
    const info = m.info;
    if (!info) continue;
    const mid = m.metadata.matchId;
    const winTeam = info.teams.find((x) => x.win)?.teamId ?? null;

    insMatch.run([
      mid, patchOf(info.gameVersion), info.gameVersion, info.queueId, info.gameMode,
      info.gameDuration, info.gameCreation ?? null, info.platformId ?? null, winTeam,
      tierMap.get(mid) ?? null,
    ]);

    for (const p of info.participants as unknown as Array<Record<string, unknown>>) {
      const styles =
        ((p.perks as { styles?: Array<{ style: number; selections?: Array<{ perk: number }> }> })
          ?.styles) ?? [];
      const keystone = styles[0]?.selections?.[0]?.perk ?? null;
      const gameName = typeof p.riotIdGameName === 'string' ? p.riotIdGameName : '';
      const tagline = typeof p.riotIdTagline === 'string' ? p.riotIdTagline : '';
      const riotId = gameName
        ? (tagline ? `${gameName}#${tagline}` : gameName)
        : (typeof p.summonerName === 'string' && p.summonerName ? p.summonerName : null);
      insPart.run([
        mid, p.participantId, p.puuid, p.teamId,
        p.championId, p.championName, p.teamPosition, p.win ? 1 : 0,
        num(p.kills), num(p.deaths), num(p.assists), ch(p, 'kda'), ch(p, 'killParticipation'),
        num(p.champLevel), num(p.goldEarned), ch(p, 'goldPerMinute'),
        (num(p.totalMinionsKilled) || 0) + (num(p.neutralMinionsKilled) || 0),
        num(p.totalMinionsKilled), num(p.neutralMinionsKilled),
        num(p.visionScore), num(p.wardsPlaced), num(p.wardsKilled), ch(p, 'controlWardsPlaced'),
        num(p.totalDamageDealtToChampions), num(p.magicDamageDealtToChampions),
        num(p.physicalDamageDealtToChampions), num(p.trueDamageDealtToChampions),
        ch(p, 'teamDamagePercentage'), num(p.totalDamageTaken), num(p.damageSelfMitigated),
        num(p.totalHeal), num(p.totalHealsOnTeammates),
        num(p.turretTakedowns), ch(p, 'dragonTakedowns'), num(p.baronKills), ch(p, 'soloKills'),
        num(p.doubleKills), num(p.tripleKills), num(p.quadraKills), num(p.pentaKills),
        num(p.timePlayed), num(p.summoner1Id), num(p.summoner2Id),
        styles[0]?.style ?? null, styles[1]?.style ?? null, keystone,
        num(p.item0), num(p.item1), num(p.item2), num(p.item3), num(p.item4), num(p.item5), num(p.item6),
        riotId,
      ]);
    }

    for (const team of info.teams) {
      const o = (team.objectives ?? {}) as unknown as Record<string, { kills?: number } | undefined>;
      const k = (x: string): number | null =>
        typeof o[x]?.kills === 'number' ? (o[x]!.kills as number) : null;
      insTeam.run([
        mid, team.teamId, team.win ? 1 : 0,
        k('baron'), k('dragon'), k('riftHerald'), k('horde'), k('atakhan'),
        k('tower'), k('inhibitor'), k('champion'),
      ]);
      for (const b of team.bans ?? []) {
        if (b.championId < 0) continue;
        insBan.run([mid, team.teamId, b.championId, map.get(b.championId) ?? null, b.pickTurn]);
      }
    }
    matches++;
  }

  insMatch.free();
  insPart.free();
  insBan.free();
  insTeam.free();
  db.run('COMMIT;');
  db.run(INDEXES);
  db.run(VIEWS);

  const outPath = path.join(dataDir, region, 'lol.db');
  fs.writeFileSync(outPath, Buffer.from(db.export()));
  db.close();
  return { matches, outPath };
}
