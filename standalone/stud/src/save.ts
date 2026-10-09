import { initial, type Game } from './engine';
export const SAVE_KEY='velvet-stud-v1';
export interface SavedGame { game:Game; resumed:boolean }
const integer=(n:unknown,min=0,max=1000):n is number=>Number.isInteger(n)&&Number(n)>=min&&Number(n)<=max;
const pair=(v:unknown,check:(n:unknown)=>boolean):v is [number,number]=>Array.isArray(v)&&v.length===2&&v.every(n=>check(n));
/** Treat storage as untrusted. A malformed snapshot must never reach the engine. */
export function validGame(x:unknown):x is Game {
 if(!x||typeof x!=='object')return false;
 const g=x as Game;
 if(!integer(g.revision,0,1000000)||!integer(g.hand,0,10)||!integer(g.dealer,0,1)||!integer(g.turn,0,1)||!integer(g.street,0,4)||!integer(g.minRaise,1)||!integer(g.pot)||!integer(g.lastPot))return false;
 if(!pair(g.stacks,integer)||!pair(g.startStacks,integer)||!pair(g.paid,integer)||g.startStacks[0]+g.startStacks[1]!==1000||g.stacks[0]+g.stacks[1]+g.pot!==1000||g.paid[0]+g.paid[1]>g.pot)return false;
 if(!Array.isArray(g.acted)||g.acted.length!==2||g.acted.some(v=>typeof v!=='boolean')||typeof g.revealed!=='boolean'||![null,0,1,'tie'].includes(g.winner)||typeof g.message!=='string'||g.message.length>500)return false;
 if(!Array.isArray(g.logs)||g.logs.length>1000||g.logs.some(s=>typeof s!=='string'||s.length>500)||!Array.isArray(g.reviews)||g.reviews.length>1000||g.reviews.some(r=>!r||!integer(r.seat,0,1)||!integer(r.street,1,4)||typeof r.action!=='string'||r.action.length>100||typeof r.reason!=='string'||r.reason.length>1000||!Number.isFinite(r.equity)||r.equity<0||r.equity>1||!Number.isFinite(r.odds)||r.odds<0||r.odds>1))return false;
 if(!Array.isArray(g.cards)||g.cards.length!==2||g.cards.some(a=>!Array.isArray(a))||!Array.isArray(g.deck))return false;
 const all=[...g.cards[0],...g.cards[1],...g.deck];
 if(all.some(c=>!integer(c,0,51))||new Set(all).size!==all.length)return false;
 if(g.phase==='ready')return all.length===0&&g.street===0&&g.pot===0&&g.winner===null&&!g.revealed&&g.stacks.every((n,i)=>n===g.startStacks[i])&&g.paid.every(n=>n===0);
 if(!['betting','dealing','runout','complete'].includes(g.phase)||g.hand===0||all.length!==52||g.cards[0].length!==g.cards[1].length||g.cards[0].length!==g.street+1||g.street<1)return false;
 if(g.phase==='complete')return g.pot===0&&g.winner!==null&&(!g.revealed||g.cards[0].length===5);
 if(g.pot===0||g.winner!==null||g.revealed||g.startStacks.some((s,i)=>g.stacks[i]>s)||g.paid.some((p,i)=>p>g.startStacks[i]-g.stacks[i]))return false;
 if(g.phase==='dealing'&&(g.street===4||g.paid[0]!==g.paid[1]||!g.acted.every(Boolean)))return false;
 if(g.phase==='betting'&&g.acted[g.turn])return false;
 if(g.phase==='runout'&&(g.street===4||g.paid[0]!==g.paid[1]||!g.stacks.some(s=>s===0)))return false;
 return Math.max(...g.paid)<=Math.min(g.paid[0]+g.stacks[0],g.paid[1]+g.stacks[1]);
}
export function loadGame(persist:boolean):SavedGame {
 const fallback={game:initial(),resumed:false};if(!persist)return fallback;
 try {const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
  if(s?.v===2&&validGame(s.game))return {game:s.game,resumed:!['ready','complete'].includes(s.game.phase)};
  if(s?.v===1&&pair(s.stacks,integer)&&s.stacks[0]+s.stacks[1]===1000&&integer(s.hand,0,10))return {game:initial(s.stacks,s.hand),resumed:false};
 }catch{}return fallback;
}
export function saveGame(game:Game):boolean {try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:2,game}));return true}catch{return false}}
