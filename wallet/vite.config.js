import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages for this repo is configured as: branch `main`, path `/` (repository root).
// We therefore build into wallet/dist and copy the result to the repo root via
// `npm run publish:site`. `base: './'` keeps every asset URL relative so the app
// works both under https://<user>.github.io/Calculator/ and under a proxy path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    // Default to Node (fast, and node:crypto gives us a real WebCrypto).
    // Individual DOM tests opt into jsdom with a @vitest-environment docblock.
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    globals: false,
  },
});
