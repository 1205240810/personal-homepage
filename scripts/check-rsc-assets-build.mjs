import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const manifestName = '__vite_rsc_assets_manifest.js';
const main = readFileSync(join(dist, 'server', manifestName), 'utf8');
// This deployment uses same-origin static assets, so the generated manifest is
// plain data. Fail closed if a future bundler emits a different format.
const manifest = JSON.parse(main.replace(/^export default\s+/, '').replace(/;\s*$/, ''));
const bootstrap = /^import\("([^"\\]+)"\)$/.exec(manifest.bootstrapScriptContent);
assert(bootstrap, 'RSC bootstrap must reference a static client entry');
const urls = new Set([bootstrap[1]]);
for (const group of [manifest.clientReferenceDeps, manifest.serverResources]) {
  for (const deps of Object.values(group)) {
    for (const url of [...deps.js, ...deps.css]) urls.add(url);
  }
}
const roots = [dist];
if (process.env.DEPLOY_TARGET === 'node') roots.push(join(dist, 'standalone', 'dist'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const root of roots) {
  for (const folder of ['server', 'server/ssr']) {
    assert.equal(readFileSync(join(root, folder, manifestName), 'utf8'), main,
      `RSC manifest differs in ${root}/${folder}`);
  }
  for (const value of urls) {
    assert(typeof value === 'string' && value.startsWith('/_next/static/'),
      `Unexpected RSC asset URL: ${value}`);
    const url = new URL(value, 'https://build.invalid');
    assert(url.origin === 'https://build.invalid' && !url.search && !url.hash &&
      url.pathname === value, `Invalid RSC asset URL: ${value}`);
    const bytes = readFileSync(join(root, 'client', value.slice(1)));
    assert(bytes.length > 0, `Empty RSC asset: ${value}`);
    assert.equal(hash(bytes), hash(readFileSync(join(dist, 'client', value.slice(1)))),
      `Standalone RSC asset differs: ${value}`);
  }
}
console.log(`✓ RSC assets: ${urls.size} JS/CSS references exist; ${roots.length} build copies match`);
