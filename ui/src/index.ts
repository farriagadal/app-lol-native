/** Punto de entrada de la librería compartida de UI (back office + Electron). */

// Dominio puro
export * from './domain/constants';
export * from './domain/format';
export * from './domain/types';

// Assets
export * from './assets/AssetResolver';
export { AssetsProvider, useAssets } from './assets/AssetsContext';

// Componentes presentacionales
export { AssetImg } from './components/AssetImg';
export { WinRate } from './components/WinRate';
export { KDA } from './components/KDA';
export { ChampionIcon, ItemIcon, RoleIcon, TierEmblem } from './components/icons';
export { RolePills, TierPills, TierFilter } from './components/Pills';
export { SpellPair, RuneIcons, BuildRow } from './components/GameBits';
export { StatTable, type Column } from './components/StatTable';
export { ChampionCircle, CircleGrid } from './components/Circles';
export { Scoreboard } from './components/Scoreboard';
export { ProgressBar } from './components/ProgressBar';
export { Sidebar, type SidebarTab } from './components/Sidebar';
