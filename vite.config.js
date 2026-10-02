import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  base: './',
  cacheDir: '.cache/vite',
  resolve: { alias: { '@': projectRoot + 'src/' } },
  build: {
    outDir: '../../build/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('pdfmake') || id.includes('xlsx')) return 'vendor-export';
          if (id.includes('vue') || id.includes('pinia')) return 'vendor-vue';
          return undefined;
        },
      },
    },
  },
});
