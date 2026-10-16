import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built site works from any folder on a
  // shared host (e.g. public_html/ or public_html/cyberlife/).
  base: './',
  build: {
    // three.js alone is ~500 kB minified; that's expected for this app.
    chunkSizeWarningLimit: 1000,
  },
});
