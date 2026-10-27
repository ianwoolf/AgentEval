import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [tailwindcss(), react()],
  build: { outDir: 'dist-evaluation', rollupOptions: { input: fileURLToPath(new URL('./evaluation.html', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 8080, proxy: { '/api/v1/evaluations': 'http://127.0.0.1:8001' } },
});
