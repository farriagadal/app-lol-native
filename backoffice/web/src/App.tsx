/** Layout principal: sidebar + topbar + filtros + rutas. Cada tab tiene su propia URL. */
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, type SidebarTab } from '@ui';
import { useStore } from './state/store';
import { Filters } from './components/Filters';
import { ChampionsPage } from './pages/ChampionsPage';
import { StatsPage } from './pages/StatsPage';
import { CollectPage } from './pages/CollectPage';
import { ChampionView } from './pages/ChampionView';
import { ItemView } from './pages/ItemView';
import { PlayerView } from './pages/PlayerView';
import { StreaksPage } from './pages/StreaksPage';
import { FAQPage } from './pages/FAQPage';
import { GamesPage } from './pages/GamesPage';
import { RecommendPage } from './pages/RecommendPage';
import { SynergyPickPage } from './pages/SynergyPickPage';
import { FullPickPage } from './pages/FullPickPage';

const TABS: SidebarTab[] = [
  { key: 'champions', label: 'Campeones' },
  { key: 'items', label: 'Items' },
  { key: 'runes', label: 'Runas' },
  { key: 'spells', label: 'Hechizos' },
  { key: 'faq', label: 'FAQ' },
  { key: 'streaks', label: 'Rachas' },
  { key: 'games', label: 'Partidas' },
  { key: 'recommend', label: 'vs Rivales' },
  { key: 'synergy', label: 'Sinergias' },
  { key: 'fullpick', label: 'Pick completo' },
  { key: 'collect', label: '⬇ Recolección', className: 'tab-collect' },
];

const TAB_KEYS = new Set(TABS.map((t) => t.key));

function activeTabFromPath(pathname: string): string {
  const seg = pathname.split('/')[1];
  return TAB_KEYS.has(seg) ? seg : '';
}

export function App() {
  const s = useStore();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (s.ready && !s.dataRegions.length) navigate('/collect', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ready, s.dataRegions.length]);

  const selectTab = (t: string) => {
    s.setChampion('all');
    navigate('/' + t);
  };

  const active = activeTabFromPath(loc.pathname);
  // Ocultar filtros en tabs sin datos tabulares y en páginas de detalle
  const showFilters = active !== '' && active !== 'collect' && active !== 'faq';

  return (
    <div className="layout">
      <Sidebar tabs={TABS} active={active} onSelect={selectTab} onBrand={() => selectTab('champions')} />
      <div className="content">
        <header className="topbar">
          <img className="ray-deco ray-top" src="/assets/ray.svg" alt="" />
        </header>
        <main>
          {showFilters && <Filters />}
          <Routes>
            <Route path="/" element={<Navigate to="/champions" replace />} />
            <Route path="/champions" element={<ChampionsPage />} />
            <Route path="/items" element={<StatsPage kind="items" />} />
            <Route path="/runes" element={<StatsPage kind="runes" />} />
            <Route path="/spells" element={<StatsPage kind="spells" />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/streaks" element={<StreaksPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/recommend" element={<RecommendPage />} />
            <Route path="/synergy" element={<SynergyPickPage />} />
            <Route path="/fullpick" element={<FullPickPage />} />
            <Route path="/collect" element={<CollectPage />} />
            <Route path="/champ/:slug" element={<ChampionView />} />
            <Route path="/item/:id" element={<ItemView />} />
            <Route path="/player/:puuid" element={<PlayerView />} />
            <Route path="*" element={<Navigate to="/champions" replace />} />
          </Routes>
        </main>
      </div>
      <img className="ray-deco ray-bg" src="/assets/ray.svg" alt="" />
    </div>
  );
}
