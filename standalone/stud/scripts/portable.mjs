import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const notices = ['react', 'react-dom', 'scheduler'].map(name => {
  const license = readFileSync(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8');
  if (license.includes('-->')) throw new Error(`Cannot safely include ${name} license in an HTML comment.`);
  return `<!--\nBundled dependency: ${name}\n${license}\n-->`;
}).join('\n');
const base = new URL('../dist/', import.meta.url);
const assets = readdirSync(new URL('assets/', base));
const js = assets.filter(name => name.endsWith('.js')).map(name => readFileSync(new URL(`assets/${name}`, base),'utf8')).join('\n');
const css = assets.filter(name => name.endsWith('.css')).map(name => readFileSync(new URL(`assets/${name}`, base),'utf8')).join('\n');
// All production assets are bundled inline; there is no import/fetch dependency.
const html = `<!doctype html>\n${notices}\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#23141d"><title>绯夜 · 五张梭哈</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body style="margin:0"><div id="root"></div><script type="module">${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
writeFileSync(new URL('../绯夜五张梭哈.html', import.meta.url),html);
console.log('Portable HTML written:', Buffer.byteLength(html), 'bytes');
