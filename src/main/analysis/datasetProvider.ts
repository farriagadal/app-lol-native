import * as fs from 'fs';
import * as path from 'path';
import type {
  StatsProvider,
  ChampionRoleStat,
  MatchupStat,
  BuildStat,
} from './provider';

interface StatsFile {
  region: string;
  ddragonVersion: string;
  totalGames: number;
  rows: ChampionRoleStat[];
}

/**
 * Proveedor que lee las estadísticas calculadas por el colector
 * (data/<region>/champion-stats.json). Es el "dataset real" que reemplaza al
 * StaticStatsProvider de ejemplo una vez que has corrido:
 *   node dist/collector/index.js collect   --region la2
 *   node dist/collector/index.js aggregate --region la2
 *
 * Matchups y builds NO los genera este colector (requieren agregación aparte),
 * así que esos métodos devuelven null. Puedes combinar con StaticStatsProvider
 * si quieres builds de ejemplo.
 */
export class DatasetStatsProvider implements StatsProvider {
  readonly name: string;
  private rows: ChampionRoleStat[] | null = null;

  constructor(private filePath: string) {
    this.name = `dataset:${path.basename(path.dirname(filePath))}`;
  }

  /** Crea el proveedor apuntando a data/<region>/champion-stats.json. */
  static forRegion(region: string, dataDir = 'data'): DatasetStatsProvider {
    return new DatasetStatsProvider(
      path.resolve(process.cwd(), dataDir, region, 'champion-stats.json'),
    );
  }

  private load(): ChampionRoleStat[] {
    if (this.rows) return this.rows;
    if (!fs.existsSync(this.filePath)) {
      this.rows = [];
      return this.rows;
    }
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as StatsFile;
    this.rows = parsed.rows ?? [];
    return this.rows;
  }

  async roleStats(championId: string, role?: string): Promise<ChampionRoleStat[]> {
    return this.load().filter(
      (s) => s.championId === championId && (!role || s.role === role),
    );
  }

  async matchup(): Promise<MatchupStat | null> {
    return null; // no calculado por este dataset
  }

  async build(): Promise<BuildStat | null> {
    return null; // no calculado por este dataset
  }

  async topPicks(role: string, limit: number): Promise<ChampionRoleStat[]> {
    return this.load()
      .filter((s) => s.role === role)
      // Relevancia: win rate ponderado por pick rate (igual criterio que el static).
      .sort((a, b) => b.winRate * (0.5 + b.pickRate) - a.winRate * (0.5 + a.pickRate))
      .slice(0, limit);
  }
}
