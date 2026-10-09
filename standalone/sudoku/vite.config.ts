import { defineConfig } from 'vite';

// This game is independently runnable inside the Vinext host repository.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  base: './',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
