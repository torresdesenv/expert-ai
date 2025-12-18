
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env': process.env
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    modulePreload: {
      // Fixed typo: polyfil -> polyfill
      polyfill: true
    }
  }
});
