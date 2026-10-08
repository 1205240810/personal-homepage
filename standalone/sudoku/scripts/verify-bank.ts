// Independent bit-mask backtracking validator. This deliberately does not
// import the production solver, and checks solutions directly from the clues.
import bank from '../src/puzzles.json';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
export function independentSolutions(input:number[]):number{
 const g=[...input],rows=Array(9).fill(0),cols=Array(9).fill(0),boxes=Array(9).fill(0);let found=0;
 const box=(i:number)=>Math.floor(i/27)*3+Math.floor(i%9/3);
 for(let i=0;i<81;i++){if(!g[i])continue;const r=Math.floor(i/9),c=i%9,b=box(i),bit=1<<g[i];assert.equal((rows[r]|cols[c]|boxes[b])&bit,0);rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;}
 function search(){if(found>=2)return;let pick=-1,bits=0,best=10;for(let i=0;i<81;i++){if(g[i])continue;const opts=1022&~(rows[Math.floor(i/9)]|cols[i%9]|boxes[box(i)]);let n=0;for(let v=opts;v;v&=v-1)n++;if(n===0)return;if(n<best){best=n;pick=i;bits=opts;if(n===1)break;}}if(pick<0){found++;return;}const r=Math.floor(pick/9),c=pick%9,b=box(pick);while(bits){const bit=bits&-bits;bits^=bit;g[pick]=Math.log2(bit);rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;search();rows[r]^=bit;cols[c]^=bit;boxes[b]^=bit;g[pick]=0;}}
 search();return found;
}
for(const p of bank){assert.equal(independentSolutions(p.grid),1,p.id);assert.equal(p.grid.filter(Boolean).length,p.clues,p.id);}
assert.equal(bank.length,120);assert.equal(new Set(bank.map(p=>p.id)).size,120);
console.log(`Independent bit-mask solver verified ${bank.length} unique puzzles. Bank SHA256 ${createHash('sha256').update(JSON.stringify(bank)).digest('hex')}`);
