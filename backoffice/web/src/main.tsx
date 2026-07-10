import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { KnowledgeProvider } from './state/knowledge';
import { App } from './App';
import './styles/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root en index.html');

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
