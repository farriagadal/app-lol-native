/**
 * Historial de las partidas del perfil (efímeras, página Perfil). Al hacer
 * clic en una partida se importan sus campeones a los selectores de
 * aliados/rivales de la página que lo use.
 */
import { ChampionIcon, type ProfileMatch } from '@ui';

export function MatchHistory({ matches, onPick }: {
  matches: ProfileMatch[];
  onPick: (m: ProfileMatch) => void;
}) {
  const sorted = [...matches].sort((a, b) => b.gameCreation - a.gameCreation);
  return (
    <div className="rec-history">
      {sorted.map((m) => {
        const me = m.participants.find((p) => p.me);
        if (!me) return null;
        const allies = m.participants.filter((p) => p.teamId === me.teamId && !p.me);
        const enemies = m.participants.filter((p) => p.teamId !== me.teamId);
        const mins = Math.round(m.gameDuration / 60);
        return (
          <button
            key={m.matchId}
            className="rec-history-row"
            onClick={() => onPick(m)}
            title="Importar estos campeones a aliados/rivales"
          >
            <span className={`rec-history-result ${me.win ? 'win' : 'loss'}`}>{me.win ? 'V' : 'D'}</span>
            <span className="rec-history-me">
              <ChampionIcon name={me.championName} />
              {me.championName}
            </span>
            <span className="rec-history-team">
              {allies.map((p, i) => <ChampionIcon key={i} name={p.championName} lazy />)}
            </span>
            <span className="rec-history-vs">vs</span>
            <span className="rec-history-team">
              {enemies.map((p, i) => <ChampionIcon key={i} name={p.championName} lazy />)}
            </span>
            <span className="rec-history-meta">
              {mins} min · {new Date(m.gameCreation).toLocaleDateString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
