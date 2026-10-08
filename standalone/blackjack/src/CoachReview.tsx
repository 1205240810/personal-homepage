import { useEffect, useRef, useState } from 'react';
import { createCoachWorker } from './coachWorkerClient';
import type { CoachSnapshot, coach } from './solver';
import { handValue } from './engine';
import { suitSymbols } from './PlayingCard';
export type DecisionSnapshot={snapshot:CoachSnapshot;action:'hit'|'stand'};
type Analysis=ReturnType<typeof coach>;
export function CoachReview({snapshots,outcome}:{snapshots:DecisionSnapshot[];outcome:'win'|'loss'|'tie'}){
 const [selected,setSelected]=useState(0);const [started,setStarted]=useState(false);const [result,setResult]=useState<Analysis|null>(null);const [error,setError]=useState('');const cache=useRef(new Map<number,Analysis>());
 useEffect(()=>{
  if(!started||!snapshots[selected])return;
  if(cache.current.has(selected)){setResult(cache.current.get(selected)!);setError('');return;}
  setResult(null);setError('');
  let worker:Worker|null=null;let dispose:(()=>void)|null=null;let alive=true;
  try{const session=createCoachWorker();worker=session.worker;dispose=session.dispose;worker.onmessage=(event:MessageEvent<{result?:Analysis;error?:string}>)=>{if(!alive)return;if(event.data.result){cache.current.set(selected,event.data.result);setResult(event.data.result);}else setError('这一步暂时无法完成分析，请重新选择或稍后再试。');dispose?.();};worker.onerror=()=>{if(alive)setError('浏览器无法启动复盘计算。请用现代浏览器打开，或由网站以允许 Worker 的方式加载。');dispose?.();};worker.postMessage({id:selected,snapshot:snapshots[selected].snapshot});}
  catch{setError('浏览器不支持当前复盘计算方式。游戏本身仍可正常进行。');}
  return()=>{alive=false;dispose?.();};
 },[selected,started,snapshots]);
 const item=snapshots[selected];
 if(!snapshots.length)return <section className="bj-review"><span className="bj-eyebrow">AFTER THE HAND</span><h2>本局无需决策复盘</h2><p>初始天然 21 点已直接结算，你还没有作出要牌或停牌选择。</p></section>;
 const chosenEV=result?(item.action==='hit'?result.hitEV:result.standEV):0;
 const loss=result?Math.max(0,Math.max(result.hitEV,result.standEV)-chosenEV):0;
 return <section className="bj-review" aria-label="赛后教练复盘"><div className="bj-panel-title"><h2>教练复盘 <span>只看当时的信息</span></h2><small>{snapshots.length} 次决策</small></div>{!started?<><p>胜负是结果，决策是过程。回到每次选择之前，看当时怎样打更合理。</p><button className="bj-secondary" onClick={()=>setStarted(true)}>复盘本局 ↗</button></>:<><div className="bj-review-toolbar"><span>选择一步，回到当时</span><button className="bj-quiet" onClick={()=>{setStarted(false);setResult(null);}}>收起复盘 ↑</button></div><div className="bj-review-steps" aria-label="选择复盘步骤">{snapshots.map((_,index)=><button key={index} aria-pressed={selected===index} onClick={()=>{if(index!==selected){setResult(null);setSelected(index);}}}>第 {index+1} 步</button>)}</div><div className="bj-review-observation"><div><small>当时你的手牌</small><b>{item.snapshot.playerCards.map(c=>`${c.rank}${suitSymbols[c.suit]}`).join(' · ')} <em>{handValue(item.snapshot.playerCards).total} 点</em></b></div><div><small>当时庄家明牌</small><b>{item.snapshot.dealerUpcard.rank}{suitSymbols[item.snapshot.dealerUpcard.suit]} <em>暗牌未知</em></b></div><div><small>你的选择</small><b>{item.action==='hit'?'要牌':'停牌'}</b></div></div>{error?<p role="status">{error}</p>:!result?<p className="bj-analysis-loading" role="status">正在按当时可见信息分析…开始新局或关闭教练会取消计算。</p>:<><div className="bj-coach-verdict"><strong>{loss<.005?'这一步，判断合理。':`当时更建议${result.recommendation==='hit'?'要牌':'停牌'}。`}</strong><span>{result.method==='exact-finite'?'精确计算 · 有限单副牌':'近似建议 · 独立抽牌模型'}</span></div><div className="bj-review-metrics"><div className={result.recommendation==='hit'?'bj-metric-best':''}><small>要牌预期得分</small><b>{result.hitEV.toFixed(3)}</b><span className="bj-ev-track" aria-hidden="true"><i style={{width:`${(result.hitEV+1)*50}%`}}/></span></div><div className={result.recommendation==='stand'?'bj-metric-best':''}><small>停牌预期得分</small><b>{result.standEV.toFixed(3)}</b><span className="bj-ev-track" aria-hidden="true"><i style={{width:`${(result.standEV+1)*50}%`}}/></span></div><div><small>下一张爆牌概率</small><b>{(result.bustProbability*100).toFixed(1)}%</b></div></div><p>{loss<.005?(outcome==='loss'?'本局虽然输了，这一步仍接近该模型的最佳选择。合理决策也可能遇到坏运气。':'按该模型，这一步没有明显的预期得分损失。'):`按当时信息和该模型，选择${result.recommendation==='hit'?'要牌':'停牌'}的预计每局得分约高 ${loss.toFixed(3)}。这不是实际少赢的分数。`}</p><p>{result.recommendation==='hit'?'要牌的预期收益已经计入爆牌风险，以及后续继续要牌或停牌的选择。':'停牌保留当前点数，避免立即爆牌；仍须承担庄家追过你的风险。'}{item.snapshot.mode==='strategic'?'策略庄家会看见你的最终点数后选择自己的最佳应对。':'经典庄家的后续行动固定遵守 S17。'}</p><p className="bj-fine-print">胜 +1、平 0、负 −1；比较包含后续合理决策。{result.method==='replacement-model'?'精确计算超出预算，全部指标来自独立抽牌近似；策略模式也近似了庄家策略。实际单副牌不会放回，不能称为真实规则的理论最优。':'在当前规则、可见牌与暗牌未知的条件下，对要牌/停牌进行完整计算。'} 未使用后来揭晓的暗牌或抽牌结果。</p></>}</>}</section>;
}
