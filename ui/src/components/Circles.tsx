/** Retratos circulares de campeón (matchups: weak/strong/synergy). */
import { pct } from '../domain/format';
import { useAssets } from '../assets/AssetsContext';
import { AssetImg } from './AssetImg';

export function ChampionCircle({
  name,
  winRate,
  tone,
  href,
  onSelect,
}: {
  name: string;
  winRate: number;
  tone: 'weak' | 'strong';
  href: string;
  onSelect?: (name: string) => void;
}) {
  const a = useAssets();
  return (
    <a
      className="champ-cell"
      href={href}
      onClick={(e) => {
        if (onSelect && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onSelect(name);
        }
      }}
    >
      <div className={`champ-circle ${tone}`}>
        <AssetImg src={a.champIcon(name)} />
      </div>
      <div className="champ-cn">{name}</div>
      <div className={`champ-wr ${tone}`}>{pct(winRate)}%</div>
      <div className="champ-wl">Win rate</div>
    </a>
  );
}

/** Rejilla de hasta 6 círculos (o "Sin datos."). */
export function CircleGrid<T extends { winRate: number }>({
  items,
  nameOf,
  tone,
  hrefFor,
  onSelect,
}: {
  items: T[];
  nameOf: (row: T) => string;
  tone: 'weak' | 'strong';
  hrefFor: (name: string) => string;
  onSelect?: (name: string) => void;
}) {
  if (!items.length) return <div className="empty">Sin datos.</div>;
  return (
    <>
      {items.slice(0, 6).map((r) => {
        const name = nameOf(r);
        return (
          <ChampionCircle
            key={name}
            name={name}
            winRate={r.winRate}
            tone={tone}
            href={hrefFor(name)}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}
