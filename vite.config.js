import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures relative assets paths so that index.html resolves them via file:// protocol
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
