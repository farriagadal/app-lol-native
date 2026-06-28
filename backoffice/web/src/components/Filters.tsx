/**
 * Barra de filtros compartida (región, parche, rango, campeón, roles, fechas). El
 * campeón navega a su ficha (/champ/slug); si estamos en el detalle de un ítem,
 * solo refiltra sin salir. El parche y el campeón son inputs escribibles con
 * autocompletado (datalist). Las fechas (desde/hasta) filtran por game_creation.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RolePills, TierFilter } from '@ui';
import { useStore } from '../state/store';

export function Filters() {
  const s = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  const onItem = loc.pathname.startsWith('/item/');

  const champs = s.meta?.champions ?? [];
  const patches = s.meta?.patches ?? [];

  const [champText, setChampText] = useState(s.champion === 'all' ? '' : s.champion);
  const [patchText, setPatchText] = useState(s.patch === 'all' ? '' : s.patch);

  useEffect(() => {
    setChampText(s.champion === 'all' ? '' : s.champion);
  }, [s.champion]);

  useEffect(() => {
    setPatchText(s.patch === 'all' ? '' : s.patch);
  }, [s.patch]);

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

  const commitPatch = () => {
    const v = patchText.trim();
    const match = patches.find((p) => p === v);
    if (!v) {
      s.setPatch('all');
    } else if (match) {
      s.setPatch(match);
    } else {
      // Texto no coincide con ningún parche conocido — resetear
      s.setPatch('all');
      setPatchText('');
    }
  };

  return (
    <section className="filters">
      <label>
        Región
        {s.dataRegions.length ? (
          <select value={s.region} onChange={(e) => onRegion(e.target.value)}>
            {s.dataRegions.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
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
        <input
          list="patchList"
          placeholder="Todos"
          value={patchText}
          onChange={(e) => setPatchText(e.target.value)}
          onBlur={commitPatch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <datalist id="patchList">
          {patches.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
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
