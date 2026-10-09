'use client';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { handValue, type Card } from './engine';
import { initialStandardGame, legalStandardActions, standardObservation, standardReducer } from './standardGame';
import { analyzeStandardDecision } from './standardSolver';
import type { StandardAction, StandardAdvice, StandardDecision } from './standardTypes';
import { PlayingCard } from './PlayingCard';
import './theme.css';
import './standard-theme.css';

export interface StandardBlackjackGameProps { onExit?: () => void; persist?: boolean; className?: string; onBusyChange?: (busy: boolean) => void }
export const STANDARD_SAVE_KEY = 'twenty-one:standard:v1';
type Saved = { version: 1; bankroll: number; settings: { initialBankroll: number; bet: number; sound: boolean; coach: boolean }; stats: { rounds: number; wins: number; losses: number; pushes: number; surrenders: number }; tutorialDone: boolean };
const emptySaved = (): Saved => ({ version: 1, bankroll: 1000, settings: { initialBankroll: 1000, bet: 20, sound: false, coach: true }, stats: { rounds: 0, wins: 0, losses: 0, pushes: 0, surrenders: 0 }, tutorialDone: false });
const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export function readStandardSaved(): Saved {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STANDARD_SAVE_KEY) || 'null');
    if (!value || typeof value !== 'object') return emptySaved();
    const s = value as Saved;
    if (s.version !== 1 || !s.settings || !s.stats || !integer(s.bankroll, 0, 100_000_000) || !integer(s.settings.initialBankroll, 100, 1_000_000) || s.settings.initialBankroll % 2 || !integer(s.settings.bet, 2, 1_000_000) || s.settings.bet % 2 || typeof s.settings.sound !== 'boolean' || typeof s.settings.coach !== 'boolean' || typeof s.tutorialDone !== 'boolean' || !['rounds', 'wins', 'losses', 'pushes', 'surrenders'].every(key => integer(s.stats[key as keyof Saved['stats']], 0, 10_000_000))) return emptySaved();
    return { version: 1, bankroll: s.bankroll, settings: { initialBankroll: s.settings.initialBankroll, bet: s.settings.bet, sound: s.settings.sound, coach: s.settings.coach }, stats: { rounds: s.stats.rounds, wins: s.stats.wins, losses: s.stats.losses, pushes: s.stats.pushes, surrenders: s.stats.surrenders }, tutorialDone: s.tutorialDone };
  } catch { return emptySaved(); }
}
const names: Record<StandardAction, string> = { hit: '要牌', stand: '停牌', double: '加倍', split: '分牌', surrender: '投降', insurance: '买保险', declineInsurance: '不买保险' };
const hints: Record<StandardAction, string> = { hit: '再拿一张', stand: '保留当前点数', double: '追加本手下注，只拿一张', split: '拆成两手，追加等额下注', surrender: '退回一半下注', insurance: '另下半注，押庄家天然 21', declineInsurance: '继续原来的这手牌' };
const keys: Partial<Record<StandardAction, string>> = { hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' };
const chips = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${chips(Math.abs(value))}`;
const sample = (rank: Card['rank'], i: number): Card => ({ id: `tutorial-${i}`, rank, suit: i % 2 ? 'hearts' : 'spades' });
const tutorials = [
  { title: '先认识点数', cards: [sample('A', 0), sample('6', 1)], text: '2 到 10 按牌面计点，J / Q / K 都是 10。A 可以是 1 或 11，系统自动取不爆牌的最大值。A + 6 是软 17，继续拿牌时 A 可以退回 1。', question: 'A + 6 再拿一张 9，现在多少点？', options: ['26 点，爆牌', '16 点，仍可继续'], correct: 1, answer: 'A 从 11 变成 1，所以是 1 + 6 + 9 = 16。软点数给了你一次缓冲。' },
  { title: '胜负与天然 21', cards: [sample('A', 2), sample('K', 3)], text: '普通胜局净赚本手下注，平局退回下注。只有最初未分牌的 A + 十点牌才是天然 Blackjack，净赚下注的 1.5 倍；分牌后拿到 21 仍按普通胜局结算。', question: '下注 20，天然 Blackjack 赢了，净赚多少？', options: ['20', '30', '50'], correct: 1, answer: '净赚 30，另退回原下注 20，共返还 50。净收益和返还金额不是一回事。' },
  { title: '加倍只有一张机会', cards: [sample('5', 4), sample('6', 5)], text: '初始两张牌时可以加倍：再投入与本手下注相同的筹码，只拿一张牌后自动停牌。11 点对庄家弱明牌常是值得考虑的机会，但它不是随时追加下注。', question: '加倍拿到一张 2，还能继续要牌吗？', options: ['可以，直到我停牌', '不可以，自动停牌'], correct: 1, answer: '不可以。加倍的代价是放弃后续要牌权，所以要比较整手的期望收益。' },
  { title: '把一对拆成两手', cards: [sample('8', 6), sample('8', 7)], text: '初始两张点值相同的牌可分成两手，另付等额下注，依次操作。本桌最多四手，分牌后可加倍；A 只能分一次，每手仅补一张牌后停牌。', question: '一对 8 分牌后，原来的下注 20 会怎样？', options: ['两手各下注 10', '两手各下注 20，需要再付 20'], correct: 1, answer: '两手各 20，合计投入 40。分牌让你从一手 16 变成两个独立的起点，也增加了资金暴露。' },
  { title: '投降与保险', cards: [sample('10', 8), sample('6', 9)], text: '庄家已排除天然 Blackjack 后，初始未分牌手可以迟投降，拿回一半下注。庄家亮 A 时可另付半注买保险；庄家有天然 Blackjack 才赔保险 2:1，否则保险全输。保险不会保护普通输牌。', question: '不知道暗牌时，基本策略通常建议买保险吗？', options: ['建议买，看起来更安全', '通常不买'], correct: 1, answer: '通常不买。六副牌初始频率下，庄家暗牌是十点牌的概率不足 1/3，保险的预期净收益为负。' },
  { title: '把注意力放在选择上', cards: [sample('9', 10), sample('7', 11)], text: '标准庄家不到 17 必须要牌，所有 17 及以上必须停牌，包括软 17。它不根据你的点数改变行动。每局重新洗六副牌，教练只在赛后读取当时可见信息，对比每个合法选项。', question: '做了教练推荐的选择，却输掉这一局，说明什么？', options: ['这一步一定错了', '好选择也可能遇到坏结果'], correct: 1, answer: '一次结果不证明策略对错。练习时关注长期的预期筹码收益，而不是追求每局都赢。' },
];

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
    controls()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const all = controls();
      if (!all.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === all[0]) { event.preventDefault(); all.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === all.at(-1)) { event.preventDefault(); all[0].focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); if (previous?.isConnected && !previous.matches(':disabled')) previous.focus(); };
  }, [onClose]);
  return <div className="bj-dialog-backdrop sbj-backdrop"><section ref={ref} className="sbj-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="sbj-quiet" onClick={onClose}>关闭 ×</button></header>{children}</section></div>;
}

function Review({ decisions }: { decisions: StandardDecision[] }) {
  const [selected, setSelected] = useState(0);
  const [advice, setAdvice] = useState<StandardAdvice | null>(null);
  const [failed, setFailed] = useState(false);
  const decision = decisions[selected];
  useEffect(() => {
    setAdvice(null); setFailed(false);
    if (!decision) return;
    let live = true;
    const timer = setTimeout(() => { try { const result = analyzeStandardDecision(decision.observation); if (live) setAdvice(result); } catch { if (live) setFailed(true); } }, 25);
    return () => { live = false; clearTimeout(timer); };
  }, [decision]);
  if (!decision) return <section className="sbj-review"><h2>这局没有需要复盘的选择</h2><p>天然 Blackjack 或庄家初始 Blackjack 已直接结算。</p></section>;
  const best = advice?.values[advice.bestAction];
  const actual = advice?.values[decision.action];
  const loss = best !== undefined && actual !== undefined ? Math.max(0, best - actual) * decision.observation.wager : null;
  const value = handValue(decision.observation.cards);
  return <section className="sbj-review" aria-label="标准规则赛后教练"><div className="sbj-section-heading"><div><h2>回看每一次选择</h2><p>教练只知道你当时看到的牌，不读取庄家暗牌或未来牌序。</p></div><span>赛后教练</span></div><div className="sbj-review-steps" aria-label="选择复盘步骤">{decisions.map((item, index) => <button key={index} aria-pressed={index === selected} onClick={() => setSelected(index)}>第 {index + 1} 步 · {names[item.action]}</button>)}</div><div className="sbj-review-context"><span>第 {decision.handId + 1} 手 · {value.soft ? '软' : '硬'} {value.total}</span><span>庄家明牌 {decision.observation.dealerUpcard.rank}</span><span>本手下注 {chips(decision.observation.wager)}</span></div>{!advice ? <p role="status">{failed ? '这一步暂时无法计算，请切换步骤后重试。' : '正在比较合法选项的预期收益…'}</p> : <><p className="sbj-approximation">独立抽牌近似 · 预期收益不等于胜率</p><div className="sbj-verdict"><div><small>建议选择</small><strong>{names[advice.bestAction]}</strong></div><div><small>你的选择</small><strong>{names[decision.action]}</strong></div><div><small>估计收益差</small><strong>{loss === null ? '暂不可用' : `${chips(loss)} 筹码`}</strong></div></div><div className="sbj-ev-list">{decision.observation.legalActions.map(action => <div key={action} className={action === advice.bestAction ? 'sbj-best' : ''}><span>{names[action]} {action === decision.action && <small>你选了</small>}{action === advice.bestAction && <small>建议</small>}</span><b>{advice.values[action] === undefined ? '暂不可用' : `${signed(advice.values[action]! * decision.observation.wager)} 筹码`}</b></div>)}</div><p className="sbj-explanation-label">为什么这样选</p>{advice.explanation.map((text, index) => <p key={index}>{text}</p>)}<details className="sbj-model-notes"><summary>计算方法与边界</summary><p>{advice.method}</p>{advice.warnings.map((text, index) => <p key={index}>{text}</p>)}<p>数值是从本次决策开始的预期净收益，包含加倍和分牌的追加投入；不是这局的中奖概率。显示的收益差为模型估计，实际结果仍有随机性。</p></details></>}</section>;
}

export function StandardBlackjackGame({ onExit, persist = true, className = '', onBusyChange }: StandardBlackjackGameProps) {
  const [saved, setSaved] = useState<Saved>(() => persist ? readStandardSaved() : emptySaved());
  const [game, dispatch] = useReducer(standardReducer, saved, value => initialStandardGame({ initialBankroll: value.settings.initialBankroll, bankroll: value.bankroll, bet: value.settings.bet }));
  const [paused, setPaused] = useState(false);
  const [dialog, setDialog] = useState<'settings' | 'tutorial' | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialAnswer, setTutorialAnswer] = useState<number | null>(null);
  const [betInput, setBetInput] = useState(String(saved.settings.bet));
  const [bankrollInput, setBankrollInput] = useState(String(saved.settings.initialBankroll));
  const [resetConfirm, setResetConfirm] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [inputReady, setInputReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [decisions, setDecisions] = useState<StandardDecision[]>([]);
  const [viewedHand, setViewedHand] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const actionLock = useRef(false);
  const completed = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const active = !['ready', 'settled'].includes(game.phase);
  const settled = game.phase === 'settled';
  const legal = legalStandardActions(game);
  const blocked = paused || !!dialog;
  const totalWager = game.hands.reduce((sum, hand) => sum + hand.wager, 0) + game.insuranceBet;
  const closeDialog = useCallback(() => { setDialog(null); setResetConfirm(false); setSettingsError(''); }, []);
  const tone = useCallback((frequency = 390) => {
    if (!saved.settings.sound || !audio.current || audio.current.state !== 'running') return;
    try { const ctx = audio.current, oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .1); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .12); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; } catch { /* Audio is optional. */ }
  }, [saved.settings.sound]);
  const activateAudio = useCallback(() => { if (!saved.settings.sound) return; try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => {}); } catch { /* Unsupported audio leaves play intact. */ } }, [saved.settings.sound]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);
  useEffect(() => { onBusyChange?.(active); return () => onBusyChange?.(false); }, [active, onBusyChange]);
  useEffect(() => { if (!persist) return; try { localStorage.setItem(STANDARD_SAVE_KEY, JSON.stringify(saved)); setStorageBlocked(false); } catch { setStorageBlocked(true); } }, [saved, persist]);
  useEffect(() => { const handler = () => { if (document.hidden) { void audio.current?.suspend().catch(() => {}); if (active) setPaused(true); } }; document.addEventListener('visibilitychange', handler); return () => document.removeEventListener('visibilitychange', handler); }, [active]);
  useEffect(() => { if (blocked || game.phase !== 'dealing') return; const timer = setTimeout(() => { tone(); dispatch({ type: 'DEAL_STEP' }); }, 210); return () => clearTimeout(timer); }, [game, blocked, tone]);
  useEffect(() => { if (blocked || game.phase !== 'dealer') return; const timer = setTimeout(() => { tone(465); dispatch({ type: 'DEALER_STEP' }); }, 550); return () => clearTimeout(timer); }, [game, blocked, tone]);
  useEffect(() => { setInputReady(false); if (blocked || !['player', 'insurance'].includes(game.phase)) return; const timer = setTimeout(() => { actionLock.current = false; setInputReady(true); }, 270); return () => clearTimeout(timer); }, [game, blocked]);
  useEffect(() => {
    if (!settled || completed.current === game.round) return;
    completed.current = game.round; actionLock.current = false;
    setSaved(previous => ({ ...previous, bankroll: game.bankroll, settings: { ...previous.settings, bet: game.baseBet }, stats: { rounds: previous.stats.rounds + 1, wins: previous.stats.wins + game.hands.filter(hand => hand.outcome === 'win').length, losses: previous.stats.losses + game.hands.filter(hand => hand.outcome === 'loss').length, pushes: previous.stats.pushes + game.hands.filter(hand => hand.outcome === 'push').length, surrenders: previous.stats.surrenders + game.hands.filter(hand => hand.outcome === 'surrender').length } }));
    tone(game.net > 0 ? 730 : 290);
  }, [settled, game, tone]);
  const start = useCallback(() => { if (active || actionLock.current || blocked || game.baseBet > game.bankroll) return; actionLock.current = true; setDecisions([]); rootRef.current?.focus({ preventScroll: true }); activateAudio(); dispatch({ type: 'START' }); }, [active, blocked, game.baseBet, game.bankroll, activateAudio]);
  const choose = useCallback((action: StandardAction) => { if (blocked || !inputReady || actionLock.current || !legalStandardActions(game).includes(action)) return; const observation = standardObservation(game); if (!observation) return; actionLock.current = true; setInputReady(false); setDecisions(previous => [...previous, { action, observation, handId: game.hands[game.activeHand]?.id ?? 0 }]); rootRef.current?.focus({ preventScroll: true }); activateAudio(); tone(); dispatch({ type: 'ACTION', action }); }, [game, blocked, inputReady, activateAudio, tone]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || blocked || !target || !rootRef.current?.contains(target) || target.closest('input,textarea,select,[contenteditable="true"]')) return; const map: Record<string, StandardAction> = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }; const key = event.key.toLowerCase(); if (key === 'n' && !active) { event.preventDefault(); start(); } else if (map[key] && legalStandardActions(game).includes(map[key])) { event.preventDefault(); choose(map[key]); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [game, blocked, choose, start, active]);
  useEffect(() => { rootRef.current?.querySelectorAll<HTMLElement>('.sbj-cards').forEach(element => { element.scrollLeft = element.scrollWidth; }); }, [game]);
  useEffect(() => { setViewedHand(game.activeHand); }, [game.activeHand, game.hands.length, game.round]);
  const openSettings = () => { if (active) return; setBetInput(String(game.baseBet)); setBankrollInput(String(game.initialBankroll)); setSettingsError(''); setDialog('settings'); };
  const applyBet = () => { const bet = Number(betInput); if (!integer(bet, 2, Math.min(game.bankroll, 1_000_000)) || bet % 2) { setSettingsError('每局下注需为不超过当前筹码的正偶数，至少 2。'); return; } dispatch({ type: 'SET_BET', bet }); setSaved(previous => ({ ...previous, settings: { ...previous.settings, bet } })); actionLock.current = false; closeDialog(); };
  const resetSession = () => { const initialBankroll = Number(bankrollInput), bet = Number(betInput); if (!integer(initialBankroll, 100, 1_000_000) || initialBankroll % 2 || !integer(bet, 2, initialBankroll) || bet % 2) { setSettingsError('初始筹码需为 100 到 1,000,000 的偶数；下注需为 2 起的偶数且不超过初始筹码。'); return; } if (!resetConfirm) { setResetConfirm(true); return; } dispatch({ type: 'CONFIGURE', initialBankroll, bet }); setSaved(previous => ({ ...emptySaved(), settings: { ...previous.settings, initialBankroll, bet }, bankroll: initialBankroll, tutorialDone: previous.tutorialDone })); setDecisions([]); completed.current = 0; actionLock.current = false; closeDialog(); };
  const finishTutorial = () => { setSaved(previous => ({ ...previous, tutorialDone: true })); closeDialog(); };
  const status = game.phase === 'ready' ? '下注准备好，开始一手。' : game.phase === 'dealing' ? '牌已洗好，正在发牌。' : game.phase === 'insurance' ? '庄家亮 A，是否买保险？' : game.phase === 'dealer' ? '你的选择完成，庄家按规则行动。' : settled ? game.net > 0 ? '这一局，带走一些筹码。' : game.net < 0 ? '这一局结束，回看选择。' : '筹码回到你手里。' : `第 ${game.activeHand + 1} 手，由你决定。`;
  const activeHand = game.hands[game.activeHand];
  const tutorial = tutorials[tutorialStep];
  return <main ref={rootRef} tabIndex={-1} data-phase={game.phase} className={`bj-app sbj-app ${className}`} aria-label="标准 Blackjack 练习牌桌">
    <header className="sbj-header"><div className="bj-brand"><div className="bj-logo" aria-hidden="true">♠</div><div><span className="bj-eyebrow">THE QUIET TABLE</span><h1>标准 <em>Blackjack</em></h1></div></div><div className="sbj-header-actions">{onExit && <button className="sbj-quiet" onClick={onExit}>返回游戏室</button>}<button className="sbj-quiet" onClick={() => { setTutorialStep(0); setTutorialAnswer(null); setDialog('tutorial'); }}>新手教程</button><button className="sbj-quiet" disabled={active} onClick={openSettings}>筹码设置</button><button className="sbj-quiet" aria-pressed={saved.settings.sound} onClick={() => { setSaved(previous => ({ ...previous, settings: { ...previous.settings, sound: !previous.settings.sound } })); if (!saved.settings.sound) { try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => {}); } catch {} } }}>音效{saved.settings.sound ? '开' : '关'}</button></div></header>
    <details className="sbj-table-guide"><summary>桌规与入门提示 <span>六副牌 · S17 · 3:2</span></summary><div className="sbj-rule-strip"><span>六副牌 · 每局重洗</span><span>庄家软 17 停牌</span><span>Blackjack 赔 3:2</span><span>加倍 · 分牌 · 迟投降</span></div>
    {!saved.tutorialDone && <div className="sbj-intro"><p>第一次来？用六个小例子认识点数、加倍和分牌，再上桌练习。</p><button className="sbj-quiet" onClick={() => { setTutorialStep(0); setTutorialAnswer(null); setDialog('tutorial'); }}>开始教程 ↗</button></div>}
    </details>
    <section className="sbj-bankroll" aria-label="虚拟筹码"><div><small>可用筹码</small><strong>{chips(game.bankroll)}</strong></div><div><small>每局基础下注</small><b>{chips(game.baseBet)}</b></div><div><small>本局总投入</small><b>{active || settled ? chips(totalWager) : '0'}</b></div><div><small>{settled ? '本局净收益' : '已结算累计收益'}</small><b className={(settled ? game.net : saved.bankroll - saved.settings.initialBankroll) > 0 ? 'sbj-positive' : ''}>{signed(settled ? game.net : saved.bankroll - saved.settings.initialBankroll)}</b></div></section>
    <div className="sbj-play-area"><section className="sbj-table" aria-label="标准规则牌桌"><div className="sbj-felt-border" aria-hidden="true"/><div className="sbj-dealer-heading"><div><span className="sbj-seat-label">庄家</span><p>严格执行 S17，不根据你的牌改变行动</p></div><b aria-label={game.hidden ? '庄家总点数隐藏' : `庄家 ${handValue(game.dealer).total} 点`}>{!game.dealer.length ? '·' : game.hidden ? '?' : handValue(game.dealer).total}<small>{game.hidden ? '暗牌未翻开' : '点'}</small></b></div><div className="sbj-cards sbj-dealer-cards" role="group" tabIndex={0} aria-label="庄家手牌，可左右滚动">{game.dealer.length ? game.dealer.map((card, index) => <PlayingCard key={`${game.round}-${card.id}`} card={card} index={0} hidden={game.hidden && index > 0}/>) : <><PlayingCard/><PlayingCard/></>}</div><div className="sbj-table-center"><span/><div><b>BLACKJACK</b><small>天然 21 赔 3:2 · 所有 17 停牌</small></div><span/></div>{game.hands.length > 1 && <nav className="sbj-hand-tabs" aria-label="查看分牌手">{game.hands.map((hand, index) => <button key={hand.id} aria-pressed={viewedHand === index} onClick={() => setViewedHand(index)}>第 {index + 1} 手<small>{game.phase === 'player' && index === game.activeHand ? '当前操作' : hand.outcome ? { win: '赢', loss: '输', push: '平', surrender: '投降' }[hand.outcome] : `${handValue(hand.cards).total} 点`}</small></button>)}</nav>}<div className="sbj-hands" data-hands={Math.max(game.hands.length, 1)}>{game.hands.length ? game.hands.map((hand, index) => { const value = handValue(hand.cards); return <section key={hand.id} data-viewed={viewedHand === index} className={`sbj-player-hand ${game.phase === 'player' && index === game.activeHand ? 'sbj-hand-active' : ''}`} aria-label={`第 ${index + 1} 手${index === game.activeHand && game.phase === 'player' ? '，正在操作' : ''}`}><div className="sbj-hand-heading"><span>{game.hands.length === 1 ? '你的手牌' : `第 ${index + 1} 手`}{game.phase === 'player' && index === game.activeHand && <small>当前手</small>}</span><b>{value.total}<small>{value.soft && value.total <= 21 ? '软点' : '点'}</small></b></div><div className="sbj-cards" role="group" tabIndex={0} aria-label={`你的第 ${index + 1} 手牌，可左右滚动`}>{hand.cards.map(card => <PlayingCard key={`${game.round}-${card.id}`} card={card} index={0}/>)}</div><div className="sbj-hand-footer"><span className="sbj-chip" aria-label={`本手下注 ${hand.wager}`}>{chips(hand.wager)}</span><p>{hand.outcome ? `${{ win: '赢', loss: '输', push: '平局', surrender: '投降' }[hand.outcome]} · ${signed(hand.profit)}` : hand.status === 'bust' ? '爆牌' : hand.status === 'stood' ? '已停牌' : hand.status === 'natural' ? '天然 Blackjack' : hand.fromSplit ? hand.splitAces ? '分 A · 仅补一张' : '分牌手 · 依次操作' : '超过 21 即爆牌'}</p></div></section>; }) : <section className="sbj-player-hand"><div className="sbj-hand-heading"><span>你的手牌</span><b>·<small>点</small></b></div><div className="sbj-cards" aria-hidden="true"><PlayingCard/><PlayingCard/></div><div className="sbj-hand-footer"><span className="sbj-chip">{chips(game.baseBet)}</span><p>从一手好牌开始</p></div></section>}</div></section>
    <section className="sbj-controls" aria-label="对局操作"><div className="sbj-status" role="status" aria-live="polite"><h2>{status}</h2><p>{settled ? game.reason : game.phase === 'insurance' ? '保险是独立下注，不改变原手牌输赢。通常不买更划算。' : game.phase === 'player' ? `${activeHand ? `${handValue(activeHand.cards).soft ? '软' : '硬'} ${handValue(activeHand.cards).total} 点。` : ''}选择合法操作，赛后再看教练分析。` : active ? '没有倒计时，切到后台会暂停。' : '筹码仅用于本地练习；下注和初始筹码都可调整。'}</p>{settled && game.insuranceBet > 0 && <p>保险投入 {chips(game.insuranceBet)} · 保险净收益 {signed(game.insuranceProfit)}</p>}</div><div className="sbj-actions">{!active ? <button className="sbj-primary" disabled={game.bankroll < game.baseBet} onClick={start}>{settled ? '下一局' : '开始对局'}<small>下注 {chips(game.baseBet)}</small><kbd>N</kbd></button> : game.phase === 'insurance' ? (['declineInsurance', 'insurance'] as StandardAction[]).map(action => <button key={action} className={action === 'declineInsurance' ? 'sbj-primary' : 'sbj-secondary'} disabled={blocked || !inputReady || !legal.includes(action)} onClick={() => choose(action)}>{names[action]}<small>{action === 'insurance' ? `另付 ${chips(game.baseBet / 2)}` : '保留筹码'}</small></button>) : game.phase === 'player' ? (['hit', 'stand', 'double', 'split', 'surrender'] as StandardAction[]).map(action => <button key={action} className={action === 'hit' ? 'sbj-primary' : 'sbj-secondary'} disabled={blocked || !inputReady || !legal.includes(action)} onClick={() => choose(action)} title={hints[action]}>{names[action]}<small>{action === 'double' || action === 'split' ? `另付 ${chips(activeHand?.wager || 0)}` : action === 'surrender' ? '拿回半注' : hints[action]}</small><kbd>{keys[action]}</kbd></button>) : <p className="sbj-waiting">{game.phase === 'dealer' ? '庄家行动中…' : '发牌中…'}</p>}</div>{!active && game.bankroll < game.baseBet && <p className="sbj-warning">可用筹码不足本局下注。请在「筹码设置」调低下注，或明确重建练习筹码。</p>}</section>
    </div><section className="sbj-session"><div><span>已完成 {saved.stats.rounds} 局</span><p>按手统计：赢 {saved.stats.wins} · 输 {saved.stats.losses} · 平 {saved.stats.pushes} · 投降 {saved.stats.surrenders}</p></div><label><input type="checkbox" checked={saved.settings.coach} onChange={event => setSaved(previous => ({ ...previous, settings: { ...previous.settings, coach: event.target.checked } }))}/>赛后教练</label></section>
    {settled && saved.settings.coach && <Review key={game.round} decisions={decisions}/>}
    <p className="sbj-bottom">只保存已结算的筹码和记录。刷新会放弃未结束的一局，恢复上一局结算后的余额。{storageBlocked && <span role="status">浏览器未允许保存，记录仅保留在本次页面中。</span>}</p>
    {dialog === 'settings' && <Modal title="筹码设置" onClose={closeDialog}><p>调整下一局下注会保留当前筹码与记录。更换初始筹码需要重建练习，清空本次统计。</p><label className="sbj-field">下一局基础下注<input type="number" min="2" step="2" max={Math.min(game.bankroll, 1_000_000)} value={betInput} onChange={event => { setBetInput(event.target.value); setResetConfirm(false); setSettingsError(''); }}/><small>正偶数，最低 2，不能超过当前可用筹码 {chips(game.bankroll)}。</small></label><button className="sbj-primary" onClick={applyBet}>仅应用下一局下注</button><div className="sbj-reset-section"><label className="sbj-field">新练习的初始筹码<input type="number" min="100" max="1000000" step="2" value={bankrollInput} onChange={event => { setBankrollInput(event.target.value); setResetConfirm(false); setSettingsError(''); }}/><small>100 到 1,000,000 的偶数；当前累计收益和统计会清空。</small></label>{resetConfirm && <p className="sbj-warning" role="status">确认将筹码重建为 {chips(Number(bankrollInput))}，下注 {chips(Number(betInput))}，并清空已完成对局记录？</p>}<button className="sbj-secondary" onClick={resetSession}>{resetConfirm ? '确认重建并清空记录' : '重建练习筹码'}</button></div>{settingsError && <p className="sbj-warning" role="alert">{settingsError}</p>}</Modal>}
    {dialog === 'tutorial' && <Modal title="新手教程" onClose={closeDialog}><nav className="sbj-tutorial-nav" aria-label="教程章节">{tutorials.map((step, index) => <button key={step.title} aria-pressed={index === tutorialStep} onClick={() => { setTutorialStep(index); setTutorialAnswer(null); }}>{index + 1}<span>{step.title}</span></button>)}</nav><h3>{tutorial.title}</h3><div className="sbj-tutorial-cards">{tutorial.cards.map(card => <PlayingCard key={card.id} card={card}/>)}</div><p>{tutorial.text}</p><div className="sbj-quiz"><strong>{tutorial.question}</strong><div>{tutorial.options.map((option, index) => <button className="sbj-secondary" key={option} aria-pressed={tutorialAnswer === index} onClick={() => setTutorialAnswer(index)}>{option}</button>)}</div>{tutorialAnswer !== null && <p role="status">{tutorialAnswer === tutorial.correct ? '答对了。' : '再想一下。'}{tutorial.answer}</p>}</div><div className="sbj-tutorial-footer"><button className="sbj-quiet" disabled={tutorialStep === 0} onClick={() => { setTutorialStep(value => value - 1); setTutorialAnswer(null); }}>上一节</button><span>{tutorialStep + 1} / {tutorials.length}</span>{tutorialStep < tutorials.length - 1 ? <button className="sbj-primary" onClick={() => { setTutorialStep(value => value + 1); setTutorialAnswer(null); }}>下一节</button> : <button className="sbj-primary" onClick={finishTutorial}>完成，开始练习</button>}</div></Modal>}
    {paused && !dialog && <Modal title="牌桌已暂停" onClose={() => { setPaused(false); activateAudio(); }}><p>没有倒计时。准备好后继续，庄家和发牌都从原来的位置恢复。</p><button className="sbj-primary" onClick={() => { setPaused(false); activateAudio(); }}>继续对局</button></Modal>}
  </main>;
}
