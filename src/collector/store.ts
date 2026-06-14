import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { DATA_DIR } from './config';
import type { MatchDTO } from './riotTypes';

/**
 * Almacenamiento en disco, sin dependencias nativas:
 *   data/<region>/matches.jsonl     -> 1 partida cruda (JSON completo) por línea
 *   data/<region>/seen-matches.txt  -> IDs ya descargados (para reanudar)
 *   data/<region>/seen-players.txt  -> puuids ya procesados (para reanudar)
 *
 * El diseño es append-only: puedes cortar el proceso (Ctrl+C) y reanudar; no se
 * vuelve a descargar lo ya guardado.
 */
export class Store {
  readonly dir: string;
  readonly matchesFile: string;
  readonly seenMatchesFile: string;
  readonly seenPlayersFile: string;

  constructor(region: string) {
    this.dir = path.resolve(process.cwd(), DATA_DIR, region);
    fs.mkdirSync(this.dir, { recursive: true });
    this.matchesFile = path.join(this.dir, 'matches.jsonl');
    this.seenMatchesFile = path.join(this.dir, 'seen-matches.txt');
    this.seenPlayersFile = path.join(this.dir, 'seen-players.txt');
  }

  private loadSet(file: string): Set<string> {
    const set = new Set<string>();
    if (!fs.existsSync(file)) return set;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      const v = line.trim();
      if (v) set.add(v);
    }
    return set;
  }

  loadSeenMatches(): Set<string> {
    return this.loadSet(this.seenMatchesFile);
  }

  loadSeenPlayers(): Set<string> {
    return this.loadSet(this.seenPlayersFile);
  }

  /** Guarda la partida cruda y marca su ID como vista (en ese orden). */
  appendMatch(match: MatchDTO): void {
    fs.appendFileSync(this.matchesFile, JSON.stringify(match) + '\n');
    fs.appendFileSync(this.seenMatchesFile, match.metadata.matchId + '\n');
  }

  markPlayerSeen(puuid: string): void {
    fs.appendFileSync(this.seenPlayersFile, puuid + '\n');
  }

  /** Lectura en streaming del JSONL (para no cargar cientos de MB en memoria). */
  async *iterateMatches(): AsyncGenerator<MatchDTO> {
    if (!fs.existsSync(this.matchesFile)) return;
    const rl = readline.createInterface({
      input: fs.createReadStream(this.matchesFile, 'utf8'),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as MatchDTO;
      } catch {
        // Línea corrupta (p.ej. corte a mitad de escritura): se ignora.
      }
    }
  }

  countMatches(): number {
    return this.loadSeenMatches().size;
  }
}
