import {fresh,validateSnapshot,type Snapshot} from './logic';
import bank from './puzzles.json';
import {decodeProgress,emptyProgress,migrateProgress,type Progress} from './progress';
export const SAVE_KEY='nine-rooms:sudoku:v1';
export const PROGRESS_KEY='nine-rooms:sudoku:progress:v1';
export type Saved={version:1;puzzleId:string;snapshot:Snapshot;seconds:number;assisted?:boolean};
export function decodeSave(raw:string|null):Saved|null{try{const x=JSON.parse(raw||'null');const p=bank.find(p=>p.id===x?.puzzleId);if(!p||x.version!==1||!validateSnapshot(x.snapshot,p.grid)||!Number.isSafeInteger(x.seconds)||x.seconds<0||x.seconds>1e8||x.assisted!==undefined&&typeof x.assisted!=='boolean')return null;return{version:1,puzzleId:p.id,seconds:x.seconds,assisted:x.assisted===true,snapshot:{grid:[...x.snapshot.grid],notes:x.snapshot.notes.map((notes:number[])=>[...notes]),excluded:fresh(p.grid).excluded}}}catch{return null}}
export function readSave():Saved|null{try{return decodeSave(localStorage.getItem(SAVE_KEY))}catch{return null}}
export function writeSave(s:Saved):boolean{try{localStorage.setItem(SAVE_KEY,JSON.stringify(s));return true}catch{return false}}
export function readProgress(legacySave:Saved|null=null):Progress{let progress=emptyProgress();try{progress=decodeProgress(localStorage.getItem(PROGRESS_KEY))??progress}catch{/* Private browsing may disallow storage. */}return migrateProgress(progress,legacySave)}
export function writeProgress(progress:Progress):boolean{try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));return true}catch{return false}}
