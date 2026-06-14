/**
 * Genera src/collector/riotTypes.ts a partir de las respuestas REALES guardadas
 * en data/<region>/matches.jsonl. Así los tipos reflejan exactamente lo que
 * devuelve la API en el parche actual (incluidos campos nuevos de 2026).
 *
 * Uso:  node scripts/gen-riot-types.mjs [region]   (def. la2)
 *
 * Los DTO de League/Summoner se escriben a mano (no los guardamos en disco) y
 * son estables; el árbol de Match-V5 se infiere de la data.
 */
import fs from 'fs';
import path from 'path';

const region = process.argv[2] || 'la2';
const file = path.resolve('data', region, 'matches.jsonl');
if (!fs.existsSync(file)) {
  console.error(`No existe ${file}. Corre primero "npm run collect".`);
  process.exit(1);
}

const matches = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const participants = matches.flatMap((m) => m.info.participants);
const teams = matches.flatMap((m) => m.info.teams);
const perks = participants.map((p) => p.perks).filter(Boolean);
const styles = perks.flatMap((p) => p.styles || []);
const selections = styles.flatMap((s) => s.selections || []);
const statPerks = perks.map((p) => p.statPerks).filter(Boolean);
const challenges = participants.map((p) => p.challenges).filter(Boolean);
const missions = participants.map((p) => p.missions).filter(Boolean);
const objectivesList = teams.map((t) => t.objectives).filter(Boolean);
const objectiveVals = objectivesList.flatMap((o) => Object.values(o));
const bans = teams.flatMap((t) => t.bans);

function tsType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return (v.length ? tsType(v[0]) : 'unknown') + '[]';
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return t;
  return 'object';
}

function unionType(set) {
  const arr = [...set].sort((a, b) =>
    a === 'null' ? 1 : b === 'null' ? -1 : a.localeCompare(b),
  );
  return arr.map((t) => (t === 'object' ? 'Record<string, unknown>' : t)).join(' | ');
}

function emit(name, objs, opts = {}) {
  const { overrides = {}, allFields, optionalKeys = new Set(), comment } = opts;
  const total = objs.length;
  const fields = new Map();
  for (const o of objs) {
    for (const [k, v] of Object.entries(o)) {
      if (!fields.has(k)) fields.set(k, { types: new Set(), present: 0 });
      const f = fields.get(k);
      f.present++;
      f.types.add(tsType(v));
    }
  }
  const keys = [...fields.keys()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  let out = comment ? `/** ${comment} */\n` : '';
  out += `export interface ${name} {\n`;
  for (const k of keys) {
    const f = fields.get(k);
    const optional = f.present < total || optionalKeys.has(k) ? '?' : '';
    const type = allFields ?? overrides[k] ?? unionType(f.types);
    // Claves que no son identificadores válidos (p.ej. "12AssistStreakCount")
    // se entrecomillan.
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    out += `  ${key}${optional}: ${type};\n`;
  }
  out += '}\n';
  return out;
}

const HEADER = `/**
 * Tipos de las respuestas de la API de Riot usadas por el colector.
 *
 * El bloque de Match-V5 está GENERADO a partir de datos reales con
 * scripts/gen-riot-types.mjs (parche actual). Para regenerarlo tras recolectar
 * datos nuevos:   node scripts/gen-riot-types.mjs <region>
 *
 * Los DTO de LEAGUE-V4 / SUMMONER-V4 están escritos a mano (estables).
 */

// ===========================================================================
// LEAGUE-V4 / SUMMONER-V4 (manuales)
// ===========================================================================

export interface MiniSeriesDTO {
  losses: number;
  progress: string; // p.ej. "WLN" (W=win, L=loss, N=sin jugar)
  target: number;
  wins: number;
}

/** Entrada dentro de challengerleagues/grandmasterleagues/masterleagues. */
export interface LeagueItemDTO {
  freshBlood: boolean;
  wins: number;
  summonerId?: string; // encryptedSummonerId (en deprecación)
  puuid?: string;
  miniSeries?: MiniSeriesDTO;
  inactive: boolean;
  veteran: boolean;
  hotStreak: boolean;
  rank: string; // "I".."IV"
  leaguePoints: number;
  losses: number;
}

/** Respuesta de challenger/grandmaster/master leagues. */
export interface LeagueListDTO {
  leagueId: string;
  entries: LeagueItemDTO[];
  tier: string;
  name: string;
  queue: string;
}

/** /lol/league/v4/entries/{queue}/{tier}/{division} */
export interface LeagueEntryDTO {
  leagueId?: string;
  summonerId?: string;
  puuid?: string;
  queueType?: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
  inactive?: boolean;
  miniSeries?: MiniSeriesDTO;
}

export interface SummonerDTO {
  accountId?: string;
  profileIconId: number;
  revisionDate: number; // epoch ms
  id?: string; // encryptedSummonerId (en deprecación)
  puuid: string;
  summonerLevel: number;
}

// ===========================================================================
// MATCH-V5 (generado desde datos reales)
// ===========================================================================
`;

let body = '';
body += emit('MatchDTO', matches, {
  overrides: { metadata: 'MatchMetadata', info: 'MatchInfo' },
  comment: 'Respuesta de /lol/match/v5/matches/{matchId}',
});
body += '\n' + emit('MatchMetadata', matches.map((m) => m.metadata));
body += '\n' + emit('MatchInfo', matches.map((m) => m.info), {
  overrides: { participants: 'MatchParticipant[]', teams: 'MatchTeam[]' },
});
body += '\n' + emit('MatchParticipant', participants, {
  overrides: {
    challenges: 'ParticipantChallenges',
    perks: 'ParticipantPerks',
    missions: 'ParticipantMissions',
  },
  optionalKeys: new Set(['challenges', 'perks', 'missions']),
  comment: 'Un jugador en la partida (todos los campos del array info.participants).',
});
body += '\n' + emit('ParticipantChallenges', challenges, {
  optionalKeys: new Set(challenges.flatMap((c) => Object.keys(c))),
  comment: 'Métricas derivadas (todas opcionales: Riot las incluye según la partida).',
});
body += '\n' + emit('ParticipantMissions', missions);
body += '\n' + emit('ParticipantPerks', perks, {
  overrides: { statPerks: 'StatPerks', styles: 'PerkStyle[]' },
});
body += '\n' + emit('StatPerks', statPerks);
body += '\n' + emit('PerkStyle', styles, {
  overrides: { selections: 'PerkStyleSelection[]' },
});
body += '\n' + emit('PerkStyleSelection', selections);
body += '\n' + emit('MatchTeam', teams, {
  overrides: { bans: 'MatchBan[]', objectives: 'TeamObjectives' },
});
body += '\n' + emit('MatchBan', bans);
body += '\n' + emit('TeamObjectives', objectivesList, {
  allFields: 'Objective',
  comment: 'Cada objetivo: dragon, baron, riftHerald, tower, inhibitor, horde (grubs), atakhan...',
});
body += '\n' + emit('Objective', objectiveVals);

const out = HEADER + '\n' + body;
fs.writeFileSync(path.resolve('src/collector/riotTypes.ts'), out);
console.log(
  `riotTypes.ts generado: ${out.length} bytes | ` +
    `participants=${participants.length} challenges=${challenges.length}`,
);
