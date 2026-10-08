export type Grid = number[];
export type Difficulty = 'easy' | 'medium' | 'hard';
export const digits = [1,2,3,4,5,6,7,8,9];
export const units: number[][] = [
 ...digits.map((_,r)=>digits.map((_,c)=>r*9+c)),
 ...digits.map((_,c)=>digits.map((_,r)=>r*9+c)),
 ...digits.map((_,b)=>digits.map((_,i)=>Math.floor(b/3)*27+(b%3)*3+Math.floor(i/3)*9+i%3))
];
export const peers = Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(n=>n!==i));
export const pos=(i:number)=>`第 ${Math.floor(i/9)+1} 行第 ${i%9+1} 列`;
export const unitName=(u:number)=>u<9?`第 ${u+1} 行`:u<18?`第 ${u-8} 列`:`第 ${u-17} 宫`;
export function conflicts(g:Grid):number[]{return g.flatMap((v,i)=>v&&peers[i].some(p=>g[p]===v)?[i]:[])}
export function candidates(g:Grid, excluded:number[][]=[]):number[][] {return g.map((v,i)=>v?[]:digits.filter(d=>!peers[i].some(p=>g[p]===d)&&!excluded[i]?.includes(d)))}
export function countSolutions(grid:Grid,limit=2):number {
 if(grid.length!==81 || grid.some(x=>!Number.isInteger(x)||x<0||x>9)||conflicts(grid).length)return 0;
 const g=[...grid];let count=0;
 const solve=()=>{if(count>=limit)return;let cell=-1, options:number[]=digits;
 for(let i=0;i<81;i++){if(g[i])continue;const ds=digits.filter(d=>!peers[i].some(p=>g[p]===d));if(!ds.length)return;if(cell===-1||ds.length<options.length){cell=i;options=ds;if(ds.length===1)break;}}
 if(cell===-1){count++;return;}for(const d of options){g[cell]=d;solve();if(count>=limit)break;}g[cell]=0;};solve();return count;
}
export type Deduction={kind:'naked'|'hidden'|'locked'; title:string; explanation:string; premises:number[]; unit:number[]; target:number; digit:number; eliminate?:number[]};
export function deduction(g:Grid, excluded:number[][]=[], allowLocked=true):Deduction|null {
 const cs=candidates(g,excluded);
 for(let i=0;i<81;i++)if(cs[i].length===1){const d=cs[i][0];const premises=peers[i].filter(p=>g[p]>0);return {kind:'naked',title:'唯一候选数',explanation:`${pos(i)}的同行、同列、同宫排除了其他数字，只剩 ${d}。候选数依据已填数字${excluded[i]?.length?'和已确认的排除':''}计算。`,premises,unit:peers[i],target:i,digit:d};}
 for(let u=0;u<27;u++)for(const d of digits){const cells=units[u].filter(i=>cs[i].includes(d));if(cells.length===1){const i=cells[0];const excludedCells=units[u].filter(c=>!g[c]&&excluded[c]?.includes(d));return{kind:'hidden',title:'单元唯一位置',explanation:`${unitName(u)}必须有一个 ${d}。这个单元内只有${pos(i)}仍允许填 ${d}，所以这里确定是 ${d}。${excludedCells.length?`依据包括之前已确认的候选排除：${excludedCells.map(pos).join('、')}不能填 ${d}。`:''}`,premises:[...new Set([...units[u].filter(c=>g[c]>0),...excludedCells,...units[u].flatMap(c=>peers[c].filter(p=>g[p]===d))])],unit:units[u],target:i,digit:d};}}
 if(allowLocked)for(let b=18;b<27;b++)for(const d of digits){const cells=units[b].filter(i=>cs[i].includes(d));if(cells.length<2)continue;for(const axis of [0,1]){const coord=(i:number)=>axis?i%9:Math.floor(i/9);if(!cells.every(i=>coord(i)===coord(cells[0])))continue;const u=coord(cells[0])+(axis?9:0);const targets=units[u].filter(i=>!units[b].includes(i)&&cs[i].includes(d));if(targets.length)return{kind:'locked',title:'宫内锁定候选',explanation:`${unitName(b)}中的 ${d} 只能出现在${unitName(u)}的 ${cells.length} 个候选格。因此，该${axis?'列':'行'}在宫外的 ${targets.length} 格不能再填 ${d}。这一步只排除候选，不直接填数。`,premises:cells,unit:[...new Set([...units[b],...units[u]])],target:targets[0],digit:d,eliminate:targets};}}
 return null;
}
export function logicalGrade(grid:Grid):{difficulty:Difficulty;steps:number;hidden:number;locked:number;remaining:number}{const g=[...grid],ex=Array.from({length:81},()=>[] as number[]);let steps=0,hidden=0,locked=0;while(steps<400){const d=deduction(g,ex);if(!d)break;steps++;if(d.kind==='hidden')hidden++;if(d.eliminate){locked++;for(const i of d.eliminate)ex[i].push(d.digit)}else g[d.target]=d.digit;}const remaining=g.filter(x=>!x).length;return{difficulty:remaining||locked?'hard':hidden?'medium':'easy',steps,hidden,locked,remaining};}
export type Snapshot={grid:Grid;notes:number[][];excluded:number[][]};
export const fresh=(grid:Grid):Snapshot=>({grid:[...grid],notes:Array.from({length:81},()=>[]),excluded:Array.from({length:81},()=>[])});
export function put(s:Snapshot, givens:Grid,i:number,d:number,pencil=false):Snapshot {if(givens[i]||i<0||i>80||d<0||d>9)return s;const next=structuredClone(s);if(pencil&&d&& !next.grid[i]){next.notes[i]=next.notes[i].includes(d)?next.notes[i].filter(n=>n!==d):[...next.notes[i],d].sort();}else{next.grid[i]=d;next.notes[i]=[];next.excluded=Array.from({length:81},()=>[]);}return next;}
export function applyDeduction(s:Snapshot,d:Deduction):Snapshot {const n=structuredClone(s);if(d.eliminate){for(const i of d.eliminate){n.excluded[i]=[...new Set([...n.excluded[i],d.digit])];}}else{n.grid[d.target]=d.digit;n.notes[d.target]=[];}return n;}
export function validateSnapshot(x:unknown,givens:Grid):x is Snapshot {if(!x||typeof x!=='object')return false;const s=x as Snapshot;return Array.isArray(s.grid)&&s.grid.length===81&&s.grid.every((d,i)=>Number.isInteger(d)&&d>=0&&d<=9&&(!givens[i]||givens[i]===d))&&[s.notes,s.excluded].every(a=>Array.isArray(a)&&a.length===81&&a.every(v=>Array.isArray(v)&&v.length<=9&&new Set(v).size===v.length&&v.every(d=>Number.isInteger(d)&&d>=1&&d<=9)));}
