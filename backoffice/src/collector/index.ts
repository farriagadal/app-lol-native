import { collect } from './collect';
import { aggregate } from './aggregate';
import { getApiKey } from './config';
import { log } from './log';

/**
 * CLI del colector. Uso (tras `npm run build:collector`):
 *
 *   $env:RIOT_API_KEY = "RGAPI-..."
 *   node dist/collector/index.js collect  --region la2 --max 3000
 *   node dist/collector/index.js aggregate --region la2 --min-games 20
 *
 * Flags de collect:
 *   --region <la2|la1|na1|br1|euw1|eun1|kr|jp1|oc1|tr1|ru>   (def. la2)
 *   --max <n>                 total de partidas objetivo        (def. 3000)
 *   --per-player <n>          IDs recientes por jugador, 1..100 (def. 15)
 *   --players-per-bucket <n>  tope de jugadores por liga        (def. 40)
 *
 * Flags de aggregate:
 *   --region <...>            (def. la2)
 *   --patch <major.minor>     filtra por parche, p.ej. 14.11    (def. todos)
 *   --min-games <n>           mínimo de partidas para el JSON    (def. 20)
 */

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, 'true');
      }
    }
  }
  return flags;
}

function num(flags: Map<string, string>, key: string, def: number): number {
  const v = flags.get(key);
  if (v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const region = flags.get('region') ?? 'la2';

  switch (command) {
    case 'collect': {
      const tiers = (flags.get('tiers') ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const startTime = flags.get('start-time') ? Number(flags.get('start-time')) : undefined;
      const endTime = flags.get('end-time') ? Number(flags.get('end-time')) : undefined;
      await collect({
        region,
        apiKey: getApiKey(),
        maxMatches: num(flags, 'max', 3000),
        matchesPerPlayer: Math.min(100, Math.max(1, num(flags, 'per-player', 15))),
        maxPlayersPerBucket: Math.max(1, num(flags, 'players-per-bucket', 40)),
        tiers: tiers.length ? tiers : undefined,
        startTime,
        endTime,
      });
      break;
    }

    case 'aggregate':
      await aggregate({
        region,
        patch: flags.get('patch'),
        minGames: Math.max(1, num(flags, 'min-games', 20)),
      });
      break;

    default:
      log.info('Comandos: collect | aggregate. Ver cabecera de src/collector/index.ts.');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error((err as Error).message);
  process.exitCode = 1;
});
