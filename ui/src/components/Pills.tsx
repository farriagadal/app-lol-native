/** Selectores de rol y rango (pills/emblemas) reutilizables. */
import {
  ROLES,
  ROLE_TIP,
  TIERS,
  TIER_LABEL,
  TIER_ORDER,
  TIER_TIP,
} from '../domain/constants';
import { RoleIcon, TierEmblem } from './icons';

/** Selección única de rol (incluye 'ALL'). */
export function RolePills({
  value,
  onChange,
}: {
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <div className="pills">
      {ROLES.map(([v, l]) => (
        <span
          key={v}
          className={'pill' + (value === v ? ' on' : '')}
          title={v === 'ALL' ? 'Todos los roles' : ROLE_TIP[v] || l}
          onClick={() => onChange(v)}
        >
          {v !== 'ALL' && <RoleIcon role={v} className="pill-ic" />}
          {l}
        </span>
      ))}
    </div>
  );
}

/** Multi-selección de rangos (para la recolección). */
export function TierPills({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (tier: string) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="tier-pills">
      {TIERS.map(([k, l]) => (
        <span
          key={k}
          className={'tier-pill' + (set.has(k) ? ' on' : '')}
          title={TIER_TIP[k] || l}
          onClick={() => onToggle(k)}
        >
          <TierEmblem tier={k} className="tier-emb" />
        </span>
      ))}
    </div>
  );
}

/** Multi-selección de rango para los filtros (emblemas + opción "Todos"). */
export function TierFilter({
  tiers,
  value,
  onChange,
}: {
  tiers: string[];
  value: string;
  onChange: (tier: string) => void;
}) {
  const ordered = [...tiers].sort((a, b) => (TIER_ORDER[a] ?? 99) - (TIER_ORDER[b] ?? 99));
  const selected = new Set(value === 'all' || !value ? [] : value.split(',').filter(Boolean));
  const isAll = selected.size === 0;

  const toggle = (t: string) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(next.size === 0 ? 'all' : [...next].join(','));
  };

  return (
    <div className="tier-filter">
      <span
        className={'tier-opt' + (isAll ? ' on' : '')}
        title="Todos los rangos"
        onClick={() => onChange('all')}
      >
        Todos
      </span>
      {ordered.map((t) => (
        <span
          key={t}
          className={'tier-opt' + (selected.has(t) ? ' on' : '')}
          title={TIER_TIP[t] || TIER_LABEL[t] || t}
          onClick={() => toggle(t)}
        >
          <TierEmblem tier={t} className="tier-emb" />
        </span>
      ))}
    </div>
  );
}
