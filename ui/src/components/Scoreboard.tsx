/** Scoreboard de 10 jugadores de una partida (porta renderScoreboard/sbPlayerRow). */
import { useAssets } from '../assets/AssetsContext';
import type { MatchDetail, MatchParticipantRow, MatchTeamObjectives } from '../domain/types';
import { kdaFixed } from '../domain/format';
import { AssetImg } from './AssetImg';
import { BuildRow } from './GameBits';

const TEAM_TONE: Record<number, 'blue' | 'red'> = { 100: 'blue', 200: 'red' };
const TEAM_NAME: Record<number, string> = { 100: 'Equipo azul', 200: 'Equipo rojo' };

export function Scoreboard({ match, highlight, playerHref }: {
  match: MatchDetail;
  highlight?: number | null;
  playerHref?: (riotId: string) => string;
}) {
  const a = useAssets();
  const parts = match.participants || [];
  const maxDmg = Math.max(1, ...parts.map((p) => p.dmgToChamps || 0));
  const dur = match.gameDuration || 0;
  const objs: Record<number, MatchTeamObjectives> = {};
  for (const t of match.teams || []) objs[t.teamId] = t;

  const playerRow = (p: MatchParticipantRow) => {
    const csmin = dur > 0 ? (p.cs / (dur / 60)).toFixed(1) : '0.0';
    const kp = p.killParticipation != null ? Math.round(p.killParticipation * 100) + '%' : '—';
    const dmgPct = Math.round((p.dmgToChamps / maxDmg) * 100);
    const name = p.riotId ? p.riotId.split('#')[0] : '—';
    return (
      <div className="sb-player" key={p.participantId}>
        <div className="sb-id">
          <span className="sb-champ-ic">
            <AssetImg src={a.champIcon(p.championName)} />
            <span className="sb-lvl">{p.champLevel}</span>
          </span>
          <span className="ico-pair sb-spells">
            <AssetImg src={a.spellIcon(p.summoner1)} title={a.spellName(p.summoner1)} />
            <AssetImg src={a.spellIcon(p.summoner2)} title={a.spellName(p.summoner2)} />
          </span>
          <AssetImg className="sb-ks" src={a.runeIcon(p.keystone)} title={a.runeName(p.keystone)} />
          {playerHref && p.riotId ? (
            <a
              className="sb-name sb-name-link"
              href={playerHref(p.riotId)}
              target="_blank"
              rel="noopener noreferrer"
              title={p.riotId}
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </a>
          ) : (
            <span className="sb-name" title={p.riotId || ''}>{name}</span>
          )}
        </div>
        <div className="sb-kda num">
          {p.kills} / {p.deaths} / {p.assists} <span className="kda-r">{kdaFixed(p.kda)}</span>
        </div>
        <div className="sb-cs num">
          {p.cs} <span className="sub">{csmin}/m</span>
        </div>
        <div className="sb-kp num">{kp}</div>
        <div className="sb-dmg">
          <div className="sb-dmg-bar">
            <span style={{ width: `${dmgPct}%` }} />
          </div>
          <span className="sb-dmg-val num">{(p.dmgToChamps || 0).toLocaleString()}</span>
        </div>
        <div className="sb-build">
          <BuildRow items={p.items} withTrinket highlight={highlight} />
        </div>
      </div>
    );
  };

  const teamBlock = (teamId: number) => {
    const tp = parts.filter((p) => p.teamId === teamId);
    if (!tp.length) return null;
    const tone = TEAM_TONE[teamId] || 'blue';
    const win = tp[0].win;
    const k = tp.reduce((s, p) => s + p.kills, 0);
    const d = tp.reduce((s, p) => s + p.deaths, 0);
    const as = tp.reduce((s, p) => s + p.assists, 0);
    const gold = tp.reduce((s, p) => s + p.goldEarned, 0);
    const o = objs[teamId] || ({} as MatchTeamObjectives);
    return (
      <div className={`sb-team ${tone}`} key={teamId}>
        <div className={`sb-team-head ${tone}`}>
          <span className="sb-team-name">{TEAM_NAME[teamId] || ''}</span>
          <span className={`result ${win ? 'win' : 'lose'}`}>{win ? 'Victoria' : 'Derrota'}</span>
          <span className="sb-tot">
            {k} / {d} / {as}
          </span>
          <span className="sb-obj" data-tooltip="Oro total" title="Oro total">
            🪙 {(gold / 1000).toFixed(1)}k
          </span>
          <span className="sb-obj" data-tooltip="Torres derrumbadas" title="Torres derrumbadas">
            🏰 {o.towerKills || 0}
          </span>
          <span className="sb-obj" data-tooltip="Dragones eliminados" title="Dragones eliminados">
            🐉 {o.dragonKills || 0}
          </span>
          <span className="sb-obj" data-tooltip="Heraldos del Abismo" title="Heraldos del Abismo">
            🦀 {o.riftHeraldKills || 0}
          </span>
          <span className="sb-obj" data-tooltip="Barones Nashor" title="Barones Nashor">
            👹 {o.baronKills || 0}
          </span>
        </div>
        <div className="sb-rows">{tp.map(playerRow)}</div>
      </div>
    );
  };

  return (
    <div className="scoreboard">
      {teamBlock(100)}
      {teamBlock(200)}
    </div>
  );
}
