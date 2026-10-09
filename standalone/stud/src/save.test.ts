// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {act,advance,initial,limits,startHand, type Game} from './engine';
import {loadGame,saveGame,validGame,SAVE_KEY} from './save';
afterEach(()=>{localStorage.clear();vi.restoreAllMocks()});
describe('exact snapshot compatibility',()=>{
 it('round trips ready, betting, dealing, runout and complete without replaying antes',()=>{
  let g=initial();for(let n=0;n<10;n++){expect(validGame(g)).toBe(true);saveGame(g);expect(loadGame(true).game).toEqual(g);g=startHand(g,()=>.4);expect(validGame(g)).toBe(true);saveGame(g);expect(loadGame(true).game).toEqual(g);while(g.phase!=='complete'){if(g.phase==='betting'){const l=limits(g);g=act(g,g.turn,l.call?{type:'call'}:{type:'check'});}else g=advance(g,g.revision);expect(validGame(g)).toBe(true);saveGame(g);expect(loadGame(true).game).toEqual(g)}}
  g=startHand(initial([3,997]),()=>.4);expect(g.phase).toBe('runout');expect(validGame(g)).toBe(true);saveGame(g);expect(loadGame(true).game).toEqual(g);
 });
 it('rejects malformed snapshots and duplicate cards',()=>{const g=startHand(initial(),()=>.4);for(const corrupt of [{...g,deck:[...g.deck,g.cards[0][0]]},{...g,pot:-1},{...g,stacks:[900,900]},{...g,phase:'bad'},{...g,reviews:[null]},{...g,cards:[[],[]]},{...g,acted:[1,2]},{...g,acted:[true,true]},{...g,phase:'runout',paid:[0,10]}]){localStorage.setItem(SAVE_KEY,JSON.stringify({v:2,game:corrupt}));expect(loadGame(true).game).toEqual(initial())}});
 it('migrates v1 settled saves, ignores future versions and respects isolated mode',()=>{localStorage.setItem(SAVE_KEY,JSON.stringify({v:1,stacks:[620,380],hand:3}));expect(loadGame(true).game.stacks).toEqual([620,380]);expect(loadGame(false).game).toEqual(initial());localStorage.setItem(SAVE_KEY,JSON.stringify({v:99,game:initial()}));expect(loadGame(true).game).toEqual(initial())});
 it('reports storage failure without throwing',()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')});expect(saveGame(initial())).toBe(false)});
 it('accepts action snapshots through randomized legal raises and folds',()=>{for(let n=0;n<50;n++){let g:Game=startHand(initial());let count=0;while(g.phase!=='complete'&&count++<200){expect(validGame(g)).toBe(true);if(g.phase!=='betting'){g=advance(g,g.revision);continue}const l=limits(g);g=act(g,g.turn,Math.random()<.05?{type:'fold'}:Math.random()<.3&&l.max>l.current?{type:'raise',to:Math.min(l.max,l.min)}:l.call?{type:'call'}:{type:'check'})}expect(validGame(g)).toBe(true)}})
});
