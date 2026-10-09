import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Reuse the example's pinned test tools for the shared Signal Pulse component.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    include: ['qa/pulse-game.check.tsx', 'qa/circuit-repair.check.tsx'],
    server: { deps: { inline: true } },
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            'react',
            'react-dom',
            '@testing-library/react',
            '@base-ui/react/toggle',
            '@base-ui/react/toggle-group',
            'lucide-react',
          ],
        },
      },
    },
  },
});
