import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 50_000_000,
    cssCodeSplit: false,
    target: 'es2020',
  },
});
