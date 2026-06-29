import { MongoClient, Collection } from 'mongodb';
import type { MatchDTO } from './riotTypes';

export interface LeanMatch {
  _id: string;
  region: string;
  queueId: number;
  gameVersion: string;
  gameCreation: number;
  tier: string;
  participants: Array<{ championName: string; teamPosition: string; win: boolean }>;
  bans: Array<{ championId: number }>;
}

export class MongoStore {
  private col: Collection<LeanMatch>;

  constructor(
    client: MongoClient,
    private region: string,
  ) {
    this.col = client.db('lol').collection<LeanMatch>('matches');
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ region: 1 });
  }

  async loadSeenMatchIds(): Promise<Set<string>> {
    const docs = await this.col
      .find({ region: this.region }, { projection: { _id: 1 } })
      .toArray();
    return new Set(docs.map((d: { _id: string }) => String(d._id)));
  }

  async save(matchId: string, match: MatchDTO, tier: string): Promise<void> {
    const { info } = match;
    const lean: LeanMatch = {
      _id: matchId,
      region: this.region,
      queueId: info.queueId,
      gameVersion: info.gameVersion,
      gameCreation: info.gameCreation,
      tier,
      participants: info.participants.map((p) => ({
        championName: p.championName,
        teamPosition: p.teamPosition,
        win: p.win,
      })),
      bans: info.teams.flatMap((t) => t.bans.map((b) => ({ championId: b.championId }))),
    };
    await this.col.replaceOne({ _id: matchId } as never, lean, { upsert: true });
  }

  async loadTierCounts(): Promise<Map<string, number>> {
    const agg = await this.col
      .aggregate<{ _id: string; count: number }>([
        { $match: { region: this.region } },
        { $group: { _id: '$tier', count: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(agg.map((a: { _id: string; count: number }) => [a._id, a.count] as [string, number]));
  }

  countMatches(): Promise<number> {
    return this.col.countDocuments({ region: this.region });
  }

  async *iterateMatches(): AsyncGenerator<LeanMatch> {
    const cursor = this.col.find({ region: this.region });
    for await (const doc of cursor) {
      yield doc;
    }
  }
}
