import {countSolutions,logicalGrade,peers,digits} from '../src/logic';
import {readFileSync,writeFileSync} from 'node:fs';
// Fixed seed and legacy fixture make regeneration reproducible, while new full
// solutions are randomized backtracking constructions, not reskins of one grid.
let state=2026100802;const rng=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
const shuffle=<T,>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function solution(){const g=Array(81).fill(0);function fill():boolean{let cell=-1,options=digits;for(let i=0;i<81;i++){if(g[i])continue;const ds=digits.filter(d=>!peers[i].some(p=>g[p]===d));if(!ds.length)return false;if(cell<0||ds.length<options.length){cell=i;options=ds;if(ds.length===1)break;}}if(cell<0)return true;for(const d of shuffle([...options])){g[cell]=d;if(fill())return true;}g[cell]=0;return false;}fill();return g;}
const bank=JSON.parse(readFileSync(new URL('./legacy-puzzles.json',import.meta.url),'utf8')) as {id:string;difficulty:string;grid:number[];grade:ReturnType<typeof logicalGrade>;clues:number}[];
const keys=new Set(bank.map(p=>p.grid.join('')));let attempt=0;
while(bank.length<120&&attempt<30000){attempt++;const grid=solution(),order=shuffle(Array.from({length:81},(_,i)=>i));const target=bank.filter(p=>p.difficulty==='easy').length<40&&attempt%3===0?38:24;let clues=81;for(const i of order){if(clues<=target)break;const old=grid[i];grid[i]=0;if(countSolutions(grid)!==1)grid[i]=old;else clues--;}
const grade=logicalGrade(grid),key=grid.join('');if(grade.remaining||keys.has(key)||bank.filter(p=>p.difficulty===grade.difficulty).length>=40)continue;
keys.add(key);bank.push({id:`p${String(bank.length+1).padStart(3,'0')}`,difficulty:grade.difficulty,grid,grade,clues});console.log('Accepted',bank.length,'attempt',attempt,grade.difficulty,'clues',clues,'hidden',grade.hidden,'locked',grade.locked);}
if(bank.length!==120)throw new Error(`Only ${bank.length} puzzles after ${attempt} attempts`);writeFileSync(new URL('../src/puzzles.json',import.meta.url),JSON.stringify(bank,null,2)+'\n');console.log('Wrote',bank.length,'puzzles in',attempt,'attempts');
