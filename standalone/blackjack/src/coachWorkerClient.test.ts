// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi}from'vitest';
vi.mock('./coachWorkerSource',()=>({default:'self.onmessage=()=>self.postMessage({ok:true})'}));
import{createCoachWorker}from'./coachWorkerClient';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('worker resource ownership',()=>{
 it('revokes even if cancelled before startup, and disposal is idempotent',()=>{const revoke=vi.fn();const terminate=vi.fn();vi.stubGlobal('Worker',class{terminate=terminate});Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:test')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});const session=createCoachWorker();session.dispose();session.dispose();expect(terminate).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test');});
 it('revokes URL when worker construction is blocked',()=>{const revoke=vi.fn();vi.stubGlobal('Worker',class{constructor(){throw Error('blocked');}});Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:failed')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});expect(()=>createCoachWorker()).toThrow('blocked');expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:failed');});
});
