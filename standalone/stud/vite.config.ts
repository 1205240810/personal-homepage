import { defineConfig } from 'vite';

// The standalone game must not inherit the parent Vinext/Vite 8 configuration.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
