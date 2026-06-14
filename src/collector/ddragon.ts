import { log } from './log';

/**
 * Data Dragon: datos estáticos (CDN público, sin API key ni rate limit de Riot).
 * Lo usamos para mapear el championId numérico (que aparece en los baneos) al
 * nombre/id de Data Dragon (p.ej. 103 -> "Ahri").
 */

interface ChampionJson {
  data: Record<string, { key: string; id: string; name: string }>;
}

export interface ChampionMap {
  version: string;
  /** numericId -> id de Data Dragon (p.ej. "Ahri") */
  byNumericId: Map<number, string>;
}

export async function loadChampionMap(): Promise<ChampionMap> {
  const versions = (await (
    await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  ).json()) as string[];
  const version = versions[0];

  const champ = (await (
    await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    )
  ).json()) as ChampionJson;

  const byNumericId = new Map<number, string>();
  for (const entry of Object.values(champ.data)) {
    byNumericId.set(Number(entry.key), entry.id);
  }
  log.info(`Data Dragon ${version}: ${byNumericId.size} campeones mapeados.`);
  return { version, byNumericId };
}
