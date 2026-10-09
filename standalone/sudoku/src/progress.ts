import {conflicts,type Difficulty} from './logic';
import type {Saved} from './storage';
import bank from './puzzles.json';

export type PuzzleStatus='all'|'unsolved'|'solved'|'unplayed';
export type CompletedPuzzle={seconds:number;assisted:boolean};
export type Progress={version:1;started:string[];solved:Record<string,CompletedPuzzle>};
type PuzzleRef={id:string;difficulty:string};
const knownIds=new Set(bank.map(p=>p.id));
export const emptyProgress=():Progress=>({version:1,started:[],solved:{}});

/** Progress is a separate, bounded record. Never trust saved IDs or arbitrary fields. */
export function decodeProgress(raw:string|null):Progress|null {
 try {
  const value:unknown=JSON.parse(raw||'null');
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const x=value as Record<string,unknown>;
  if(x.version!==1||!Array.isArray(x.started)||!x.solved||typeof x.solved!=='object'||Array.isArray(x.solved))return null;
  const started=[...new Set(x.started.filter((id):id is string=>typeof id==='string'&&knownIds.has(id)))];
  const solved:Progress['solved']={};
  for(const [id,value] of Object.entries(x.solved)){
   if(!knownIds.has(id)||!value||typeof value!=='object'||Array.isArray(value))continue;
   const record=value as Record<string,unknown>;
   if(typeof record.seconds!=='number'||!Number.isInteger(record.seconds)||record.seconds<0||record.seconds>1e8||typeof record.assisted!=='boolean')continue;
   solved[id]={seconds:record.seconds,assisted:record.assisted};
   if(!started.includes(id))started.push(id);
  }
  return {version:1,started,solved};
 }catch{return null}
}

export function markStarted(progress:Progress,id:string):Progress {
 if(!knownIds.has(id)||progress.started.includes(id))return progress;
 return {...progress,started:[...progress.started,id]};
}
export function markSolved(progress:Progress,id:string,result:CompletedPuzzle):Progress {
 if(!knownIds.has(id)||!Number.isInteger(result.seconds)||result.seconds<0||result.seconds>1e8)return progress;
 return {...markStarted(progress,id),solved:{...progress.solved,[id]:{seconds:result.seconds,assisted:result.assisted===true}}};
}
/** Import the legacy current puzzle without rewriting or discarding its v1 save. */
export function migrateProgress(progress:Progress,save:Saved|null):Progress {
 if(!save)return progress;
 const next=markStarted(progress,save.puzzleId);
 return save.snapshot.grid.every(Boolean)&&!conflicts(save.snapshot.grid).length&&!next.solved[save.puzzleId]
  ?markSolved(next,save.puzzleId,{seconds:Math.floor(save.seconds),assisted:save.assisted===true}):next;
}
export function filterPuzzles<T extends PuzzleRef>(puzzles:T[],level:Difficulty,status:PuzzleStatus,progress:Progress):T[] {
 return puzzles.filter(p=>p.difficulty===level&&(status==='all'||(status==='solved'?!!progress.solved[p.id]:status==='unsolved'?!progress.solved[p.id]:!progress.started.includes(p.id))));
}
/** Never repeat the current puzzle; prefer untouched, then unfinished, then solved. */
export function pickRandomPuzzle<T extends PuzzleRef>(puzzles:T[],currentId:string,progress:Progress,random:()=>number=Math.random):T|null {
 const other=puzzles.filter(p=>p.id!==currentId);
 const unplayed=other.filter(p=>!progress.started.includes(p.id));
 const unsolved=other.filter(p=>!progress.solved[p.id]);
 const pool=unplayed.length?unplayed:unsolved.length?unsolved:other;
 if(!pool.length)return null;
 const value=random();
 const index=Number.isFinite(value)?Math.max(0,Math.min(pool.length-1,Math.floor(value*pool.length))):0;
 return pool[index];
}
