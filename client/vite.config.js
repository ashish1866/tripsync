import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local development: Vite serves React on 5173 and forwards every /api request
// to the Worker running under `wrangler dev` on 8787. Because the browser only
// ever talks to 5173, no CORS setup is needed, the same as in production where
// site and API share one address.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
