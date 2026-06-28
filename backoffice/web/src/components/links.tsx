/** Enlaces de navegación SPA a ficha de campeón y detalle de ítem. */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const champHref = (name: string) => '/champ/' + encodeURIComponent(name.toLowerCase());
export const itemHref = (id: number) => '/item/' + id;

/** Permite abrir en pestaña nueva (ctrl/cmd-clic) sin interceptar. */
function spaClick(e: React.MouseEvent, navigate: (to: string) => void, to: string) {
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigate(to);
}

export function ChampLink({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const to = champHref(name);
  return (
    <a className={className} href={to} onClick={(e) => spaClick(e, navigate, to)}>
      {children}
    </a>
  );
}

export function ItemLink({
  id,
  className,
  children,
}: {
  id: number;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const to = itemHref(id);
  return (
    <a className={className} href={to} onClick={(e) => spaClick(e, navigate, to)}>
      {children}
    </a>
  );
}
