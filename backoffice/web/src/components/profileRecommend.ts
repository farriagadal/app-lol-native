/**
 * Cálculo de recomendaciones en el navegador a partir de las partidas
 * efímeras del perfil (toggle "Mis partidas"). Replica la semántica del
 * recommend SQL del servidor (db.ts) con p1 fijado al dueño del perfil:
 * enemigo = mismo teamPosition en el equipo contrario; aliado = mismo equipo.
 */
import type { ProfileMatch, RecommendRow } from '@ui';

const MIN_DURATION = 240; // mismo umbral que el SQL (remakes fuera)

/** Con pool vacío se listan TODOS los campeones jugados por el dueño del perfil. */
export function recommendFromProfile(
  matches: ProfileMatch[],
  myChamps: string[],
  enemies: string[],
  allies: string[],
  role: string,
): RecommendRow[] {
  const acc = new Map<string, { games: number; wins: number }>();

  for (const m of matches) {
    if (m.gameDuration < MIN_DURATION) continue;
    const p1 = m.participants.find((p) => p.me);
    if (!p1 || !p1.teamPosition) continue;
    if (role !== 'ALL' && p1.teamPosition !== role) continue;
    if (myChamps.length > 0 && !myChamps.includes(p1.championName)) continue;

    const enemyOk =
      enemies.length === 0 ||
      m.participants.some(
        (p) => p.teamId !== p1.teamId && p.teamPosition === p1.teamPosition && enemies.includes(p.championName),
      );
    if (!enemyOk) continue;

    const allyOk =
      allies.length === 0 ||
      m.participants.some((p) => p !== p1 && p.teamId === p1.teamId && allies.includes(p.championName));
    if (!allyOk) continue;

    const cur = acc.get(p1.championName) ?? { games: 0, wins: 0 };
    cur.games++;
    if (p1.win) cur.wins++;
    acc.set(p1.championName, cur);
  }

  const names = myChamps.length > 0 ? myChamps : [...acc.keys()];
  const rows: RecommendRow[] = names.map((name) => {
    const c = acc.get(name) ?? { games: 0, wins: 0 };
    return { championName: name, games: c.games, wins: c.wins, winRate: c.games ? c.wins / c.games : 0 };
  });
  rows.sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  return rows;
}
