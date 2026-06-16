/**
 * Contrato del proveedor de estadísticas. Permite conectar distintas fuentes
 * de win rates / counters (un dataset local, una API propia, un scraper que
 * respete los ToS del sitio de origen, etc.) sin tocar la lógica del overlay.
 */
export interface ChampionRoleStat {
  championId: string; // id Data Dragon (p.ej. "Ahri")
  role: string;       // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY
  winRate: number;    // 0..1
  pickRate: number;   // 0..1
  banRate?: number;   // 0..1
}

export interface MatchupStat {
  championId: string;     // campeón propio
  opponentId: string;     // rival
  role: string;
  winRate: number;        // 0..1 del propio contra el rival
  games?: number;
}

export interface BuildStat {
  championId: string;
  role?: string;
  coreItemIds: number[];
  summonerSpells?: string[];
  skillOrder?: string;
  notes?: string;
}

export interface StatsProvider {
  readonly name: string;
  /** Win rate / pick rate por campeón y rol. */
  roleStats(championId: string, role?: string): Promise<ChampionRoleStat[]>;
  /** Matchup del campeón propio frente a un rival en un rol. */
  matchup(
    championId: string,
    opponentId: string,
    role?: string,
  ): Promise<MatchupStat | null>;
  /** Build recomendada para un campeón (opcionalmente en un rol). */
  build(championId: string, role?: string): Promise<BuildStat | null>;
  /** Mejores picks para un rol, ordenados por relevancia. */
  topPicks(role: string, limit: number): Promise<ChampionRoleStat[]>;
}
