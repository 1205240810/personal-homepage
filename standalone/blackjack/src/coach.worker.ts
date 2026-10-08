import { coach, type CoachSnapshot } from './solver';
self.onmessage = (event: MessageEvent<{id:number;snapshot:CoachSnapshot}>) => {
 try { const result=coach(event.data.snapshot,{maxNodes:150000,maxMs:1200});self.postMessage({id:event.data.id,result}); }
 catch(error){self.postMessage({id:event.data.id,error:error instanceof Error?error.message:'无法完成分析'});}
};
