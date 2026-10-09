import {Card,chooseHoldAsync,Difficulty} from './logic';
import {workerSource} from './worker-source';
export function requestHold(dice:number[],card:Card,difficulty:Difficulty,done:(decision:{held:boolean[];value:number})=>void){
 let canceled=false,settled=false,fallbackStarted=false,worker:Worker|undefined,url:string|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 const cleanup=()=>{worker?.terminate();if(url)URL.revokeObjectURL(url);if(timeout)clearTimeout(timeout);};
 const fallback=()=>{if(canceled||settled||fallbackStarted)return;fallbackStarted=true;cleanup();void chooseHoldAsync(dice,card,difficulty,()=>canceled).then(result=>{if(result&&!canceled&&!settled){settled=true;done(result);};});};
 try{url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));worker=new Worker(url);worker.onmessage=e=>{if(canceled||settled||fallbackStarted)return;settled=true;cleanup();done(e.data);};worker.onerror=fallback;worker.postMessage({dice,card,difficulty});timeout=setTimeout(fallback,4000);}catch{fallback();}
 return()=>{canceled=true;cleanup();};
}
