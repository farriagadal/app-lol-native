/**
 * Selector de campeón con autocompletado: al abrir/escribir despliega la lista
 * de campeones con su thumbnail (ChampionIcon). Selección única; 'all' = sin filtro.
 * Reutiliza los estilos mcs-* del MultiChipSelect.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChampionIcon } from '@ui';

interface Props {
  options: string[];
  /** Campeón seleccionado; 'all' significa ninguno. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function ChampionSelect({ options, value, onChange, placeholder = 'Todos' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const selected = value === 'all' ? '' : value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const pick = (name: string) => {
    onChange(name);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const clear = () => {
    onChange('all');
    setQuery('');
  };

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = query.trim().toLowerCase();
      const exact = options.find((o) => o.toLowerCase() === q);
      const target = exact || filtered[0];
      if (target) pick(target);
      else {
        clear();
        setOpen(false);
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
    if (e.key === 'Backspace' && !query && selected) clear();
  };

  return (
    <div className="mcs-root champ-select" ref={root}>
      <div
        className={`mcs-field${open ? ' mcs-open' : ''}`}
        // preventDefault: dentro de un <label> el clic se reenviaría a la × del chip
        onClick={(e) => { e.preventDefault(); setOpen(true); input.current?.focus(); }}
      >
        {selected && !query && (
          <span className="mcs-chip champ-chip">
            <ChampionIcon name={selected} className="champ-opt-ico" />
            {selected}
            <button
              className="mcs-chip-x"
              onClick={(e) => { e.stopPropagation(); clear(); }}
              tabIndex={-1}
              aria-label={`Quitar ${selected}`}
            >×</button>
          </span>
        )}
        {!selected && !query && <span className="mcs-placeholder">{placeholder}</span>}
        <input
          ref={input}
          className="mcs-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder=""
          size={Math.max(1, query.length + 1)}
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="mcs-dropdown champ-dropdown">
          {filtered.map((o) => (
            <li key={o} className="mcs-opt champ-opt" onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              <ChampionIcon name={o} lazy className="champ-opt-ico" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
