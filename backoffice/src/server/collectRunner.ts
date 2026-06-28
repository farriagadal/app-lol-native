import fs from 'node:fs';
import path from 'node:path';
import { collect } from '../collector/collect';
import { buildDb } from './buildDb';
import type { CollectRequest, CollectStatus, CollectProgress } from './types';

/**
 * Orquesta una recolección lanzada desde el panel:
 *   collect (API de Riot -> matches.jsonl) -> buildDb (-> lol.db)
 * y persiste el estado (última actualización OK / último error) en
 * data/<region>/collect-status.json. Evita ejecuciones simultáneas por región.
 */
export class CollectRunner {
  private running = new Set<string>();
  private progress = new Map<string, CollectProgress>();

  constructor(private dataDir: string) {}

  /** Guarda el último progreso (lo consume el cliente por polling de /api/status). */
  private emit(p: CollectProgress): void {
    this.progress.set(p.region, p);
  }

  private statusFile(region: string): string {
    return path.join(this.dataDir, region, 'collect-status.json');
  }
  private seenFile(region: string): string {
    return path.join(this.dataDir, region, 'seen-matches.txt');
  }

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

  isRunning(region: string): boolean {
    return this.running.has(region);
  }

  status(region: string): CollectStatus {
    const s = this.readStatusFile(region);
    return {
      region,
      lastCollectedAt: s.lastCollectedAt,
      lastError: s.lastError,
      totalMatches: this.countMatches(region),
      running: this.running.has(region),
      progress: this.progress.get(region) ?? null,
    };
  }

  /** Lanza la recolección en segundo plano (no se ata a la petición HTTP). */
  async run(req: CollectRequest): Promise<CollectStatus> {
    const { region } = req;
    if (this.running.has(region)) return this.status(region);
    if (!req.apiKey?.trim()) {
      const prev = this.readStatusFile(region);
      this.writeStatusFile(region, { ...prev, lastError: 'Falta la API key de Riot.' });
      this.emit({ phase: 'error', region, collected: this.countMatches(region), target: req.maxMatches, message: 'Falta la API key de Riot.' });
      return this.status(region);
    }

    this.running.add(region);
    const before = this.countMatches(region);
    this.emit({ phase: 'starting', region, collected: before, target: req.maxMatches });

    let error: string | null = null;
    try {
      await collect({
        region,
        apiKey: req.apiKey.trim(),
        maxMatches: req.maxMatches,
        matchesPerPlayer: Math.min(100, Math.max(1, req.matchesPerPlayer)),
        maxPlayersPerBucket: Math.max(1, req.maxPlayersPerBucket ?? 40),
        tiers: req.tiers,
        startTime: req.startTime,
        endTime: req.endTime,
        onProgress: (p) =>
          this.emit({ phase: 'collecting', region, collected: p.collected, target: p.target, bucket: p.bucket }),
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    // Reconstruir la base si hay datos nuevos (o si aún no existe), para que lo
    // recolectado —parcial o completo— quede consultable. Así, si falló a mitad,
    // lo avanzado no se pierde y el siguiente intento continúa desde aquí.
    const after = this.countMatches(region);
    const dbExists = fs.existsSync(path.join(this.dataDir, region, 'lol.db'));
    if (after > 0 && (after > before || !dbExists)) {
      this.emit({ phase: 'building-db', region, collected: after, target: req.maxMatches });
      try {
        await buildDb(region, this.dataDir);
      } catch (err) {
        error = error ?? (err instanceof Error ? err.message : String(err));
      }
    }

    if (error) {
      const prev = this.readStatusFile(region);
      this.writeStatusFile(region, { lastCollectedAt: prev.lastCollectedAt, lastError: error });
      this.emit({ phase: 'error', region, collected: after, target: req.maxMatches, message: error });
    } else {
      this.writeStatusFile(region, { lastCollectedAt: Date.now(), lastError: null });
      this.emit({ phase: 'done', region, collected: after, target: req.maxMatches });
    }
    this.running.delete(region);
    return this.status(region);
  }
}
