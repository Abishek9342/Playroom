import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// `npm run dev` runs the React app AND the Worker (D1 + Durable Objects) together.
export default defineConfig({
  plugins: [react(), cloudflare()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('') },
  server: {
    // lets a Cloudflare tunnel (`npm run share`) or a GitHub Codespaces port link reach the dev server
    allowedHosts: ['.trycloudflare.com', '.app.github.dev'],
  },
});
