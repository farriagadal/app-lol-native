import fs from 'node:fs';
import path from 'node:path';
import { collect } from '../../collector/collect';
import { buildDb } from './dbBuilder';
import type { DataDragon } from '../services/dataDragon';
import type { CollectRequest, CollectStatus, CollectProgress } from '../../shared/types';

/**
 * Orquesta una recolección lanzada desde la app:
 *   collect (API de Riot -> matches.jsonl) -> buildDb (-> lol.db)
 * y persiste el estado (última actualización OK / último error) en
 * data/<region>/collect-status.json. Evita ejecuciones simultáneas por región.
 */
export class CollectRunner {
  private running = new Set<string>();

  constructor(
    private ddragon: DataDragon,
    private dataDir = path.resolve(process.cwd(), 'data'),
  ) {}

  private statusFile(region: string): string {
    return path.join(this.dataDir, region, 'collect-status.json');
  }
  private seenFile(region: string): string {
    return path.join(this.dataDir, region, 'seen-matches.txt');
  }

  /** Cuenta partidas en disco contando líneas de seen-matches.txt. */
  private countMatches(region: string): number {
    const f = this.seenFile(region);
    if (!fs.existsSync(f)) return 0;
    const txt = fs.readFileSync(f, 'utf8');
    let n = 0;
    for (let i = 0; i < txt.length; i++) if (txt[i] === '\n') n++;
    return n;
  }

  private readStatusFile(region: string): { lastCollectedAt: number | null; lastError: string | null } {
    try {
      return JSON.parse(fs.readFileSync(this.statusFile(region), 'utf8'));
    } catch {
      return { lastCollectedAt: null, lastError: null };
    }
  }
  private writeStatusFile(
    region: string,
    s: { lastCollectedAt: number | null; lastError: string | null },
  ): void {
    fs.mkdirSync(path.join(this.dataDir, region), { recursive: true });
    fs.writeFileSync(this.statusFile(region), JSON.stringify(s, null, 2));
  }

  status(region: string): CollectStatus {
    const s = this.readStatusFile(region);
    return {
      region,
      lastCollectedAt: s.lastCollectedAt,
      lastError: s.lastError,
      totalMatches: this.countMatches(region),
      running: this.running.has(region),
    };
  }

  async run(
    req: CollectRequest,
    onProgress: (p: CollectProgress) => void,
  ): Promise<CollectStatus> {
    const { region } = req;
    if (this.running.has(region)) return this.status(region); // ya en curso
    if (!req.apiKey?.trim()) {
      const prev = this.readStatusFile(region);
      this.writeStatusFile(region, { ...prev, lastError: 'Falta la API key de Riot.' });
      onProgress({ phase: 'error', region, collected: this.countMatches(region), target: req.maxMatches, message: 'Falta la API key de Riot.' });
      return this.status(region);
    }

    this.running.add(region);
    onProgress({ phase: 'starting', region, collected: this.countMatches(region), target: req.maxMatches });
    try {
      await collect({
        region,
        apiKey: req.apiKey.trim(),
        maxMatches: req.maxMatches,
        matchesPerPlayer: Math.min(100, Math.max(1, req.matchesPerPlayer)),
        maxPlayersPerBucket: Math.max(1, req.maxPlayersPerBucket ?? 40),
        onProgress: (p) =>
          onProgress({ phase: 'collecting', region, collected: p.collected, target: p.target, bucket: p.bucket }),
      });

      onProgress({ phase: 'building-db', region, collected: this.countMatches(region), target: req.maxMatches });
      await buildDb({
        region,
        championName: (id) => this.ddragon.championByKey(id)?.id ?? null,
        dataDir: this.dataDir,
      });

      this.writeStatusFile(region, { lastCollectedAt: Date.now(), lastError: null });
      const status = this.status(region);
      onProgress({ phase: 'done', region, collected: status.totalMatches, target: req.maxMatches });
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const prev = this.readStatusFile(region);
      this.writeStatusFile(region, { lastCollectedAt: prev.lastCollectedAt, lastError: msg });
      onProgress({ phase: 'error', region, collected: this.countMatches(region), target: req.maxMatches, message: msg });
      return this.status(region);
    } finally {
      this.running.delete(region);
    }
  }
}
