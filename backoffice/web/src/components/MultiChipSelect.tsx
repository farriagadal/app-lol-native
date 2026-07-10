/**
 * Campo de selección múltiple con chips: muestra las opciones seleccionadas
 * como etiquetas removibles dentro del input. Al hacer clic en el campo
 * se abre un dropdown con las opciones disponibles (filtradas por texto).
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  options: string[];
  value: string[];          // opciones seleccionadas
  onChange: (v: string[]) => void;
  placeholder?: string;
  label?: string;
  /** Transforma una clave interna en etiqueta visible (chips y dropdown). */
  getLabel?: (v: string) => string;
  /** Icono opcional por opción (ej. thumbnail de campeón), en chips y dropdown. */
  getIcon?: (v: string) => ReactNode;
}

export function MultiChipSelect({ options, value, onChange, placeholder = 'Todos', getLabel, getIcon }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const label = (v: string) => (getLabel ? getLabel(v) : v);

  const filtered = options.filter(
    (o) => !value.includes(o) && label(o).toLowerCase().includes(query.toLowerCase()),
  );

  const add = (opt: string) => {
    onChange([...value, opt]);
    setQuery('');
    input.current?.focus();
  };

  const remove = (opt: string) => {
    onChange(value.filter((v) => v !== opt));
  };

  const clear = () => onChange([]);

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
    if (e.key === 'Backspace' && !query && value.length) {
      remove(value[value.length - 1]);
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="mcs-root" ref={root}>
      <div
        className={`mcs-field${open ? ' mcs-open' : ''}`}
        onClick={() => { setOpen(true); input.current?.focus(); }}
      >
        {value.length === 0 && !query && (
          <span className="mcs-placeholder">{placeholder}</span>
        )}
        {value.map((v) => (
          <span key={v} className={`mcs-chip${getIcon ? ' champ-chip' : ''}`}>
            {getIcon?.(v)}
            {label(v)}
            <button
              className="mcs-chip-x"
              onClick={(e) => { e.stopPropagation(); remove(v); }}
              tabIndex={-1}
              aria-label={`Quitar ${label(v)}`}
            >×</button>
          </span>
        ))}
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
        {value.length > 0 && (
          <button
            className="mcs-clear"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            tabIndex={-1}
            aria-label="Limpiar todo"
          >×</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className={`mcs-dropdown${getIcon ? ' champ-dropdown' : ''}`}>
          {filtered.map((o) => (
            <li key={o} className={`mcs-opt${getIcon ? ' champ-opt' : ''}`} onMouseDown={(e) => { e.preventDefault(); add(o); }}>
              {getIcon?.(o)}
              <span>{label(o)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
