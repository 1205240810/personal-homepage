import {describe,it,expect,vi} from 'vitest';
import {categories,initial,options,bonusFor,roll,score,chooseHold,chooseHoldAsync,total,restore,STORAGE,bestScore} from './logic';
describe('score rules',()=>{
 it('upper, kinds, full house and straights',()=>{expect(options([2,2,2,3,3],{})).toMatchObject({twos:6,threes:6,three:12,four:0,house:25,small:0,large:0,chance:12});expect(options([1,2,3,4,4],{})).toMatchObject({small:30,large:0});expect(options([2,3,4,5,6],{})).toMatchObject({small:30,large:40});expect(options([6,6,6,6,6],{})).toMatchObject({house:0,yahtzee:50,three:30,four:30});});
 it('Joker forced upper with zero or 50; bonus only from 50',()=>{for(const n of [0,50]){expect(options([3,3,3,3,3],{yahtzee:n})).toEqual({threes:15});expect(bonusFor([3,3,3,3,3],{yahtzee:n})).toBe(n===50?100:0);expect(options([3,3,3,3,3],{yahtzee:n,threes:9})).toMatchObject({house:25,small:30,large:40,chance:15});}});
 it('Joker fallback zero only if lower full',()=>{const card={threes:9,three:20,four:0,house:25,small:30,large:40,yahtzee:50,chance:25};expect(options([3,3,3,3,3],card)).toEqual({ones:0,twos:0,fours:0,fives:0,sixes:0});});
 it('upper bonus threshold',()=>{expect(total({sixes:30,fives:25,fours:8})).toBe(98);expect(total({sixes:30,fives:25,fours:7})).toBe(62);});
 it('invalid dice are unscoreable and filled categories not selectable',()=>{expect(options([0,1,1,1,1],{})).toEqual({});expect(options([1,1,1,1,1],{ones:0}).ones).toBeUndefined();});
});
describe('state and fairness',()=>{
 it('at most 3 rolls; first ignores holds; subsequent preserves',()=>{let s=initial();s.held=[true,true,true,true,true];s=roll(s,()=>.99);expect(s.dice).toEqual([6,6,6,6,6]);s.held=[true,false,false,false,false];s=roll(s,()=>0);expect(s.dice).toEqual([6,1,1,1,1]);s=roll(s,()=>.3);expect(roll(s)).toBe(s);});
 it('no score before roll, no double score, exactly 13 rounds',()=>{let s=initial();expect(score(s,'chance')).toBe(s);for(const c of categories){s=score(roll(s,()=>.2),c);expect(s.turn).toBe('ai');expect(score(s,c)).toBe(s);s=score(roll(s,()=>.2),c);}expect(s.turn).toBe('done');expect(roll(s)).toBe(s);expect(score(s,'chance')).toBe(s);});
 it('bonus added once on commitment',()=>{const s={...initial(),rolls:1,dice:[6,6,6,6,6],cards:[{yahtzee:50},{}] as [{yahtzee:number},{}]};const next=score(s,'sixes');expect(next.bonus[0]).toBe(100);expect(score(next,'sixes').bonus[0]).toBe(100);});
 it('AI no RNG access; preserves made large straight',()=>{const spy=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('future peek');});expect(chooseHold([2,3,4,5,6],{},'normal').held.every(Boolean)).toBe(true);expect(bestScore([1,2,3,4,5],{},'easy').category).toBe('large');spy.mockRestore();});
 it('cooperative and sync strategy match; supports cancel',async()=>{expect(await chooseHoldAsync([1,2,3,4,6],{},'normal',()=>false)).toEqual(chooseHold([1,2,3,4,6],{},'normal'));expect(await chooseHoldAsync([1,2,3,4,6],{},'normal',()=>true)).toBeNull();});
 it('strict versioned persistence rejects corrupt states',()=>{const s=initial();expect(restore(JSON.stringify(s))).toEqual(s);for(const invalid of ['null','bad',JSON.stringify({...s,version:2}),JSON.stringify({...s,dice:[0,1,1,1,1]}),JSON.stringify({...s,turn:'ai'}),JSON.stringify({...s,cards:[{unknown:1},{}]})])expect(restore(invalid)).toBeNull();expect(STORAGE).toContain('v1');});
});

 describe('checkpoint integrity',()=>{
 it('rejects impossible bonuses, sums and oversized metadata',()=>{const s=initial();expect(restore(JSON.stringify({...s,bonus:[1200,0]}))).toBeNull();for(const c of ['three','four','chance'])expect(restore(JSON.stringify({...s,turn:'ai',cards:[{[c]:1},{}]}))).toBeNull();expect(restore(JSON.stringify({...s,lastAI:'a'.repeat(501)}))).toBeNull();expect(restore(JSON.stringify({...s,id:'a'.repeat(161)}))).toBeNull();expect(restore(JSON.stringify({...s,held:[true,false,false,false,false]}))).toBeNull();});
 it('preserves a valid older v1 checkpoint without changing dice or holds',()=>{const s={...initial(),rolls:2,dice:[6,6,2,3,4],held:[true,true,false,false,false]};expect(restore(JSON.stringify(s))).toEqual(s);});
 });
