/**
 * Barra de filtros compartida (región, parche, rango, campeón, roles). El
 * campeón navega a su ficha (/champ/slug); si estamos en el detalle de un ítem,
 * solo refiltra sin salir. Portado de la sección filters de index.html + handlers
 * de app.js (el campeón se confirma al pulsar Enter o salir del campo, como el
 * evento `change` original, no en cada tecla).
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
    if (onItem) return; // en el detalle de ítem solo refiltra
    navigate(match ? `/champ/${encodeURIComponent(match.toLowerCase())}` : '/');
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
        <select value={s.patch} onChange={(e) => s.setPatch(e.target.value)}>
          <option value="all">Todos</option>
          {(s.meta?.patches ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
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

      <RolePills value={s.role} onChange={s.setRole} />
    </section>
  );
}
