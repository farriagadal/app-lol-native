/**
 * Barra de filtros compartida (región, parche, rango, campeón, roles, fechas). El
 * campeón navega a su ficha (/champ/slug); si estamos en el detalle de un ítem,
 * solo refiltra sin salir. Las fechas (desde/hasta) filtran por game_creation.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RolePills, TierFilter } from '@ui';
import { useStore } from '../state/store';
import { MultiChipSelect } from './MultiChipSelect';

export function Filters() {
  const s = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  const onItem = loc.pathname.startsWith('/item/');

  const champs = s.meta?.champions ?? [];
  const patches = s.meta?.patches ?? [];

  const [champText, setChampText] = useState(s.champion === 'all' ? '' : s.champion);

  useEffect(() => {
    setChampText(s.champion === 'all' ? '' : s.champion);
  }, [s.champion]);

  const onRegion = (v: string) => {
    s.setRegion(v);
    navigate('/');
  };

  const commitChampion = () => {
    const v = champText.trim();
    const match = champs.find((c) => c.toLowerCase() === v.toLowerCase());
    s.setChampion(match || 'all');
    if (!match) setChampText('');
    if (onItem) return;
    navigate(match ? `/champ/${encodeURIComponent(match.toLowerCase())}` : '/');
  };

  const selectedPatches = !s.patch || s.patch === 'all' ? [] : s.patch.split(',');
  const onPatchChange = (vals: string[]) => s.setPatch(vals.length ? vals.join(',') : 'all');

  return (
    <section className="filters">
      <label>
        Servidor
        {s.dataRegions.length ? (
          <select value={s.region} onChange={(e) => onRegion(e.target.value)}>
            {s.servers
              .filter((sv) => s.dataRegions.includes(sv.key))
              .map((sv) => (
                <option key={sv.key} value={sv.key}>
                  {sv.label} ({sv.key})
                </option>
              ))}
          </select>
        ) : (
          <select disabled>
            <option>— sin datos —</option>
          </select>
        )}
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
        <input
          list="championList"
          placeholder="Todos"
          value={champText}
          onChange={(e) => setChampText(e.target.value)}
          onBlur={commitChampion}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <datalist id="championList">
          {champs.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
