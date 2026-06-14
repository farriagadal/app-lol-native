import type { DataDragon } from '../services/dataDragon';
import type { StatsProvider } from './provider';
import type { BuildAdvice, MatchupAdvice, PickAdvice } from '../../shared/types';

function difficultyFromWinRate(wr: number): 'easy' | 'even' | 'hard' {
  if (wr >= 0.52) return 'easy';
  if (wr <= 0.48) return 'hard';
  return 'even';
}

/**
 * Traduce las estadísticas crudas del StatsProvider a los consejos de alto
 * nivel que consume la UI, resolviendo nombres/iconos con Data Dragon.
 */
export class AnalysisEngine {
  constructor(
    private readonly ddragon: DataDragon,
    private readonly provider: StatsProvider,
  ) {}

  async buildAdvice(championId: string, role?: string): Promise<BuildAdvice | undefined> {
    const champ = this.ddragon.championById(championId);
    const build = await this.provider.build(championId, role);
    if (!champ || !build) return undefined;

    return {
      championName: champ.name,
      championIconUrl: this.ddragon.championIconUrl(champ.id) ?? undefined,
      coreItems: build.coreItemIds.map((id) => {
        const item = this.ddragon.item(id);
        return {
          id,
          name: item?.name ?? `Ítem ${id}`,
          iconUrl: this.ddragon.itemIconUrl(id) ?? undefined,
        };
      }),
      summonerSpells: build.summonerSpells,
      skillOrder: build.skillOrder,
      notes: build.notes,
    };
  }

  async matchupAdvice(
    championId: string,
    opponentId: string,
    role?: string,
  ): Promise<MatchupAdvice | undefined> {
    const self = this.ddragon.championById(championId);
    const opp = this.ddragon.championById(opponentId);
    if (!self || !opp) return undefined;

    const stat = await this.provider.matchup(championId, opponentId, role);
    const winRate = stat?.winRate ?? 0.5;
    const difficulty = difficultyFromWinRate(winRate);

    const tips: string[] = [];
    if (difficulty === 'hard') {
      tips.push('Matchup desfavorable: juega seguro, pide ganks y farmea bajo torre.');
    } else if (difficulty === 'easy') {
      tips.push('Tienes ventaja en línea: presiona temprano y niega CS/experiencia.');
    } else {
      tips.push('Línea pareja: el primer error decide; cuidado con los timings de nivel.');
    }

    return {
      championName: self.name,
      opponentName: opp.name,
      opponentIconUrl: this.ddragon.championIconUrl(opp.id) ?? undefined,
      winRate,
      difficulty,
      tips,
    };
  }

  async pickSuggestions(role: string, limit = 5): Promise<PickAdvice[]> {
    const picks = await this.provider.topPicks(role, limit);
    return picks
      .map((p) => {
        const champ = this.ddragon.championById(p.championId);
        if (!champ) return null;
        return {
          championName: champ.name,
          championIconUrl: this.ddragon.championIconUrl(champ.id) ?? undefined,
          role: p.role,
          winRate: p.winRate,
          pickRate: p.pickRate,
          reason:
            p.winRate >= 0.515
              ? 'Win rate alto y consistente en el parche actual.'
              : 'Pick flexible y seguro para el rol.',
        } as PickAdvice;
      })
      .filter((x): x is PickAdvice => x !== null);
  }
}
