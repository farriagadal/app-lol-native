/**
 * Pick completo: por defecto usa la red de conocimiento manual (pestaña Red);
 * el modo clásico por winrates de la base sigue disponible con el toggle.
 */
import { useState } from 'react';
import { RecommendBase, useRecommendSelection } from '../components/RecommendBase';
import { NetworkPickPage } from './NetworkPickPage';

export function FullPickPage() {
  const [classic, setClassic] = useState(false);
  // Selección compartida entre ambas vistas: alternar Red manual ↔ Winrates
  // no pierde pool, aliados, rivales ni rol.
  const selection = useRecommendSelection();
  return (
    <>
      <div className="net-mode-toggle rec-role-btns">
        <button className={`rec-role-btn ${!classic ? 'active' : ''}`} onClick={() => setClassic(false)}>
          Red manual
        </button>
        <button
          className={`rec-role-btn ${classic ? 'active' : ''}`}
          onClick={() => setClassic(true)}
          title="Modo clásico: win rate de partidas reales que cumplen aliados y rivales a la vez"
        >
          Winrates (datos)
        </button>
      </div>
      {classic ? <RecommendBase mode="full" selection={selection} /> : <NetworkPickPage selection={selection} />}
    </>
  );
}
