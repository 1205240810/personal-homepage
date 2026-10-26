// Bundles the 联机对战 relay (server/play/main.ts + ws) into one file next to
// the Node standalone server, so a release directory is self-contained.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/play/main.ts'],
  outfile: 'dist/standalone/play-server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'warning',
});
