
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Definindo especificamente a chave para evitar expor todo o process.env
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    // Garantindo que o jspdf seja processado corretamente
    rollupOptions: {
      external: [],
    }
  },
  optimizeDeps: {
    // Forçando a inclusão para desenvolvimento
    include: ['jspdf']
  }
});
