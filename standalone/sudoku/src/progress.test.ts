// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import bank from './puzzles.json';
import {applyDeduction,deduction,fresh} from './logic';
import {decodeProgress,emptyProgress,filterPuzzles,markSolved,markStarted,migrateProgress,pickRandomPuzzle} from './progress';
import {PROGRESS_KEY,SAVE_KEY,readProgress,readSave,writeProgress} from './storage';
const easy=bank.filter(p=>p.difficulty==='easy');
afterEach(()=>{localStorage.clear();vi.restoreAllMocks()});
describe('safe separate puzzle progress',()=>{
 it.each(['','null','{','[]','1','"string"','{"version":2,"started":[],"solved":{}}','{"version":1,"started":{},"solved":{}}','{"version":1,"started":[],"solved":[]}'])('rejects malformed progress %s',raw=>expect(decodeProgress(raw)).toBeNull());
 it('round-trips known records with only allowed fields',()=>{
  let p=markStarted(emptyProgress(),easy[0].id);p=markSolved(p,easy[1].id,{seconds:45,assisted:true});
  expect(decodeProgress(JSON.stringify(p))).toEqual(p);expect(writeProgress(p)).toBe(true);expect(readProgress()).toEqual(p);expect(localStorage.getItem(SAVE_KEY)).toBeNull();
 });
 it('drops unknown IDs, invalid records, duplicate IDs and unexpected data',()=>{
  const raw={version:1,started:[easy[0].id,easy[0].id,'unknown',null,3],solved:{[easy[1].id]:{seconds:10,assisted:false,extra:'drop'},[easy[2].id]:{seconds:-1,assisted:false},[easy[3].id]:{seconds:1.5,assisted:true},[easy[4].id]:{seconds:3,assisted:'false'},unknown:{seconds:1,assisted:false}},unrelated:'drop'};
  expect(decodeProgress(JSON.stringify(raw))).toEqual({version:1,started:[easy[0].id,easy[1].id],solved:{[easy[1].id]:{seconds:10,assisted:false}}});
 });
 it('preserves a legacy current save byte-for-byte while importing its played status',()=>{
  const save={version:1,puzzleId:easy[0].id,snapshot:fresh(easy[0].grid),seconds:17,assisted:true};const raw=JSON.stringify(save);localStorage.setItem(SAVE_KEY,raw);
  const p=readProgress(readSave());expect(p.started).toEqual([easy[0].id]);expect(p.solved).toEqual({});expect(localStorage.getItem(SAVE_KEY)).toBe(raw);writeProgress(p);expect(localStorage.getItem(SAVE_KEY)).toBe(raw);
 });
 it('imports a finished legacy puzzle and retains other completed history',()=>{
  let snapshot=fresh(easy[0].grid);while(snapshot.grid.some(x=>!x))snapshot=applyDeduction(snapshot,deduction(snapshot.grid,snapshot.excluded)!);
  const p=markSolved(emptyProgress(),easy[1].id,{seconds:60,assisted:false});const result=migrateProgress(p,{version:1,puzzleId:easy[0].id,snapshot,seconds:24,assisted:true});
  expect(result.solved[easy[0].id]).toEqual({seconds:24,assisted:true});expect(result.solved[easy[1].id]).toEqual(p.solved[easy[1].id]);
 });
 it('does not mark an invalid completed board solved',()=>{
  const snapshot=fresh(easy[0].grid);snapshot.grid=Array(81).fill(1);const result=migrateProgress(emptyProgress(),{version:1,puzzleId:easy[0].id,snapshot,seconds:1});expect(result.solved).toEqual({});
 });
 it('fallbacks survive corrupt JSON and denied storage',()=>{
  localStorage.setItem(PROGRESS_KEY,'{broken');expect(readProgress()).toEqual(emptyProgress());vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied')});expect(readProgress()).toEqual(emptyProgress());vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied')});expect(writeProgress(emptyProgress())).toBe(false);
 });
 it('does not duplicate starts or mutate existing records',()=>{
  const original=emptyProgress();const next=markStarted(original,easy[0].id);expect(original.started).toEqual([]);expect(markStarted(next,easy[0].id)).toBe(next);expect(markStarted(next,'unknown')).toBe(next);expect(markSolved(next,'unknown',{seconds:10,assisted:false})).toBe(next);
 });
});
describe('filters and no-repeat random selection',()=>{
 it('combines difficulty with all four status filters',()=>{
  const progress=markSolved(markStarted(emptyProgress(),easy[0].id),easy[1].id,{seconds:40,assisted:false});
  expect(filterPuzzles(bank,'easy','all',progress)).toHaveLength(easy.length);expect(filterPuzzles(bank,'easy','solved',progress).map(p=>p.id)).toEqual([easy[1].id]);expect(filterPuzzles(bank,'easy','unsolved',progress)).toHaveLength(easy.length-1);expect(filterPuzzles(bank,'easy','unplayed',progress)).toHaveLength(easy.length-2);expect(filterPuzzles(bank,'hard','solved',progress)).toEqual([]);
 });
 it('always prefers unplayed and never repeats the current puzzle',()=>{
  const pool=easy.slice(0,4);let p=markStarted(markStarted(emptyProgress(),pool[0].id),pool[1].id);p=markSolved(p,pool[2].id,{seconds:1,assisted:false});
  for(const seed of [0,.4,.999])expect(pickRandomPuzzle(pool,pool[0].id,p,()=>seed)?.id).toBe(pool[3].id);
  expect(pickRandomPuzzle([pool[0]],pool[0].id,p)).toBeNull();expect(pickRandomPuzzle([],pool[0].id,p)).toBeNull();
 });
 it('falls back to unfinished then solved puzzles without immediately repeating',()=>{
  const pool=easy.slice(0,3);let p=pool.reduce((acc,v)=>markStarted(acc,v.id),emptyProgress());p=markSolved(p,pool[1].id,{seconds:1,assisted:false});
  expect(pickRandomPuzzle(pool,pool[0].id,p,()=>0)?.id).toBe(pool[2].id);p=markSolved(p,pool[2].id,{seconds:2,assisted:true});expect(pickRandomPuzzle(pool,pool[0].id,p,()=>0)?.id).toBe(pool[1].id);expect(pickRandomPuzzle(pool,pool[0].id,p,()=>.99)?.id).toBe(pool[2].id);
 });
 it('respects the supplied filtered pool, including singleton and random boundaries',()=>{
  const pool=[easy[1]];const p=emptyProgress();for(const n of [0,.99,1,-1,NaN])expect(pickRandomPuzzle(pool,easy[0].id,p,()=>n)?.id).toBe(easy[1].id);
 });
});
