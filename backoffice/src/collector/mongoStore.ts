import { MongoClient, Collection, Filter } from 'mongodb';
import type { MatchDTO } from './riotTypes';
import { log } from './log';
import type { StatFilter, MatchListResponse, MatchDetail } from '../server/types';

export interface StoredMatch {
  _id: string;
  region: string;
  queueId: number;
  gameVersion: string;
  gameCreation: number;
  gameDuration: number;
  tier: string;
  winningTeam: number | null;
  participants: Array<{
    championName: string;
    teamPosition: string;
    teamId: number;
    win: boolean;
    champLevel: number;
    kills: number;
    deaths: number;
    assists: number;
    goldEarned: number;
    cs: number;
    dmgToChamps: number;
    items: number[];
    summoner1Id: number;
    summoner2Id: number;
    keystone: number | null;
    primaryStyle: number | null;
    subStyle: number | null;
  }>;
  bans: Array<{ championId: number; teamId: number }>;
  objectives: Array<{
    teamId: number;
    win: boolean;
    baronKills: number;
    dragonKills: number;
    riftHeraldKills: number;
    towerKills: number;
    inhibitorKills: number;
    championKills: number;
  }>;
}

/** Alias para compatibilidad con código que importa LeanMatch. */
export type LeanMatch = StoredMatch;

function patchOf(gameVersion: string): string {
  const parts = gameVersion.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : gameVersion;
}

export class MongoStore {
  private col: Collection<StoredMatch>;

  constructor(
    client: MongoClient,
    private region: string,
  ) {
    this.col = client.db('lol').collection<StoredMatch>('matches');
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ region: 1 });
    await this.col.createIndex({ region: 1, tier: 1 });
    await this.col.createIndex({ region: 1, gameCreation: -1 });
    await this.col.createIndex({ region: 1, 'participants.championName': 1 });
  }

  async loadSeenMatchIds(): Promise<Set<string>> {
    const docs = await this.col
      .find({ region: this.region }, { projection: { _id: 1 } })
      .toArray();
    return new Set(docs.map((d) => String(d._id)));
  }

  private toStored(matchId: string, match: MatchDTO, tier: string): StoredMatch {
    const { info } = match;
    const winningTeam = info.teams.find((t) => t.win)?.teamId ?? null;

    return {
      _id: matchId,
      region: this.region,
      queueId: info.queueId,
      gameVersion: info.gameVersion,
      gameCreation: info.gameCreation,
      gameDuration: info.gameDuration,
      tier,
      winningTeam,
      participants: info.participants.map((p) => {
        const styles =
          (p.perks as { styles?: Array<{ style: number; selections?: Array<{ perk: number }> }> })
            ?.styles ?? [];
        return {
          championName: p.championName,
          teamPosition: p.teamPosition,
          teamId: p.teamId,
          win: p.win,
          champLevel: p.champLevel ?? 0,
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          assists: p.assists ?? 0,
          goldEarned: p.goldEarned ?? 0,
          cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
          dmgToChamps: p.totalDamageDealtToChampions ?? 0,
          items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map(
            (x) => (x as number | undefined) ?? 0,
          ),
          summoner1Id: (p.summoner1Id as number | undefined) ?? 0,
          summoner2Id: (p.summoner2Id as number | undefined) ?? 0,
          keystone: styles[0]?.selections?.[0]?.perk ?? null,
          primaryStyle: styles[0]?.style ?? null,
          subStyle: styles[1]?.style ?? null,
        };
      }),
      bans: info.teams.flatMap((t) =>
        t.bans
          .filter((b) => b.championId >= 0)
          .map((b) => ({ championId: b.championId, teamId: t.teamId })),
      ),
      objectives: info.teams.map((t) => {
        const o = (t.objectives as unknown as Record<string, { kills?: number } | undefined>) ?? {};
        const k = (x: string): number =>
          typeof o[x]?.kills === 'number' ? (o[x]!.kills as number) : 0;
        return {
          teamId: t.teamId,
          win: t.win,
          baronKills: k('baron'),
          dragonKills: k('dragon'),
          riftHeraldKills: k('riftHerald'),
          towerKills: k('tower'),
          inhibitorKills: k('inhibitor'),
          championKills: k('champion'),
        };
      }),
    };
  }

  /** Guarda un lote de partidas en MongoDB con hasta 3 reintentos y backoff. */
  async bulkSave(items: Array<{ matchId: string; match: MatchDTO; tier: string }>): Promise<void> {
    if (items.length === 0) return;
    const ops = items.map(({ matchId, match, tier }) => ({
      replaceOne: {
        filter: { _id: matchId } as never,
        replacement: this.toStored(matchId, match, tier),
        upsert: true,
      },
    }));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.col.bulkWrite(ops, { ordered: false });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 3) throw new Error(`MongoDB bulkSave falló tras 3 intentos: ${msg}`);
        const delay = attempt * 2000;
        log.warn(`MongoDB bulkSave intento ${attempt} falló: ${msg}. Reintentando en ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async loadTierCounts(): Promise<Map<string, number>> {
    const agg = await this.col
      .aggregate<{ _id: string; count: number }>([
        { $match: { region: this.region } },
        { $group: { _id: '$tier', count: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(agg.map((a) => [a._id, a.count]));
  }

  countMatches(): Promise<number> {
    return this.col.countDocuments({ region: this.region });
  }

  async *iterateMatches(): AsyncGenerator<StoredMatch> {
    const cursor = this.col.find({ region: this.region });
    for await (const doc of cursor) {
      yield doc;
    }
  }

  /** Regiones disponibles en la colección. */
  async regions(): Promise<string[]> {
    return this.col.distinct('region') as Promise<string[]>;
  }

  /** Lista paginada de partidas para la vista Partidas del backoffice. */
  async matchList(
    regions: string[],
    f: StatFilter,
    limit: number,
    offset: number,
  ): Promise<MatchListResponse> {
    if (!regions.length) return { total: 0, matches: [] };

    const filter = this.buildFilter(regions, f);

    const [total, docs] = await Promise.all([
      this.col.countDocuments(filter),
      this.col
        .find(filter, {
          projection: {
            _id: 1,
            gameVersion: 1,
            gameCreation: 1,
            gameDuration: 1,
            tier: 1,
            winningTeam: 1,
            'participants.championName': 1,
            'participants.teamId': 1,
            'participants.teamPosition': 1,
          },
        })
        .sort({ gameCreation: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);

    const matches = docs.map((doc) => {
      const parts = doc.participants ?? [];
      const blue = parts.filter((p) => p.teamId === 100);
      const red = parts.filter((p) => p.teamId === 200);
      return {
        matchId: String(doc._id),
        patch: patchOf(doc.gameVersion ?? ''),
        tier: doc.tier ?? null,
        gameDuration: doc.gameDuration ?? 0,
        gameCreation: doc.gameCreation ?? 0,
        winningTeam: doc.winningTeam ?? null,
        blueChamps: blue.map((p) => p.championName),
        redChamps: red.map((p) => p.championName),
        blueRoles: blue.map((p) => p.teamPosition),
        redRoles: red.map((p) => p.teamPosition),
      };
    });

    return { total, matches };
  }

  /** Scoreboard completo de una partida para la vista Partidas. */
  async matchDetail(matchId: string): Promise<MatchDetail | null> {
    const doc = await this.col.findOne({ _id: matchId } as never);
    if (!doc) return null;

    const teamKills = new Map<number, number>();
    for (const p of doc.participants ?? []) {
      teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + (p.kills ?? 0));
    }

    return {
      matchId: String(doc._id),
      patch: patchOf(doc.gameVersion ?? ''),
      gameDuration: doc.gameDuration ?? 0,
      gameCreation: doc.gameCreation ?? 0,
      winningTeam: doc.winningTeam ?? null,
      tier: doc.tier ?? null,
      participants: (doc.participants ?? []).map((p, i) => {
        const d = p.deaths ?? 0;
        const k = p.kills ?? 0;
        const a = p.assists ?? 0;
        const tk = teamKills.get(p.teamId) ?? 1;
        return {
          teamId: p.teamId ?? (i < 5 ? 100 : 200),
          participantId: i + 1,
          puuid: null,
          championName: p.championName,
          role: p.teamPosition ?? '',
          riotId: null,
          win: p.win ?? false,
          champLevel: p.champLevel ?? 0,
          kills: k,
          deaths: d,
          assists: a,
          kda: d === 0 ? k + a : (k + a) / d,
          cs: p.cs ?? 0,
          killParticipation: tk > 0 ? (k + a) / tk : null,
          dmgToChamps: p.dmgToChamps ?? 0,
          goldEarned: p.goldEarned ?? 0,
          items: p.items ?? [0, 0, 0, 0, 0, 0, 0],
          summoner1: p.summoner1Id ?? null,
          summoner2: p.summoner2Id ?? null,
          keystone: p.keystone ?? null,
          primaryStyle: p.primaryStyle ?? null,
          subStyle: p.subStyle ?? null,
        };
      }),
      teams: (doc.objectives ?? []).map((o) => ({
        teamId: o.teamId,
        win: o.win ?? false,
        baronKills: o.baronKills ?? 0,
        dragonKills: o.dragonKills ?? 0,
        riftHeraldKills: o.riftHeraldKills ?? 0,
        towerKills: o.towerKills ?? 0,
        inhibitorKills: o.inhibitorKills ?? 0,
        championKills: o.championKills ?? 0,
      })),
    };
  }

  private buildFilter(regions: string[], f: StatFilter): Filter<StoredMatch> {
    const filter: Filter<StoredMatch> = {
      region: regions.length === 1 ? regions[0] : { $in: regions },
      gameDuration: { $gte: 240 },
    };

    if (f.patch && f.patch !== 'all') {
      const patches = f.patch.split(',').filter(Boolean);
      const regexes = patches.map((p) => new RegExp(`^${p.replace('.', '\\.')}\\b`));
      (filter as Record<string, unknown>).gameVersion =
        regexes.length === 1 ? { $regex: regexes[0] } : { $in: regexes };
    }

    if (f.tier && f.tier !== 'all') {
      const tiers = f.tier.split(',').filter(Boolean);
      (filter as Record<string, unknown>).tier = tiers.length === 1 ? tiers[0] : { $in: tiers };
    }

    if (f.dateFrom || f.dateTo) {
      const range: Record<string, number> = {};
      if (f.dateFrom) range.$gte = new Date(f.dateFrom).getTime();
      if (f.dateTo) {
        const d = new Date(f.dateTo);
        d.setDate(d.getDate() + 1);
        range.$lt = d.getTime();
      }
      (filter as Record<string, unknown>).gameCreation = range;
    }

    if (f.champion && f.champion !== 'all') {
      (filter as Record<string, unknown>)['participants.championName'] = f.champion;
    }

    if (f.role && f.role !== 'ALL') {
      (filter as Record<string, unknown>)['participants.teamPosition'] = f.role;
    }

    return filter;
  }
}
