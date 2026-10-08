import { writeFileSync } from 'node:fs';
import type { Card } from '../src/engine';
import { coach, strategicDealer, FULL_COUNTS, type Mode } from '../src/solver';
const card = (rank: string): Card => ({ rank, id: rank, suit: 'spades' });
const rows: unknown[] = [];
for (const mode of ['classic', 'strategic'] as Mode[]) {
  for (const [ranks, up] of [
    [['10','2'],'6'], [['10','6'],'10'], [['A','2'],'A'], [['A','2'],'10'], [['A','2'],'6'],
    [['A','A'],'2'], [['A','2'],'2'], [['2','2'],'2'], [['A','3'],'2'],
  ] as [string[],string][]) {
    const start = performance.now();
    const answer = coach({ playerCards: ranks.map(card), dealerUpcard: card(up), mode, negativePeek: true }, {maxNodes:150000,maxMs:1200});
    rows.push({kind:'coach',mode,player:ranks,up,ms:performance.now()-start,...answer});
  }
}
let maxNodes=0,maxMs=0,cases=0,worst='',fallbacks=0;
const begin=performance.now();
for(let a=1;a<=10;a++)for(let b=a;b<=10;b++)for(let target=4;target<=21;target++){
  const player=target<=11?[2,target-2]:target===21?[1,10]:[10,target-10];
  const counts:number[]=[...FULL_COUNTS]; for(const r of [a,b,...player])counts[r-1]--;
  const make=(r:number)=>card(r===1?'A':String(r));
  const start=performance.now();
  const x=strategicDealer({ownCards:[make(a),make(b)],playerCards:player.map(make),remainingCounts:counts},{maxNodes:Infinity,maxMs:Infinity});
  const ms=performance.now()-start;cases++;
  if(x.nodes>maxNodes){maxNodes=x.nodes;worst=`${a},${b} vs ${target}`;}
  maxMs=Math.max(maxMs,ms);fallbacks+=Number(x.method!=='exact-finite');
}
const result={description:'Single-run timings are environment-dependent; coach caps 150000 nodes/1200ms; dealer uncapped exact.',coach:rows,dealer:{cases,maxNodes,worst,maxMs,totalMs:performance.now()-begin,fallbacks}};
writeFileSync('solver-benchmark-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
