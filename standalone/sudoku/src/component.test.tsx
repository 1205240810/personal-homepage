// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,within,act} from '@testing-library/react';
import SudokuGame from './SudokuGame';
import {PROGRESS_KEY,SAVE_KEY} from './storage';
import {emptyProgress,markSolved,markStarted} from './progress';
import bank from './puzzles.json';
import {applyDeduction,candidates,countSolutions,deduction,fresh} from './logic';
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();vi.restoreAllMocks()});
function empty(container:HTMLElement){return container.querySelector<HTMLButtonElement>('.sg-cell.sg-entered')!}
function revealHint(){fireEvent.click(screen.getByRole('button',{name:/再提示一点/}));fireEvent.click(screen.getByRole('button',{name:/看完整推理/}));}
describe('component regression',()=>{
 it('renders 81 accessible cells and muted separate audio controls',()=>{const {container}=render(<SudokuGame persist={false}/>);expect(container.querySelectorAll('.sg-cell')).toHaveLength(81);expect(screen.getByRole('button',{name:'背景音乐 已关'}).getAttribute('aria-pressed')).toBe('false');expect(screen.getByRole('button',{name:'操作音效 已关'}).getAttribute('aria-pressed')).toBe('false')});
 it('touch input, erase, undo and redo are reversible',()=>{const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 1'}));expect(c.textContent).toBe('1');fireEvent.click(screen.getByRole('button',{name:/撤销/}));expect(c.textContent).toBe('');fireEvent.click(screen.getByRole('button',{name:/重做/}));expect(c.textContent).toBe('1');fireEvent.click(screen.getByRole('button',{name:/擦除/}));expect(c.textContent).toBe('')});
 it('pencil mode records notes rather than values',()=>{const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:/笔记 关/}));fireEvent.click(screen.getByRole('button',{name:'填入 3'}));expect(c.querySelector('.sg-notes')?.textContent).toBe('3');fireEvent.click(screen.getByRole('button',{name:'填入 3'}));expect(c.textContent).toBe('')});
 it('coach never fills before explicit application',()=>{const {container}=render(<SudokuGame persist={false}/>);const before=container.querySelectorAll('.sg-cell.sg-entered');expect([...before].every(x=>x.querySelector('.sg-notes'))).toBe(true);revealHint();fireEvent.click(screen.getByRole('button',{name:/应用这一步/}));expect([...before].some(x=>!x.querySelector('.sg-notes'))).toBe(true)});
 it('keyboard is scoped by default and arrow movement focuses the next cell',()=>{const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.keyDown(window,{key:'4'});expect(c.textContent).toBe('');fireEvent.keyDown(c,{key:'4'});expect(c.textContent).toBe('4');const i=Number(c.dataset.cell);fireEvent.keyDown(c,{key:'ArrowRight'});expect(document.activeElement).toBe(container.querySelector(`[data-cell="${i+1}"]`))});
 it('pause blocks entry, hides board, and pauses timer',()=>{vi.useFakeTimers();const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'暂停游戏'}));expect(screen.getByRole('button',{name:'填入 1'}).hasAttribute('disabled')).toBe(true);fireEvent.keyDown(c,{key:'1'});expect(c.textContent).toBe('');expect(container.querySelector('.sg-board')?.getAttribute('aria-hidden')).toBe('true');fireEvent.click(screen.getByRole('button',{name:'继续练习'}));expect(screen.getByRole('button',{name:'填入 1'}).hasAttribute('disabled')).toBe(false)});
 it('new puzzle modal can cancel without losing progress and traps focus',()=>{const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 2'}));const trigger=screen.getByRole('button',{name:/开启新一局/});trigger.focus();fireEvent.click(trigger);const dialog=screen.getByRole('dialog');expect(container.querySelector('.sg-shell')?.hasAttribute('inert')).toBe(true);const start=within(dialog).getByRole('button',{name:/随机一题/});start.focus();fireEvent.keyDown(start,{key:'Tab'});expect(document.activeElement).toBe(within(dialog).getByRole('combobox',{name:'练习难度'}));fireEvent.click(within(dialog).getByRole('button',{name:'保留当前'}));expect(c.textContent).toBe('2');expect(document.activeElement).toBe(trigger)});
 it('new game replaces old progress and allows chosen difficulty',()=>{render(<SudokuGame persist={false}/>);fireEvent.click(screen.getByRole('button',{name:/开启新一局/}));fireEvent.change(screen.getByRole('combobox',{name:'练习难度'}),{target:{value:'hard'}});fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));expect(document.querySelector('.sg-level')?.textContent).toContain('挑战')});
 it('persists user input and resumes on remount',()=>{const r=render(<SudokuGame/>);const c=empty(r.container),index=c.dataset.cell;fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 4'}));r.unmount();render(<SudokuGame/>);expect(document.querySelector(`[data-cell="${index}"]`)?.textContent).toBe('4');expect(screen.getByText('已恢复上次的练习。')).toBeDefined()});
 it('finishing then undo-redo calls onComplete only once per puzzle',()=>{const p=bank.find(p=>p.difficulty==='easy')!;let s=fresh(p.grid);while(s.grid.filter(x=>!x).length>1)s=applyDeduction(s,deduction(s.grid,s.excluded)!);localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,puzzleId:p.id,snapshot:s,seconds:20}));const onComplete=vi.fn();render(<SudokuGame onComplete={onComplete}/>);revealHint();fireEvent.click(screen.getByRole('button',{name:/应用这一步/}));expect(onComplete).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:/撤销/}));fireEvent.click(screen.getByRole('button',{name:/重做/}));expect(onComplete).toHaveBeenCalledTimes(1)});
 it('nonconflicting wrong entry stops coach with an explicit no-solution explanation',()=>{const p=bank[0];const cs=candidates(p.grid);let wrong=fresh(p.grid),found=false;for(let i=0;i<81&&!found;i++)for(const d of cs[i]){const trial=[...p.grid];trial[i]=d;if(countSolutions(trial,1)===0){wrong.grid=trial;found=true;break}}expect(found).toBe(true);localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,puzzleId:p.id,snapshot:wrong,seconds:0}));render(<SudokuGame/>);expect(screen.getByText('没有重复，也可能走偏。')).toBeDefined();expect(screen.queryByRole('button',{name:/应用这一步/})).toBeNull()});
 it('restored coached game retains assisted completion metadata',()=>{const p=bank.find(p=>p.difficulty==='easy')!;let s=fresh(p.grid);while(s.grid.filter(x=>!x).length>1)s=applyDeduction(s,deduction(s.grid,s.excluded)!);const d=deduction(s.grid,s.excluded)!;localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,puzzleId:p.id,snapshot:s,seconds:20,assisted:true}));const onComplete=vi.fn();const {container}=render(<SudokuGame onComplete={onComplete}/>);fireEvent.click(container.querySelector(`[data-cell="${d.target}"]`)!);fireEvent.click(screen.getByRole('button',{name:`填入 ${d.digit}`}));expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({assisted:true}))});
 it('malformed save does not crash and persist false avoids writes',()=>{localStorage.setItem(SAVE_KEY,'{bad');const spy=vi.spyOn(Storage.prototype,'setItem');render(<SudokuGame persist={false}/>);expect(spy).not.toHaveBeenCalled();spy.mockRestore()});
});

function openLibrary(){fireEvent.click(screen.getByRole('button',{name:/开启新一局/}));return screen.getByRole('dialog')}
function choosePuzzle(id:string){fireEvent.click(screen.getByRole('button',{name:new RegExp(`题 ${id.toUpperCase()}，`)}));}
function currentId(){return document.querySelector('.sg-puzzle-id')?.textContent?.trim().replace('/ ','').toLowerCase()}
const easy=bank.filter(p=>p.difficulty==='easy');
describe('puzzle library navigation',()=>{
 it('shows every puzzle in the selected level, stable indexes and overall count',()=>{
  render(<SudokuGame persist={false}/>);const dialog=openLibrary();
  expect(within(dialog).getByText(`共 ${bank.length} 道题，已完成 0 道。选一道慢慢想，或交给随机。`)).toBeDefined();
  expect(within(within(dialog).getByRole('group',{name:'选择题目'})).getAllByRole('button')).toHaveLength(easy.length);
  expect(document.querySelector('.sg-puzzle-position')?.textContent).toBe(`1 / ${easy.length}`);
  choosePuzzle(easy[easy.length-1].id);expect(screen.getByText(`入门第 ${easy.length} / ${easy.length} 题 · ${easy[easy.length-1].id.toUpperCase()}`)).toBeDefined();
  fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));expect(currentId()).toBe(easy[easy.length-1].id);
  expect(document.querySelector('.sg-puzzle-position')?.textContent).toBe(`${easy.length} / ${easy.length}`);
 });
 it('requires explicit confirmation before replacing entries, and cancellation preserves them',()=>{
  const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 2'}));
  const trigger=screen.getByRole('button',{name:/开启新一局/});trigger.focus();openLibrary();choosePuzzle(easy[1].id);fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));
  expect(screen.getByRole('dialog',{name:'要换一张题目吗？'})).toBeDefined();expect(currentId()).toBe(easy[0].id);expect(c.textContent).toBe('2');
  fireEvent.keyDown(screen.getByRole('button',{name:'返回题库'}),{key:'Escape'});expect(screen.getByRole('dialog',{name:'下一格，由你选择。'})).toBeDefined();
  fireEvent.click(screen.getByRole('button',{name:'保留当前'}));expect(c.textContent).toBe('2');expect(document.activeElement).toBe(trigger);
  openLibrary();choosePuzzle(easy[1].id);fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));fireEvent.click(screen.getByRole('button',{name:'确认换题'}));
  expect(currentId()).toBe(easy[1].id);expect(container.querySelectorAll('.sg-entered .sg-notes')).toHaveLength(81-easy[1].clues);expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('protects notes and elapsed time too, and pauses time throughout the picker and confirmation',()=>{
  vi.useFakeTimers();const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:/笔记 关/}));fireEvent.click(screen.getByRole('button',{name:'填入 3'}));
  act(()=>{vi.advanceTimersByTime(2000)});expect(screen.getByLabelText('已用时间').textContent).toBe('00:02');
  openLibrary();act(()=>{vi.advanceTimersByTime(5000)});choosePuzzle(easy[1].id);fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));act(()=>{vi.advanceTimersByTime(5000)});
  expect(screen.getByRole('button',{name:'确认换题'})).toBeDefined();expect(screen.getByLabelText('已用时间').textContent).toBe('00:02');expect(c.textContent).toBe('3');
  fireEvent.click(screen.getByRole('button',{name:'返回题库'}));fireEvent.click(screen.getByRole('button',{name:'保留当前'}));act(()=>{vi.advanceTimersByTime(1000)});expect(screen.getByLabelText('已用时间').textContent).toBe('00:03');
 });
 it('random skips the current and previously opened puzzles while untouched choices remain',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0);render(<SudokuGame persist={false}/>);expect(currentId()).toBe(easy[0].id);
  openLibrary();fireEvent.click(screen.getByRole('button',{name:/随机一题/}));expect(currentId()).toBe(easy[1].id);
  openLibrary();fireEvent.click(screen.getByRole('button',{name:/随机一题/}));expect(currentId()).toBe(easy[2].id);
 });
 it('filters solved, unfinished and unplayed records independently of difficulty',()=>{
  const hard=bank.filter(p=>p.difficulty==='hard');const progress=markSolved(markSolved(markStarted(emptyProgress(),easy[2].id),easy[1].id,{seconds:42,assisted:false}),hard[0].id,{seconds:60,assisted:true});
  localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));render(<SudokuGame/>);openLibrary();
  const status=screen.getByRole('combobox',{name:'完成状态'});fireEvent.change(status,{target:{value:'solved'}});
  let tiles=within(screen.getByRole('group',{name:'选择题目'})).getAllByRole('button');expect(tiles).toHaveLength(1);expect(tiles[0].getAttribute('aria-label')).toContain(easy[1].id.toUpperCase());
  fireEvent.change(status,{target:{value:'unsolved'}});expect(within(screen.getByRole('group',{name:'选择题目'})).getAllByRole('button')).toHaveLength(easy.length-1);
  fireEvent.change(status,{target:{value:'unplayed'}});expect(within(screen.getByRole('group',{name:'选择题目'})).getAllByRole('button')).toHaveLength(easy.length-3);
  fireEvent.change(status,{target:{value:'solved'}});fireEvent.change(screen.getByRole('combobox',{name:'练习难度'}),{target:{value:'hard'}});tiles=within(screen.getByRole('group',{name:'选择题目'})).getAllByRole('button');expect(tiles).toHaveLength(1);expect(tiles[0].getAttribute('aria-label')).toContain(hard[0].id.toUpperCase());
 });
 it('handles an empty filter and prevents restarting the current board by accident',()=>{
  render(<SudokuGame persist={false}/>);openLibrary();expect(screen.getByRole('button',{name:'正在练习'}).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByRole('combobox',{name:'完成状态'}),{target:{value:'solved'}});expect(screen.getByText('这里暂时没有题目，换一个筛选条件试试。')).toBeDefined();
  expect(screen.getByRole('button',{name:'开始这道题'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:/随机一题/}).hasAttribute('disabled')).toBe(true);
 });
 it('migrates legacy current progress, records completion, and keeps records after switching and remounting',()=>{
  const p=easy[0];let s=fresh(p.grid);while(s.grid.filter(x=>!x).length>1)s=applyDeduction(s,deduction(s.grid,s.excluded)!);
  localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,puzzleId:p.id,snapshot:s,seconds:24,assisted:true}));const r=render(<SudokuGame/>);
  expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!).started).toContain(p.id);revealHint();fireEvent.click(screen.getByRole('button',{name:/应用这一步/}));
  expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!).solved[p.id]).toEqual({seconds:24,assisted:true});
  openLibrary();choosePuzzle(easy[1].id);fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));expect(screen.queryByRole('button',{name:'确认换题'})).toBeNull();r.unmount();render(<SudokuGame/>);
  expect(currentId()).toBe(easy[1].id);openLibrary();fireEvent.change(screen.getByRole('combobox',{name:'完成状态'}),{target:{value:'solved'}});expect(screen.getByRole('button',{name:new RegExp(`${p.id.toUpperCase()}，已完成`)})).toBeDefined();
 });
 it('preserves the coach toggle and separate audio controls across a puzzle switch',()=>{
  render(<SudokuGame persist={false}/>);fireEvent.click(screen.getByRole('switch',{name:'实时教练'}));openLibrary();choosePuzzle(easy[1].id);fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));
  expect(screen.getByRole('switch',{name:'实时教练'}).getAttribute('aria-checked')).toBe('false');expect(screen.getByText('留给你独立思考。')).toBeDefined();
  expect(screen.getByRole('button',{name:'背景音乐 已关'})).toBeDefined();expect(screen.getByRole('slider',{name:'音乐音量'})).toBeDefined();expect(screen.getByRole('button',{name:'操作音效 已关'})).toBeDefined();
 });
});
describe('input and storage edge cases',()=>{
 it('no-op erases and repeated digits neither consume undo nor destroy redo',()=>{
  const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:/擦除/}));expect(screen.getByRole('button',{name:/撤销/}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'填入 4'}));fireEvent.click(screen.getByRole('button',{name:'填入 4'}));fireEvent.click(screen.getByRole('button',{name:/撤销/}));expect(c.textContent).toBe('');
  fireEvent.click(screen.getByRole('button',{name:/擦除/}));expect(screen.getByRole('button',{name:/重做/}).hasAttribute('disabled')).toBe(false);fireEvent.click(screen.getByRole('button',{name:/重做/}));expect(c.textContent).toBe('4');
 });
 it('arrow navigation stays on its row or column at board edges and ignores browser shortcuts',()=>{
  const {container}=render(<SudokuGame persist={false}/>);const topRight=container.querySelector<HTMLButtonElement>('[data-cell="8"]')!;fireEvent.click(topRight);topRight.focus();
  fireEvent.keyDown(topRight,{key:'ArrowRight'});expect(document.activeElement).toBe(topRight);fireEvent.keyDown(topRight,{key:'ArrowUp'});expect(document.activeElement).toBe(topRight);
  fireEvent.keyDown(topRight,{key:'ArrowDown'});expect(document.activeElement).toBe(container.querySelector('[data-cell="17"]'));
  const c=empty(container);fireEvent.click(c);fireEvent.keyDown(c,{key:'1',ctrlKey:true});expect(c.textContent).toBe('');
 });
 it('unavailable storage reports an honest warning without blocking play',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage denied')});const {container}=render(<SudokuGame/>);expect(screen.getByText('浏览器阻止了保存，请勿关闭本页')).toBeDefined();const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 1'}));expect(c.textContent).toBe('1');
 });
 it('held number and N keys do not repeatedly toggle pencil state, while held arrows still navigate',()=>{
  const {container}=render(<SudokuGame persist={false}/>);const c=empty(container);fireEvent.click(c);fireEvent.keyDown(c,{key:'n'});fireEvent.keyDown(c,{key:'n',repeat:true});expect(screen.getByRole('button',{name:/笔记 开/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(c,{key:'3'});fireEvent.keyDown(c,{key:'3',repeat:true});expect(c.querySelector('.sg-notes')?.textContent).toBe('3');const i=Number(c.dataset.cell);fireEvent.keyDown(c,{key:'ArrowDown',repeat:true});expect(document.activeElement).toBe(container.querySelector(`[data-cell="${i+9}"]`));
 });
 it('preserves modifier-arrow browser shortcuts and exposes the host exit callback',()=>{
  const onExit=vi.fn();const {container}=render(<SudokuGame persist={false} onExit={onExit}/>);const c=empty(container);fireEvent.click(c);c.focus();fireEvent.keyDown(c,{key:'ArrowDown',metaKey:true});expect(document.activeElement).toBe(c);fireEvent.click(screen.getByRole('button',{name:'退出'}));expect(onExit).toHaveBeenCalledTimes(1);
 });
});
describe('staged coach and first-entry clock',()=>{
 it('coach reveals direction, then target, then the answer, and starts over for the next step',()=>{const {container}=render(<SudokuGame persist={false}/>);expect(screen.getByText('先看方向。')).toBeDefined();expect(container.querySelector('.sg-hint-unit')).not.toBeNull();expect(container.querySelector('.sg-hint-target')).toBeNull();expect(screen.queryByRole('button',{name:/应用这一步/})).toBeNull();fireEvent.click(screen.getByRole('button',{name:/再提示一点/}));expect(container.querySelector('.sg-hint-target')).not.toBeNull();expect(screen.queryByRole('button',{name:/应用这一步/})).toBeNull();fireEvent.click(screen.getByRole('button',{name:/看完整推理/}));fireEvent.click(screen.getByRole('button',{name:/应用这一步/}));expect(screen.getByText('先看方向。')).toBeDefined();expect(container.querySelector('.sg-hint-target')).toBeNull()});
 it('the clock waits for the first entry',()=>{vi.useFakeTimers();const {container}=render(<SudokuGame persist={false}/>);act(()=>{vi.advanceTimersByTime(5000)});expect(screen.getByLabelText('已用时间').textContent).toMatch(/^0+:00$/);const c=empty(container);fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'填入 1'}));act(()=>{vi.advanceTimersByTime(3000)});expect(screen.getByLabelText('已用时间').textContent).toMatch(/0:03$/)});
 it.each(['entry','note','undo'])('resumes after %s before the first timer tick',mode=>{
  vi.useFakeTimers();const view=render(<SudokuGame/>);fireEvent.click(empty(view.container));
  if(mode==='note')fireEvent.click(screen.getByRole('button',{name:/笔记 关/}));
  fireEvent.click(screen.getByRole('button',{name:'填入 1'}));
  if(mode==='undo')fireEvent.click(screen.getByRole('button',{name:/撤销/}));
  expect(screen.getByLabelText('已用时间').textContent).toBe('00:00');view.unmount();render(<SudokuGame/>);
  act(()=>{vi.advanceTimersByTime(3000)});expect(screen.getByLabelText('已用时间').textContent).toBe('00:03');
 });
 it('keeps an untouched restored board clock stopped',()=>{
  vi.useFakeTimers();const view=render(<SudokuGame/>);view.unmount();render(<SudokuGame/>);
  act(()=>{vi.advanceTimersByTime(3000)});expect(screen.getByLabelText('已用时间').textContent).toBe('00:00');
 });
 it('waits for a new entry after changing puzzles',()=>{
  vi.useFakeTimers();const {container}=render(<SudokuGame/>);fireEvent.click(empty(container));fireEvent.click(screen.getByRole('button',{name:'填入 1'}));
  act(()=>{vi.advanceTimersByTime(2000)});fireEvent.click(screen.getByRole('button',{name:/开启新一局/}));
  fireEvent.change(screen.getByRole('combobox',{name:'练习难度'}),{target:{value:'hard'}});fireEvent.click(screen.getByRole('button',{name:'开始这道题'}));fireEvent.click(screen.getByRole('button',{name:'确认换题'}));
  act(()=>{vi.advanceTimersByTime(3000)});expect(screen.getByLabelText('已用时间').textContent).toBe('00:00');
 });
});
