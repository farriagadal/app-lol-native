import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// El servidor del back office sirve /assets/* desde assets/ de la raíz del repo,
// por eso los bundles de Vite van bajo /static/ (assetsDir) para no colisionar.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': fileURLToPath(new URL('../../ui/src', import.meta.url)),
    },
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
