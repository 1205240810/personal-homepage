import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const notices=['react','react-dom','scheduler'].map(name=>{
 const license=readFileSync(new URL(`../node_modules/${name}/LICENSE`,import.meta.url),'utf8');
 if(license.includes('-->'))throw new Error(`Cannot safely include ${name} license in an HTML comment.`);
 return `<!--\nBundled dependency: ${name}\n${license}\n-->`;
}).join('\n');
const base=new URL('../dist/',import.meta.url),assets=readdirSync(new URL('assets/',base));
const js=assets.filter(n=>n.endsWith('.js')).map(n=>readFileSync(new URL(`assets/${n}`,base),'utf8')).join('\n');
const css=assets.filter(n=>n.endsWith('.css')).map(n=>readFileSync(new URL(`assets/${n}`,base),'utf8')).join('\n');
const html=`<!doctype html>\n${notices}\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f0e7"><title>九间 · 数独练习室</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body style="margin:0"><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script></body></html>`;
writeFileSync(new URL('../九间数独.html',import.meta.url),html);console.log('Portable HTML:',Buffer.byteLength(html),'bytes');
