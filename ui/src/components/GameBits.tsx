/** Bloques de iconos de partida: hechizos, runas y build de items. */
import { Fragment } from 'react';
import { useAssets } from '../assets/AssetsContext';
import { AssetImg } from './AssetImg';
import type { ItemStatRow } from '../domain/types';

/** Par de hechizos de invocador. */
export function SpellPair({ s1, s2 }: { s1: number | null; s2: number | null }) {
  const a = useAssets();
  return (
    <span className="ico-pair">
      <AssetImg src={a.spellIcon(s1)} title={a.spellName(s1)} loading="lazy" />
      <AssetImg src={a.spellIcon(s2)} title={a.spellName(s2)} loading="lazy" />
    </span>
  );
}

/**
 * Iconos de runas. Siempre la piedra angular (ks); `primary` y `sub` son
 * opcionales (árboles primario/secundario). En las stats se pasan los tres; en
 * la fila de partida solo keystone + sub.
 */
export function RuneIcons({
  keystone,
  primary,
  sub,
}: {
  keystone: number | null;
  primary?: number | null;
  sub?: number | null;
}) {
  const a = useAssets();
  return (
    <span className="rune-icons">
      <AssetImg className="ks" src={a.runeIcon(keystone)} title={a.runeName(keystone)} loading="lazy" />
      {primary != null && (
        <AssetImg className="tree" src={a.runeIcon(primary)} title={a.runeName(primary)} loading="lazy" />
      )}
      {sub != null && (
        <AssetImg className="tree" src={a.runeIcon(sub)} title={a.runeName(sub)} loading="lazy" />
      )}
    </span>
  );
}

/**
 * Fila de build (items 0..5, opcionalmente el 6 = trinket separado). `highlight`
 * resalta un item concreto (el del detalle). `itemStats` añade winrate al tooltip.
 */
export function BuildRow({
  items,
  withTrinket,
  highlight,
  itemStats,
}: {
  items: number[];
  withTrinket?: boolean;
  highlight?: number | null;
  itemStats?: Map<number, ItemStatRow>;
}) {
  const a = useAssets();
  const cell = (id: number | undefined) => {
    if (!id || id <= 0) return <span className="item-empty" />;
    const hl = highlight && id === highlight ? 'hl' : undefined;
    const name = a.itemName(id);
    const stat = itemStats?.get(id);
    const title = stat
      ? `${name} — ${Math.round(stat.winRate * 100)}% WR · ${stat.games} partidas`
      : name;
    return <AssetImg className={hl} src={a.itemIcon(id)} title={title} loading="lazy" />;
  };
  return (
    <span className="build-row">
      {items.slice(0, 6).map((id, i) => (
        <Fragment key={i}>{cell(id)}</Fragment>
      ))}
      {withTrinket && (
        <>
          <span className="trinket-sep" />
          {cell(items[6])}
        </>
      )}
    </span>
  );
}
