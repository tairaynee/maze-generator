import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://jayne-07.github.io/maze-generator/ on GitHub Pages.
// `reels/index.html` is a second entry so /maze-generator/reels/ is a real
// page, with no change to the book app's bundle behavior.
export default defineConfig({
  base: '/maze-generator/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        reels: resolve(__dirname, 'reels/index.html'),
      },
    },
  },
});
