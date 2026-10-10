/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.PNG'],
  server: {
    https: true,
    host: true,
  },
  plugins: [
    react(),
    mkcert(),
    {
      name: 'geojson',
      transform(code, id) {
        if (id.endsWith('.geojson')) {
          return {
            code: `export default ${code}`,
            map: null,
          };
        }
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        /**
         * Keep the big libraries in chunks of their own.
         *
         * Without this, everything lands in one file: a visitor who opens the
         * map downloads the charting library for a dashboard they may never
         * see, and the whole admin console besides. Splitting by library also
         * means a release that only changes our code leaves these cached in
         * the browser rather than re-downloading them.
         *
         * Leaflet and the charts are the two worth separating — they are large
         * and each is used by only some of the pages.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
            return 'vendor-charts';
          }
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
});
