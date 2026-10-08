const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');const assert=require('node:assert/strict');
const raw=readFileSync(new URL('../九间数独.html',`file://${__filename}`),'utf8');assert(!/\b(?:src|href)="(?:https?:|\/assets)/.test(raw));
const dom=new JSDOM(raw.replace('<script type="module">','<script>'),{runScripts:'dangerously',url:'https://offline.local/'});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 await wait(150);const doc=dom.window.document;
 assert.equal(doc.querySelectorAll('.sg-cell').length,81);
 const button=(text)=>[...doc.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 assert.equal(button('背景音乐').getAttribute('aria-pressed'),'false');
 assert.equal(button('操作音效').getAttribute('aria-pressed'),'false');
 assert.match(doc.querySelector('.sg-footer').textContent,/120/);
 button('开启新一局').click();await wait(60);
 assert(doc.querySelector('[role="dialog"]'));
 assert(button('随机一题'));
 const keep=button('保留当前');assert(keep);keep.click();await wait(60);
 assert(!doc.querySelector('[role="dialog"]'));
 assert.equal(doc.querySelectorAll('.sg-cell').length,81);
 console.log('Portable inline bundle mounted: 81 cells, 120-puzzle library opens/closes, default audio off, no external source assets.');
 }catch(e){console.error(e);process.exitCode=1}finally{dom.window.close()}
})();
