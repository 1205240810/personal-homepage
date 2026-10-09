import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const notices = ['react', 'react-dom', 'scheduler'].map(name => {
  const license = readFileSync(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8');
  if (license.includes('-->')) throw new Error(`Cannot safely include ${name} license in an HTML comment.`);
  return `<!--\nBundled dependency: ${name}\n${license}\n-->`;
}).join('\n');
const base = new URL('../dist/', import.meta.url);
const assets = readdirSync(new URL('assets/', base));
if (assets.filter(name => name.endsWith('.js')).length !== 1) {
  throw new Error('Portable build requires one bundled JS entry; code-split imports cannot be concatenated safely.');
}
const js = assets.filter(name => name.endsWith('.js')).map(name => readFileSync(new URL(`assets/${name}`, base),'utf8')).join('\n');
const css = assets.filter(name => name.endsWith('.css')).map(name => readFileSync(new URL(`assets/${name}`, base),'utf8')).join('\n');
// All production assets are bundled inline; there is no import/fetch dependency.
const html = `<!doctype html>\n${notices}\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111e30"><title>快艇骰子 · 蓝调骰子会所</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body style="margin:0"><div id="root"></div><script type="module">${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
writeFileSync(new URL('../快艇骰子.html', import.meta.url),html);
console.log('Portable HTML written:', Buffer.byteLength(html), 'bytes');
