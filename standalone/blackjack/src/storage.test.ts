import {describe,it,expect} from 'vitest';import{readSaved,save,emptySaved}from'./storage';
describe('versioned mode storage',()=>{
 it('survives denial and corruption',()=>{expect(readSaved({getItem:()=>{throw Error();}})).toEqual(emptySaved());expect(readSaved({getItem:()=>'{bad'})).toEqual(emptySaved());expect(save(emptySaved(),{setItem:()=>{throw Error();}})).toBe(false);});
 it('round trips distinct mode scores and settings',()=>{let raw='';const data=emptySaved();data.stats.classic.wins=3;data.stats.strategic.losses=4;data.settings.coach=true;expect(save(data,{setItem:(_,v)=>{raw=v;}})).toBe(true);expect(readSaved({getItem:()=>raw})).toEqual(data);});
 it('does not mix old simultaneous game scores into new modes',()=>{const value=readSaved({getItem:key=>key==='twenty-one:v1'?JSON.stringify({version:1,stats:{wins:5,losses:2,ties:1}}):null});expect(value.stats.classic.wins).toBe(0);expect(value.stats.strategic.wins).toBe(0);expect(value.legacy?.wins).toBe(5);});
 it('rejects invalid counters and unknown versions',()=>{expect(readSaved({getItem:()=>JSON.stringify({version:2,stats:{classic:{wins:-2,losses:0,ties:0}}})}).stats.classic.wins).toBe(0);expect(readSaved({getItem:()=>JSON.stringify({version:5})})).toEqual(emptySaved());});
});
