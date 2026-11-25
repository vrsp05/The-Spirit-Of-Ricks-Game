// Build settings. three.js and the campus map data change rarely, so they get their own files: after an
// update, returning players' browsers only download the (smaller) game code again.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('src/world/data/campus.generated.json')) return 'campus-data';
        },
      },
    },
  },
});
