/** Layout principal: sidebar + topbar + filtros + rutas. Porta showView/switchPage. */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, type SidebarTab } from '@ui';
import { LS, useStore } from './state/store';
import { Filters } from './components/Filters';
import { ChampionsPage } from './pages/ChampionsPage';
import { StatsPage } from './pages/StatsPage';
import { CollectPage } from './pages/CollectPage';
import { ChampionView } from './pages/ChampionView';
import { ItemView } from './pages/ItemView';
import { PlayerView } from './pages/PlayerView';
import { StreaksPage } from './pages/StreaksPage';
import { FAQPage } from './pages/FAQPage';

const TABS: SidebarTab[] = [
  { key: 'champions', label: 'Campeones' },
  { key: 'items', label: 'Items' },
  { key: 'runes', label: 'Runas' },
  { key: 'spells', label: 'Hechizos' },
  { key: 'faq', label: 'FAQ' },
  { key: 'streaks', label: 'Rachas' },
  { key: 'collect', label: '⬇ Recolección', className: 'tab-collect' },
];
const VALID = new Set(TABS.map((t) => t.key));

function TabPage({ tab }: { tab: string }) {
  switch (tab) {
    case 'items':
      return <StatsPage kind="items" />;
    case 'runes':
      return <StatsPage kind="runes" />;
    case 'spells':
      return <StatsPage kind="spells" />;
    case 'faq':
      return <FAQPage />;
    case 'streaks':
      return <StreaksPage />;
    case 'collect':
      return <CollectPage />;
    default:
      return <ChampionsPage />;
  }
}

export function App() {
  const s = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState(() => {
    const t = LS.get('page', 'champions');
    return VALID.has(t) ? t : 'champions';
  });

  // Sin datos: lo único accionable es recolectar.
  useEffect(() => {
    if (s.ready && !s.dataRegions.length) selectTab('collect');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ready, s.dataRegions.length]);

  const selectTab = (t: string) => {
    setTab(t);
    LS.set('page', t);
    s.setChampion('all');
    navigate('/');
  };

  const atRoot = loc.pathname === '/';
  const onCollect = (atRoot && (tab === 'collect' || tab === 'faq')) || loc.pathname === '/collect';
  const active = atRoot ? tab : ''; // ninguna pestaña activa en ficha/detalle

  return (
    <div className="layout">
      <Sidebar tabs={TABS} active={active} onSelect={selectTab} onBrand={() => selectTab('champions')} />
      <div className="content">
        <header className="topbar">
          <img className="ray-deco ray-top" src="/assets/ray.svg" alt="" />
        </header>
        <main>
          {!onCollect && <Filters />}
          <Routes>
            <Route path="/" element={<TabPage tab={tab} />} />
            <Route path="/champ/:slug" element={<ChampionView />} />
            <Route path="/item/:id" element={<ItemView />} />
            <Route path="/player/:puuid" element={<PlayerView />} />
            <Route path="/collect" element={<CollectPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <img className="ray-deco ray-bg" src="/assets/ray.svg" alt="" />
    </div>
  );
}
