import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// El servidor del back office sirve /assets/* desde assets/ de la raíz del repo,
// por eso los bundles de Vite van bajo /static/ (assetsDir) para no colisionar.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    // ui/ es código fuente compartido fuera de backoffice: importa `react` a
    // secas (para que Electron pueda aliasar a su propia copia). Aquí resolvemos
    // esos specifiers a la copia instalada en backoffice/node_modules.
    alias: [
      { find: '@ui', replacement: fileURLToPath(new URL('../../ui/src', import.meta.url)) },
      { find: /^react$/, replacement: fileURLToPath(new URL('../node_modules/react', import.meta.url)) },
      { find: /^react-dom$/, replacement: fileURLToPath(new URL('../node_modules/react-dom', import.meta.url)) },
      { find: /^react-dom\/client$/, replacement: fileURLToPath(new URL('../node_modules/react-dom/client', import.meta.url)) },
      { find: /^react\/jsx-runtime$/, replacement: fileURLToPath(new URL('../node_modules/react/jsx-runtime', import.meta.url)) },
      { find: /^react\/jsx-dev-runtime$/, replacement: fileURLToPath(new URL('../node_modules/react/jsx-dev-runtime', import.meta.url)) },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    // En desarrollo, el API y los assets los sirve el servidor Node (npm run dev).
    proxy: {
      '/api': 'http://localhost:4317',
      '/assets': 'http://localhost:4317',
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../public', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'static',
  },
});
