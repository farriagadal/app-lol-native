/**
 * Barra de filtros compartida (región, parche, rango, campeón, roles, fechas).
 * El filtro de campeón solo refiltra la vista actual; para ir a la ficha del
 * campeón hay que hacer clic en él desde la lista. Las fechas filtran por game_creation.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { RolePills, TierFilter } from '@ui';
import { useStore } from '../state/store';
import { MultiChipSelect } from './MultiChipSelect';
import { ChampionSelect } from './ChampionSelect';

export function Filters() {
  const s = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  // Detalles de campeón/jugador no reaccionan al filtro de campeón: al cambiarlo
  // se vuelve a la lista. El resto de vistas (listas y detalle de ítem) refiltran in situ.
  const onChampOrPlayer = /^\/(champ|player)\//.test(loc.pathname);

  const champs = s.meta?.champions ?? [];
  const patches = s.meta?.patches ?? [];

  const selectedRegions = !s.region || s.region === 'all' ? [] : s.region.split(',');
  const serverOptions = s.servers.filter((sv) => s.dataRegions.includes(sv.key)).map((sv) => sv.key);
  const serverLabel = (key: string) => {
    const sv = s.servers.find((x) => x.key === key);
    return sv ? `${sv.label} (${sv.key})` : key;
  };
  const onRegionChange = (vals: string[]) => {
    s.setRegion(vals.length ? vals.join(',') : 'all');
    navigate('/');
  };

  const onChampionChange = (v: string) => {
    s.setChampion(v);
    if (onChampOrPlayer) navigate('/');
  };

  const selectedPatches = !s.patch || s.patch === 'all' ? [] : s.patch.split(',');
  const onPatchChange = (vals: string[]) => s.setPatch(vals.length ? vals.join(',') : 'all');

  return (
    <section className="filters">
      <label>
        Servidor
        <MultiChipSelect
          options={serverOptions}
          value={selectedRegions}
          onChange={onRegionChange}
          placeholder="Todos"
          getLabel={serverLabel}
        />
      </label>

      <label>
        Parche
        <MultiChipSelect
          options={patches}
          value={selectedPatches}
          onChange={onPatchChange}
          placeholder="Todos"
        />
      </label>

      <label>
        Rango
        <TierFilter tiers={s.meta?.tiers ?? []} value={s.tier} onChange={s.setTier} />
      </label>

      <label>
        Campeón
        <ChampionSelect
          options={champs}
          value={s.champion}
          onChange={onChampionChange}
          placeholder="Todos"
        />
      </label>

      <label>
        Desde
        <input
          type="date"
          value={s.dateFrom}
          onChange={(e) => s.setDateFrom(e.target.value)}
        />
      </label>

      <label>
        Hasta
        <input
          type="date"
          value={s.dateTo}
          onChange={(e) => s.setDateTo(e.target.value)}
        />
      </label>

      <RolePills value={s.role} onChange={s.setRole} />
    </section>
  );
}
