import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
