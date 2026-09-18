/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Raise the chunk-size warning limit slightly for the rich-text editor bundle
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // Use jsdom so DOMPurify's DOM manipulation APIs are available in tests
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
