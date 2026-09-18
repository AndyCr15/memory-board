/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Copies `api/` into `dist/api/` after the Vite bundle is written.
 *
 * • `.htaccess` files are preserved (`fs.cpSync` copies dotfiles).
 * • `api/config.php` is omitted by default so public builds never ship DB
 *   credentials.  Self-hosted deploys pass `--mode selfhosted` (or set
 *   `MB_BUNDLE_API_CONFIG=1`) to include the local config file.
 */
function copyApiDirectory(includeConfig: boolean): Plugin {
  return {
    name: 'copy-api-directory',
    apply: 'build',
    closeBundle() {
      const src = path.resolve(__dirname, 'api');
      const dest = path.resolve(__dirname, 'dist', 'api');
      if (!existsSync(src)) return;

      cpSync(src, dest, {
        recursive: true,
        filter: (source) =>
          includeConfig || path.basename(source) !== 'config.php',
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const includeApiConfig =
    mode === 'selfhosted' || process.env.MB_BUNDLE_API_CONFIG === '1';

  return {
    plugins: [react(), copyApiDirectory(includeApiConfig)],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
