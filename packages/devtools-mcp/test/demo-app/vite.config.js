import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgs = (...p) => resolve(__dirname, '..', '..', '..', '..', 'packages', ...p);

export default defineConfig({
  resolve: {
    alias: {
      'what-core': pkgs('core', 'src', 'index.js'),
      'what-devtools': pkgs('devtools', 'src', 'index.js'),
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
