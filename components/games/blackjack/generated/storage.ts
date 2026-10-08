// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
import type { Mode } from './game';
export type Stats = { wins: number; losses: number; ties: number };
export type Settings = { sound: boolean; coach: boolean; mode: Mode };
export type Saved = { stats: Record<Mode,Stats>; settings: Settings; legacy?: Stats };
export const EMPTY_STATS: Stats = { wins: 0, losses: 0, ties: 0 };
export const DEFAULT_SETTINGS: Settings = { sound: false, coach: false, mode: 'classic' };
const KEY = 'twenty-one:v2';
export function emptySaved():Saved{return {stats:{classic:{...EMPTY_STATS},strategic:{...EMPTY_STATS}},settings:{...DEFAULT_SETTINGS}};}
function validStats(value:unknown):value is Stats {if(!value||typeof value!=='object')return false;return ['wins','losses','ties'].every(key=>Number.isSafeInteger((value as Record<string,unknown>)[key])&&Number((value as Record<string,unknown>)[key])>=0);}
export function readSaved(storage?: Pick<Storage, 'getItem'>): Saved {
 const result=emptySaved();
 try{
  const source=storage??(typeof window!=='undefined'?window.localStorage:undefined);
  const value=JSON.parse(source?.getItem(KEY)??'null');
  if(value?.version===2){
   for(const mode of ['classic','strategic'] as const)if(validStats(value.stats?.[mode]))result.stats[mode]={...value.stats[mode]};
   if(typeof value.settings?.sound==='boolean')result.settings.sound=value.settings.sound;
   if(typeof value.settings?.coach==='boolean')result.settings.coach=value.settings.coach;
   if(['classic','strategic'].includes(value.settings?.mode))result.settings.mode=value.settings.mode;
   if(validStats(value.legacy))result.legacy={...value.legacy};
  }else if(value===null){const old=JSON.parse(source?.getItem('twenty-one:v1')??'null');if(old?.version===1&&validStats(old.stats))result.legacy={...old.stats};}
  return result;
 }catch{return result;}
}
export function save(value:Saved,storage?:Pick<Storage,'setItem'>):boolean{
 try{const target=storage??(typeof window!=='undefined'?window.localStorage:undefined);if(!target)return false;target.setItem(KEY,JSON.stringify({version:2,...value}));return true;}catch{return false;}
}
