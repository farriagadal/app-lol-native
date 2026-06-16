import type {
  StatsProvider,
  ChampionRoleStat,
  MatchupStat,
  BuildStat,
} from './provider';
import { ROLE_STATS, MATCHUPS, BUILDS } from './dataset';

/**
 * Proveedor por defecto basado en el dataset local embebido. Devuelve valores
 * neutros (50% win rate) cuando no hay datos para un campeón/matchup concreto,
 * de modo que el overlay siempre tenga algo que mostrar.
 */
export class StaticStatsProvider implements StatsProvider {
  readonly name = 'static-local';

  async roleStats(championId: string, role?: string): Promise<ChampionRoleStat[]> {
    return ROLE_STATS.filter(
      (s) => s.championId === championId && (!role || s.role === role),
    );
  }

  async matchup(
    championId: string,
    opponentId: string,
    role?: string,
  ): Promise<MatchupStat | null> {
    const direct = MATCHUPS.find(
      (m) =>
        m.championId === championId &&
        m.opponentId === opponentId &&
        (!role || m.role === role),
    );
    if (direct) return direct;

    // Si existe el matchup inverso, se deriva (1 - winRate).
    const inverse = MATCHUPS.find(
      (m) =>
        m.championId === opponentId &&
        m.opponentId === championId &&
        (!role || m.role === role),
    );
    if (inverse) {
      return {
        championId,
        opponentId,
        role: inverse.role,
        winRate: Number((1 - inverse.winRate).toFixed(3)),
        games: inverse.games,
      };
    }
    return null;
  }

  async build(championId: string, role?: string): Promise<BuildStat | null> {
    return (
      BUILDS.find((b) => b.championId === championId && (!role || b.role === role)) ??
      BUILDS.find((b) => b.championId === championId) ??
      null
    );
  }

  async topPicks(role: string, limit: number): Promise<ChampionRoleStat[]> {
    return ROLE_STATS.filter((s) => s.role === role)
      // Relevancia simple: win rate ponderado por pick rate.
      .sort((a, b) => b.winRate * (0.5 + b.pickRate) - a.winRate * (0.5 + a.pickRate))
      .slice(0, limit);
  }
}
