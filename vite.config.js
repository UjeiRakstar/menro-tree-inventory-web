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
  // The map-layer upload prepares files in a background thread
  // (src/lib/layers/prepare.worker.js), which loads the GeoTIFF reader only
  // when an elevation model is uploaded. Splitting it out like that needs the
  // thread built as an ES module rather than the default single script.
  worker: {
    format: 'es',
  },
  build: {
    rolldownOptions: {
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
         *
         * Since Vite 8 (Rolldown), as groups. A group takes the libraries its
         * own library needs as well, so React is claimed first: left to the
         * charts group, React went in with the charts, and every first page
         * downloaded 527 kB of charting to get it.
         */
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 50 },
            { name: 'vendor-router', test: /node_modules[\\/](react-router|react-router-dom|@remix-run)[\\/]/, priority: 40 },
            { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 30 },
            { name: 'vendor-leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, priority: 20 },
            { name: 'vendor-charts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // The whole-app tests render every route and lazy-load pages; on a busy
    // machine five seconds was not always enough, and they failed at random.
    testTimeout: 20000,
  },
});
