import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  // Базовый путь для GitHub Pages
  base: './',
  
  // Оптимизация зависимостей
  optimizeDeps: {
    include: ['pdfjs-dist', 'jszip', 'papaparse'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  
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
          'csv-lib': ['papaparse']
        }
      }
    }
  },
  
  // Настройки сервера для разработки
  server: {
    port: 3000,
    open: true
  },
  
  // Плагин для поддержки старых браузеров (опционально)
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  
  // Обработка worker файлов - корректная настройка для PDF.js
  worker: {
    format: 'ife',
    plugins: () => []
  }
});
