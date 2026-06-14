import type { ChampionRoleStat, MatchupStat, BuildStat } from './provider';

/**
 * Dataset local de ejemplo. Es deliberadamente pequeño: sirve como semilla y
 * como formato de referencia. Para datos reales y actualizados, implementa otro
 * StatsProvider que consuma tu propia API o un volcado que generes aparte
 * (respetando los ToS de la fuente).
 *
 * Ítems referenciados por id de Data Dragon:
 *   6655 Luden's, 3020 Sorcerer's, 4645 Shadowflame, 3157 Zhonya's,
 *   3089 Rabadon's, 6653 Liandry's, 3006 Berserker's, 3031 IE, 3094 RFC,
 *   3036 LDR, 3072 BT, 3153 BotRK, 6692 Eclipse, 3142 Youmuu's,
 *   3047 Plated Steelcaps, 3111 Mercury's.
 */

export const ROLE_STATS: ChampionRoleStat[] = [
  { championId: 'Ahri', role: 'MIDDLE', winRate: 0.515, pickRate: 0.11, banRate: 0.05 },
  { championId: 'Zed', role: 'MIDDLE', winRate: 0.498, pickRate: 0.09, banRate: 0.14 },
  { championId: 'Yasuo', role: 'MIDDLE', winRate: 0.492, pickRate: 0.10, banRate: 0.18 },
  { championId: 'Syndra', role: 'MIDDLE', winRate: 0.508, pickRate: 0.05, banRate: 0.03 },
  { championId: 'Viktor', role: 'MIDDLE', winRate: 0.512, pickRate: 0.06, banRate: 0.04 },
  { championId: 'Orianna', role: 'MIDDLE', winRate: 0.505, pickRate: 0.04, banRate: 0.02 },
  { championId: 'Darius', role: 'TOP', winRate: 0.518, pickRate: 0.08, banRate: 0.16 },
  { championId: 'Garen', role: 'TOP', winRate: 0.516, pickRate: 0.07, banRate: 0.04 },
  { championId: 'Fiora', role: 'TOP', winRate: 0.506, pickRate: 0.06, banRate: 0.09 },
  { championId: 'Jinx', role: 'BOTTOM', winRate: 0.520, pickRate: 0.13, banRate: 0.06 },
  { championId: 'Caitlyn', role: 'BOTTOM', winRate: 0.502, pickRate: 0.12, banRate: 0.05 },
  { championId: 'Kaisa', role: 'BOTTOM', winRate: 0.498, pickRate: 0.14, banRate: 0.04 },
  { championId: 'Lulu', role: 'UTILITY', winRate: 0.519, pickRate: 0.07, banRate: 0.05 },
  { championId: 'Thresh', role: 'UTILITY', winRate: 0.503, pickRate: 0.11, banRate: 0.06 },
  { championId: 'LeeSin', role: 'JUNGLE', winRate: 0.494, pickRate: 0.12, banRate: 0.07 },
  { championId: 'Viego', role: 'JUNGLE', winRate: 0.506, pickRate: 0.09, banRate: 0.08 },
];

export const MATCHUPS: MatchupStat[] = [
  { championId: 'Ahri', opponentId: 'Zed', role: 'MIDDLE', winRate: 0.47, games: 12000 },
  { championId: 'Ahri', opponentId: 'Yasuo', role: 'MIDDLE', winRate: 0.52, games: 9000 },
  { championId: 'Ahri', opponentId: 'Syndra', role: 'MIDDLE', winRate: 0.49, games: 6000 },
  { championId: 'Zed', opponentId: 'Ahri', role: 'MIDDLE', winRate: 0.53, games: 12000 },
  { championId: 'Zed', opponentId: 'Viktor', role: 'MIDDLE', winRate: 0.44, games: 5000 },
  { championId: 'Syndra', opponentId: 'Zed', role: 'MIDDLE', winRate: 0.55, games: 4000 },
  { championId: 'Darius', opponentId: 'Garen', role: 'TOP', winRate: 0.54, games: 8000 },
  { championId: 'Fiora', opponentId: 'Darius', role: 'TOP', winRate: 0.51, games: 7000 },
  { championId: 'Garen', opponentId: 'Darius', role: 'TOP', winRate: 0.46, games: 8000 },
];

export const BUILDS: BuildStat[] = [
  {
    championId: 'Ahri',
    role: 'MIDDLE',
    coreItemIds: [6655, 3020, 4645, 3157, 3089],
    summonerSpells: ['Flash', 'Ignite'],
    skillOrder: 'Q > E > W',
    notes: 'Empuja con Q y busca picks con E (encanto) tras nivel 6.',
  },
  {
    championId: 'Zed',
    role: 'MIDDLE',
    coreItemIds: [6692, 3142, 3036, 3814, 3156],
    summonerSpells: ['Flash', 'Ignite'],
    skillOrder: 'Q > E > W',
    notes: 'Sube prioridad Q para farmear a rango; all-in con R cuando el rival no tiene escape.',
  },
  {
    championId: 'Jinx',
    role: 'BOTTOM',
    coreItemIds: [3031, 3094, 3036, 3072, 3026],
    summonerSpells: ['Flash', 'Heal'],
    skillOrder: 'Q > W > E',
    notes: 'Resetea con pasiva tras kills/torres; posiciónate detrás en teamfights.',
  },
  {
    championId: 'Darius',
    role: 'TOP',
    coreItemIds: [6692, 3053, 3071, 3065, 3742],
    summonerSpells: ['Flash', 'Ghost'],
    skillOrder: 'Q > E > W',
    notes: 'Apila pasiva con el filo del hacha; busca el reset de R en peleas.',
  },
];
