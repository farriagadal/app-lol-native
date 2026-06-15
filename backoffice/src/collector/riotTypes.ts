/**
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

/** Respuesta de /lol/match/v5/matches/{matchId} */
export interface MatchDTO {
  info: MatchInfo;
  metadata: MatchMetadata;
}

export interface MatchMetadata {
  dataVersion: string;
  matchId: string;
  participants: string[];
}

export interface MatchInfo {
  endOfGameResult: string;
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp: number;
  gameId: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participants: MatchParticipant[];
  platformId: string;
  queueId: number;
  teams: MatchTeam[];
  tournamentCode: string;
}

/** Un jugador en la partida (todos los campos del array info.participants). */
export interface MatchParticipant {
  allInPings: number;
  assistMePings: number;
  assists: number;
  baronKills: number;
  basicPings: number;
  causedGameEndFromIGNBSurrender: boolean;
  challenges?: ParticipantChallenges;
  champExperience: number;
  championId: number;
  championName: string;
  championTransform: number;
  champLevel: number;
  commandPings: number;
  consumablesPurchased: number;
  damageDealtToBuildings: number;
  damageDealtToEpicMonsters: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  dangerPings: number;
  deaths: number;
  detectorWardsPlaced: number;
  doubleKills: number;
  dragonKills: number;
  eligibleForProgression: boolean;
  enemyMissingPings: number;
  enemyVisionPings: number;
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;
  gameEndedInEarlySurrender: boolean;
  gameEndedInIGNBSurrender: boolean;
  gameEndedInSurrender: boolean;
  getBackPings: number;
  goldEarned: number;
  goldSpent: number;
  holdPings: number;
  individualPosition: string;
  inhibitorKills: number;
  inhibitorsLost: number;
  inhibitorTakedowns: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  itemsPurchased: number;
  killingSprees: number;
  kills: number;
  lane: string;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  magicDamageTaken: number;
  missions?: ParticipantMissions;
  needVisionPings: number;
  neutralMinionsKilled: number;
  nexusKills: number;
  nexusLost: number;
  nexusTakedowns: number;
  objectivesStolen: number;
  objectivesStolenAssists: number;
  onMyWayPings: number;
  participantId: number;
  pentaKills: number;
  perks?: ParticipantPerks;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  physicalDamageTaken: number;
  placement: number;
  playerAugment1: number;
  playerAugment2: number;
  playerAugment3: number;
  playerAugment4: number;
  playerAugment5: number;
  playerAugment6: number;
  PlayerBehavior: Record<string, unknown>;
  PlayerScore0: number;
  PlayerScore1: number;
  PlayerScore10: number;
  PlayerScore11: number;
  PlayerScore2: number;
  PlayerScore3: number;
  PlayerScore4: number;
  PlayerScore5: number;
  PlayerScore6: number;
  PlayerScore7: number;
  PlayerScore8: number;
  PlayerScore9: number;
  playerSubteamId: number;
  positionAssignedByMatchmaking: string;
  profileIcon: number;
  pushPings: number;
  puuid: string;
  quadraKills: number;
  retreatPings: number;
  riotIdGameName: string;
  riotIdTagline: string;
  role: string;
  roleBoundItem: number;
  selectedRolePreferences: string;
  sightWardsBoughtInGame: number;
  spell1Casts: number;
  spell2Casts: number;
  spell3Casts: number;
  spell4Casts: number;
  subteamPlacement: number;
  summoner1Casts: number;
  summoner1Id: number;
  summoner2Casts: number;
  summoner2Id: number;
  summonerId: string;
  summonerLevel: number;
  summonerName: string;
  teamEarlySurrendered: boolean;
  teamId: number;
  teamIGNBSurrendered: boolean;
  teamPosition: string;
  timeCCingOthers: number;
  timePlayed: number;
  totalAllyJungleMinionsKilled: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageShieldedOnTeammates: number;
  totalDamageTaken: number;
  totalEnemyJungleMinionsKilled: number;
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalMinionsKilled: number;
  totalTimeCCDealt: number;
  totalTimeSpentDead: number;
  totalUnitsHealed: number;
  tripleKills: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  trueDamageTaken: number;
  turretKills: number;
  turretsLost: number;
  turretTakedowns: number;
  unrealKills: number;
  visionClearedPings: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  wardsKilled: number;
  wardsPlaced: number;
  wasPremadeWithIGNBGameEndCauser: boolean;
  wasPremadeWithSevereTransgressor: boolean;
  wasSevereTransgressor: boolean;
  win: boolean;
}

/** Métricas derivadas (todas opcionales: Riot las incluye según la partida). */
export interface ParticipantChallenges {
  "12AssistStreakCount"?: number;
  abilityUses?: number;
  acesBefore15Minutes?: number;
  alliedJungleMonsterKills?: number;
  baronBuffGoldAdvantageOverThreshold?: number;
  baronTakedowns?: number;
  blastConeOppositeOpponentCount?: number;
  bountyGold?: number;
  buffsStolen?: number;
  completeSupportQuestInTime?: number;
  controlWardsPlaced?: number;
  controlWardTimeCoverageInRiverOrEnemyHalf?: number;
  damagePerMinute?: number;
  damageTakenOnTeamPercentage?: number;
  dancedWithRiftHerald?: number;
  deathsByEnemyChamps?: number;
  dodgeSkillShotsSmallWindow?: number;
  doubleAces?: number;
  dragonTakedowns?: number;
  earliestBaron?: number;
  earliestDragonTakedown?: number;
  earliestElderDragon?: number;
  earlyLaningPhaseGoldExpAdvantage?: number;
  effectiveHealAndShielding?: number;
  elderDragonKillsWithOpposingSoul?: number;
  elderDragonMultikills?: number;
  enemyChampionImmobilizations?: number;
  enemyJungleMonsterKills?: number;
  epicMonsterKillsNearEnemyJungler?: number;
  epicMonsterKillsWithin30SecondsOfSpawn?: number;
  epicMonsterSteals?: number;
  epicMonsterStolenWithoutSmite?: number;
  fasterSupportQuestCompletion?: number;
  fastestLegendary?: number;
  firstTurretKilled?: number;
  firstTurretKilledTime?: number;
  fistBumpParticipation?: number;
  flawlessAces?: number;
  fullTeamTakedown?: number;
  gameLength?: number;
  getTakedownsInAllLanesEarlyJungleAsLaner?: number;
  goldPerMinute?: number;
  hadOpenNexus?: number;
  HealFromMapSources?: number;
  highestChampionDamage?: number;
  highestCrowdControlScore?: number;
  highestWardKills?: number;
  immobilizeAndKillWithAlly?: number;
  InfernalScalePickup?: number;
  initialBuffCount?: number;
  initialCrabCount?: number;
  jungleCsBefore10Minutes?: number;
  junglerKillsEarlyJungle?: number;
  junglerTakedownsNearDamagedEpicMonster?: number;
  kda?: number;
  killAfterHiddenWithAlly?: number;
  killedChampTookFullTeamDamageSurvived?: number;
  killingSprees?: number;
  killParticipation?: number;
  killsNearEnemyTurret?: number;
  killsOnLanersEarlyJungleAsJungler?: number;
  killsOnOtherLanesEarlyJungleAsLaner?: number;
  killsOnRecentlyHealedByAramPack?: number;
  killsUnderOwnTurret?: number;
  killsWithHelpFromEpicMonster?: number;
  knockEnemyIntoTeamAndKill?: number;
  kTurretsDestroyedBeforePlatesFall?: number;
  landSkillShotsEarlyGame?: number;
  laneMinionsFirst10Minutes?: number;
  laningPhaseGoldExpAdvantage?: number;
  legendaryCount?: number;
  legendaryItemUsed?: number[] | unknown[];
  lostAnInhibitor?: number;
  maxCsAdvantageOnLaneOpponent?: number;
  maxKillDeficit?: number;
  maxLevelLeadLaneOpponent?: number;
  mejaisFullStackInTime?: number;
  moreEnemyJungleThanOpponent?: number;
  multiKillOneSpell?: number;
  multikills?: number;
  multikillsAfterAggressiveFlash?: number;
  multiTurretRiftHeraldCount?: number;
  outerTurretExecutesBefore10Minutes?: number;
  outnumberedKills?: number;
  outnumberedNexusKill?: number;
  perfectDragonSoulsTaken?: number;
  perfectGame?: number;
  pickKillWithAlly?: number;
  playedChampSelectPosition?: number;
  poroExplosions?: number;
  quickCleanse?: number;
  quickFirstTurret?: number;
  quickSoloKills?: number;
  riftHeraldTakedowns?: number;
  saveAllyFromDeath?: number;
  scuttleCrabKills?: number;
  shortestTimeToAceFromFirstTakedown?: number;
  skillshotsDodged?: number;
  skillshotsHit?: number;
  snowballsHit?: number;
  soloBaronKills?: number;
  soloKills?: number;
  soloTurretsLategame?: number;
  stealthWardsPlaced?: number;
  survivedSingleDigitHpCount?: number;
  survivedThreeImmobilizesInFight?: number;
  SWARM_DefeatAatrox?: number;
  SWARM_DefeatBriar?: number;
  SWARM_DefeatMiniBosses?: number;
  SWARM_EvolveWeapon?: number;
  SWARM_Have3Passives?: number;
  SWARM_KillEnemy?: number;
  SWARM_PickupGold?: number;
  SWARM_ReachLevel50?: number;
  SWARM_Survive15Min?: number;
  SWARM_WinWith5EvolvedWeapons?: number;
  takedownOnFirstTurret?: number;
  takedowns?: number;
  takedownsAfterGainingLevelAdvantage?: number;
  takedownsBeforeJungleMinionSpawn?: number;
  takedownsFirstXMinutes?: number;
  takedownsInAlcove?: number;
  takedownsInEnemyFountain?: number;
  teamBaronKills?: number;
  teamDamagePercentage?: number;
  teamElderDragonKills?: number;
  teamRiftHeraldKills?: number;
  teleportTakedowns?: number;
  tookLargeDamageSurvived?: number;
  turretPlatesTaken?: number;
  turretsTakenWithRiftHerald?: number;
  turretTakedowns?: number;
  twentyMinionsIn3SecondsCount?: number;
  twoWardsOneSweeperCount?: number;
  unseenRecalls?: number;
  visionScoreAdvantageLaneOpponent?: number;
  visionScorePerMinute?: number;
  voidMonsterKill?: number;
  wardsGuarded?: number;
  wardTakedowns?: number;
  wardTakedownsBefore20M?: number;
}

export interface ParticipantMissions {
  playerScore0: number;
  playerScore1: number;
  playerScore10: number;
  playerScore11: number;
  playerScore2: number;
  playerScore3: number;
  playerScore4: number;
  playerScore5: number;
  playerScore6: number;
  playerScore7: number;
  playerScore8: number;
  playerScore9: number;
}

export interface ParticipantPerks {
  statPerks: StatPerks;
  styles: PerkStyle[];
}

export interface StatPerks {
  defense: number;
  flex: number;
  offense: number;
}

export interface PerkStyle {
  description: string;
  selections: PerkStyleSelection[];
  style: number;
}

export interface PerkStyleSelection {
  perk: number;
  var1: number;
  var2: number;
  var3: number;
}

export interface MatchTeam {
  bans: MatchBan[];
  objectives: TeamObjectives;
  teamId: number;
  win: boolean;
}

export interface MatchBan {
  championId: number;
  pickTurn: number;
}

/** Cada objetivo: dragon, baron, riftHerald, tower, inhibitor, horde (grubs), atakhan... */
export interface TeamObjectives {
  atakhan: Objective;
  baron: Objective;
  champion: Objective;
  dragon: Objective;
  horde: Objective;
  inhibitor: Objective;
  riftHerald: Objective;
  tower: Objective;
}

export interface Objective {
  first: boolean;
  kills: number;
}
