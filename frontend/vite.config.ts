import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// У режимі розробки SPA звертається до backend через проксі — так само, як через nginx у продакшені.
const backend = process.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend },
      '/oauth2': { target: backend },
      '/login/oauth2': { target: backend },
      '/swagger-ui': { target: backend },
      '/v3/api-docs': { target: backend },
      '/ws': { target: backend, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/form', '@mantine/modals', '@mantine/notifications'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // UI-тести взаємодіють з реальними компонентами Mantine у jsdom — під навантаженням CI їм потрібно більше 5 с
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/api/types.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // мінімальний рівень покриття: npm run test:coverage падає, якщо він знизиться
      thresholds: {
        lines: 94,
        statements: 94,
        functions: 93,
        branches: 86,
      },
    },
  },
});
