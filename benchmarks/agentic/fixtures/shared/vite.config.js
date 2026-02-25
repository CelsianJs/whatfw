import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../../../');

export default defineConfig({
  resolve: {
    alias: {
      'what-core': resolve(monorepoRoot, 'packages/core/src/index.js'),
      'what-devtools': resolve(monorepoRoot, 'packages/devtools/src/index.js'),
    },
  },
  optimizeDeps: {
    exclude: ['what-core', 'what-devtools'],
  },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    jsxImportSource: undefined,
  },
});
