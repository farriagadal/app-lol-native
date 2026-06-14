/**
 * Construye una base SQLite normalizada (data/<region>/lol.db) a partir del
 * raw store data/<region>/matches.jsonl. Usa sql.js (WASM, sin compilador
 * nativo) y produce un .db ESTÁNDAR: lo abren DB Browser, DBeaver, Python,
 * Power BI, etc.
 *
 * Arquitectura ELT:
 *   matches.jsonl  (raw inmutable)  --build-db-->  lol.db (consultable)
 *
 * Uso:  node scripts/build-db.mjs [region]   (def. la2)
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const region = process.argv[2] || 'la2';
const jsonl = path.resolve('data', region, 'matches.jsonl');
if (!fs.existsSync(jsonl)) {
  console.error(`No existe ${jsonl}. Corre primero "npm run collect".`);
  process.exit(1);
}

// --- Data Dragon: championId numérico -> nombre (para los baneos) -----------
async function championMap() {
  const versions = await (
    await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  ).json();
  const v = versions[0];
  const champ = await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`)
  ).json();
  const map = new Map();
  for (const c of Object.values(champ.data)) map.set(Number(c.key), c.id);
  return { v, map };
}

const SCHEMA = `
CREATE TABLE matches (
  match_id TEXT PRIMARY KEY,
  patch TEXT, game_version TEXT, queue_id INTEGER, game_mode TEXT,
  game_duration INTEGER, game_creation INTEGER, platform_id TEXT, winning_team INTEGER
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
FROM participants p
WHERE p.team_position <> ''
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
CREATE INDEX ix_ban_champ ON bans(champion_name);
`;

const num = (v) => (typeof v === 'number' ? v : null);
const ch = (p, k) => (p.challenges && typeof p.challenges[k] === 'number' ? p.challenges[k] : null);
const patchOf = (gv) => {
  const a = (gv || '').split('.');
  return a.length >= 2 ? `${a[0]}.${a[1]}` : gv || '';
};

async function main() {
  const { v, map } = await championMap();
  const SQL = await initSqlJs({
    locateFile: (f) => path.resolve('node_modules/sql.js/dist', f),
  });
  const db = new SQL.Database();
  db.run(SCHEMA);
  db.run('BEGIN TRANSACTION;');

  const insMatch = db.prepare(
    `INSERT OR IGNORE INTO matches VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const insPart = db.prepare(
    `INSERT OR IGNORE INTO participants VALUES (${Array(53).fill('?').join(',')})`,
  );
  const insBan = db.prepare(`INSERT INTO bans VALUES (?,?,?,?,?)`);
  const insTeam = db.prepare(
    `INSERT OR IGNORE INTO team_objectives VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );

  let matches = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(jsonl, 'utf8'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let m;
    try {
      m = JSON.parse(t);
    } catch {
      continue;
    }
    const info = m.info;
    if (!info) continue;
    const mid = m.metadata.matchId;
    const winTeam = (info.teams.find((x) => x.win) || {}).teamId ?? null;

    insMatch.run([
      mid, patchOf(info.gameVersion), info.gameVersion, info.queueId, info.gameMode,
      info.gameDuration, info.gameCreation ?? null, info.platformId ?? null, winTeam,
    ]);

    for (const p of info.participants) {
      const st = (p.perks && p.perks.styles) || [];
      const keystone = st[0] && st[0].selections && st[0].selections[0] ? st[0].selections[0].perk : null;
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
        st[0] ? st[0].style : null, st[1] ? st[1].style : null, keystone,
        num(p.item0), num(p.item1), num(p.item2), num(p.item3), num(p.item4), num(p.item5), num(p.item6),
      ]);
    }

    for (const team of info.teams) {
      const o = team.objectives || {};
      const k = (x) => (o[x] && typeof o[x].kills === 'number' ? o[x].kills : null);
      insTeam.run([
        mid, team.teamId, team.win ? 1 : 0,
        k('baron'), k('dragon'), k('riftHerald'), k('horde'), k('atakhan'),
        k('tower'), k('inhibitor'), k('champion'),
      ]);
      for (const b of team.bans || []) {
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

  const outPath = path.resolve('data', region, 'lol.db');
  fs.writeFileSync(outPath, Buffer.from(db.export()));
  db.close();

  const sizeMB = (fs.statSync(outPath).size / 1e6).toFixed(1);
  console.log(`SQLite generado: ${outPath} (${sizeMB} MB)`);
  console.log(`Data Dragon ${v} · ${matches} partidas cargadas.`);
  console.log('Tablas: matches, participants, bans, team_objectives');
  console.log('Vistas: v_champion_stats, v_meta');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
