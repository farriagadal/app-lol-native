/** Barra lateral: marca (logo con fallback a texto) + navegación de pestañas. */
import { useState } from 'react';

export interface SidebarTab {
  key: string;
  label: string;
  /** Clase extra opcional (p.ej. "tab-collect" para anclar al fondo). */
  className?: string;
}

export function Sidebar({
  tabs,
  active,
  onSelect,
  onBrand,
  logoSrc = '/assets/hero-logo-square.svg',
  brandTitle = 'HERO LOL COACH',
  brandText = 'HERO LOL COACH',
}: {
  tabs: SidebarTab[];
  active: string;
  onSelect: (key: string) => void;
  onBrand?: () => void;
  logoSrc?: string;
  brandTitle?: string;
  brandText?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <aside className="sidebar">
      <a
        className="brand"
        href="/"
        title={brandTitle}
        onClick={(e) => {
          if (onBrand) {
            e.preventDefault();
            onBrand();
          }
        }}
      >
        {logoFailed ? (
          <span className="brand-text">{brandText}</span>
        ) : (
          <img className="brand-logo" src={logoSrc} alt={brandTitle} onError={() => setLogoFailed(true)} />
        )}
      </a>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={'tab' + (t.className ? ' ' + t.className : '') + (active === t.key ? ' on' : '')}
            onClick={() => onSelect(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
