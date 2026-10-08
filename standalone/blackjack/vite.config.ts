import { defineConfig } from 'vite';

// Keep the learning example independent from the parent Vinext/Vite 8 config.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
