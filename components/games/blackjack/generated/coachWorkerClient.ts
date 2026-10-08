// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
import source from './coachWorkerSource';
/** Inline source keeps the portable file offline; ownership of every Blob URL is explicit. */
export function createCoachWorker():{worker:Worker;dispose:()=>void}{
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 let worker:Worker;
 try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
 let disposed=false;
 return {worker,dispose:()=>{if(disposed)return;disposed=true;worker.terminate();URL.revokeObjectURL(url);}};
}
