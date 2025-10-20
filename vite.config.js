import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  // Базовый путь для GitHub Pages
  base: './',
  
  // Настройки сборки
  build: {
    outDir: 'dist',
    minify: 'terser', // максимальная минификация
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['pdfjs-dist'],
          'zip-lib': ['jszip'],
          'csv-lib': ['papaparse'],
          'wasm-lib': ['7z-wasm']
        },
        format: 'es',
        entryFileNames: `[name].[hash].js`,
        chunkFileNames: `[name].[hash].js`,
        assetFileNames: `[name].[hash].[ext]`
      }
    },
    target: 'es2022' // Устанавливаем более современный таргет для поддержки top-level await
  },
  
  // Настройки сервера для разработки
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  
  // Оптимизация зависимостей
 optimizeDeps: {
    include: ['pdfjs-dist', 'jszip', 'paparse', '7z-wasm', 'js7z-tools'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  
  // Плагин для поддержки старых браузеров
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],

  // Отключаем обработку worker'ов через кастомную конфигурацию
 worker: {
    format: 'es'
  }
});
