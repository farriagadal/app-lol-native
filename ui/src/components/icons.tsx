/** Iconos pequeños (campeón, item, rol, rango) resueltos vía el AssetResolver. */
import { useAssets } from '../assets/AssetsContext';
import { ROLE_LABEL, ROLE_TIP, TIER_LABEL, TIER_TIP } from '../domain/constants';
import { AssetImg } from './AssetImg';

export function ChampionIcon({
  name,
  className,
  lazy,
}: {
  name: string;
  className?: string;
  lazy?: boolean;
}) {
  const a = useAssets();
  return <AssetImg className={className} src={a.champIcon(name)} loading={lazy ? 'lazy' : undefined} />;
}

export function ItemIcon({
  id,
  className,
  title,
  lazy,
}: {
  id: number;
  className?: string;
  title?: string;
  lazy?: boolean;
}) {
  const a = useAssets();
  return (
    <AssetImg
      className={className}
      src={a.itemIcon(id)}
      title={title ?? a.itemName(id)}
      loading={lazy ? 'lazy' : undefined}
    />
  );
}

export function RoleIcon({ role, className }: { role: string; className?: string }) {
  const a = useAssets();
  const url = a.roleIcon(role);
  if (!url) return null;
  return <AssetImg className={className} src={url} title={ROLE_TIP[role] || ROLE_LABEL[role] || role} />;
}

export function TierEmblem({ tier, className }: { tier: string; className?: string }) {
  const a = useAssets();
  return (
    <AssetImg className={className} src={a.tierEmblem(tier)} title={TIER_TIP[tier] || TIER_LABEL[tier] || tier} />
  );
}
