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
    include: [
      'qa/pulse-game.check.tsx',
      'qa/circuit-repair.check.tsx',
      'qa/mech-sweeper.check.tsx',
      'qa/game-room.check.tsx',
      'qa/fault-finder.check.tsx',
      'qa/life.check.tsx',
      'qa/theme-switcher.check.tsx',
      'qa/chess.check.tsx',
      'qa/timeloop.check.tsx',
      'qa/rulewords.check.tsx',
      'qa/maze.check.tsx',
      'qa/hashi.check.tsx',
      'qa/flow.check.tsx',
      'qa/laser.check.tsx',
      'qa/sand.check.tsx',
      'qa/langton.check.tsx',
    ],
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
