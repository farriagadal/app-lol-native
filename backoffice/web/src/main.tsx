import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { KnowledgeProvider } from './state/knowledge';
import { hydrateSettings } from './settingsSync';
import { App } from './App';
import './styles/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root en index.html');

// Hidratar el localStorage desde la BD local antes de montar React: los
// useState(() => localStorage…) de toda la app leen los valores persistidos.
void hydrateSettings().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <StoreProvider>
          <KnowledgeProvider>
            <App />
          </KnowledgeProvider>
        </StoreProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
