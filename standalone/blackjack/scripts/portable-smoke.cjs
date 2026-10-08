const fs=require('node:fs');const {JSDOM}=require('jsdom');const {Worker:NodeWorker}=require('node:worker_threads');
const html=fs.readFileSync(new URL('../暗牌21.html',`file://${__filename}`),'utf8');
const dom=new JSDOM(html,{url:'https://local-test.invalid/',runScripts:'outside-only',pretendToBeVisual:true});const win=dom.window;
const urls=new Map();let created=0,revoked=0,workers=0;const live=new Set();
win.Blob=Blob;win.URL.createObjectURL=blob=>{const id=`blob:smoke-${++created}`;urls.set(id,blob);return id;};win.URL.revokeObjectURL=id=>{urls.delete(id);revoked++;};
win.Worker=class{
 constructor(url){this.queue=[];this.dead=false;const blob=urls.get(url);if(!blob)throw Error('missing inline worker Blob');blob.text().then(source=>{if(this.dead)return;workers++;this.thread=new NodeWorker(`const {parentPort}=require('node:worker_threads');const self={postMessage:data=>parentPort.postMessage(data)};parentPort.on('message',data=>self.onmessage?.({data}));\n${source}`,{eval:true});live.add(this.thread);this.thread.on('message',data=>{if(!this.dead)this.onmessage?.({data});});this.thread.on('error',error=>{if(!this.dead)this.onerror?.(error);});for(const value of this.queue)this.thread.postMessage(value);this.queue=[];});}
 postMessage(value){if(this.thread)this.thread.postMessage(value);else this.queue.push(value);}
 terminate(){this.dead=true;if(this.thread){void this.thread.terminate();live.delete(this.thread);}}
};
win.Math.random=()=>.5;
const scripts=[...win.document.scripts];if(scripts.length!==1)throw Error('invalid script packaging');win.eval(scripts[0].textContent);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const find=(text)=>[...win.document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));
async function wait(check,label){const end=Date.now()+10000;while(Date.now()<end){if(check())return;await sleep(30);}throw Error('timeout: '+label);}
(async()=>{
 await wait(()=>find('开始对局'),'mount');win.document.querySelector('[role=switch]').click();find('开始对局').click();
 await wait(()=>find('停牌')&&!find('停牌').disabled,'player action');find('停牌').click();
 await wait(()=>find('复盘本局'),'settlement');find('复盘本局').click();
 await wait(()=>win.document.querySelector('.bj-coach-verdict'),'actual inline worker result');
 const classic=win.document.querySelector('.bj-coach-verdict').textContent;find('第 1 步').click();await sleep(40);if(!win.document.querySelector('.bj-coach-verdict'))throw Error('same-step regression');
 find('策略庄家').click();await wait(()=>find('开始对局'),'mode switched');find('开始对局').click();await wait(()=>find('停牌')&&!find('停牌').disabled,'strategic action');find('停牌').click();await wait(()=>find('复盘本局'),'strategic settlement');find('复盘本局').click();await wait(()=>win.document.querySelector('.bj-coach-verdict'),'strategic worker result');const strategic=win.document.querySelector('.bj-coach-verdict').textContent;
 win.document.querySelector('[role=switch]').click();await sleep(40);if(urls.size!==0)throw Error('Blob URL leaked');
 console.log(JSON.stringify({test:'jsdom production HTML with real Node worker_threads executing the embedded browser worker source',classic,strategic,workers,blobCreated:created,blobRevoked:revoked,externalAssets:win.document.querySelectorAll('script[src],link[href]').length,browserVisualVerified:false},null,2));
 dom.window.close();for(const thread of live)await thread.terminate();
})().catch(async error=>{console.error(error);dom.window.close();for(const thread of live)await thread.terminate();process.exitCode=1;});
