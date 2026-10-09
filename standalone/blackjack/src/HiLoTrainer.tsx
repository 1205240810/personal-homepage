'use client';
import { useEffect, useRef, useState } from 'react';
import type { Card } from './engine';
import {
  HILO_DECKS, HILO_ROUND_SIZES, HILO_SPEEDS, createShoe, hiLoValue, readHiLoRecord, remainingDecksLabel,
  runningCount, saveHiLoRecord, scoreHiLo, trueCount, type HiLoDecks, type HiLoSpeed,
} from './hilo';
import { PlayingCard } from './PlayingCard';
import './theme.css';
import './hilo.css';

type Phase = 'setup' | 'dealing' | 'answer' | 'result';
const tag = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/**
 * Optional Hi-Lo counting drill. The standard table reshuffles six decks every
 * round, so counting there has no value; this drill keeps one shoe across
 * rounds and only checks the player's running count.
 */
export function HiLoTrainer({ persist = true }: { persist?: boolean }) {
  const [decks, setDecks] = useState<HiLoDecks>(2);
  const [speed, setSpeed] = useState<HiLoSpeed>('medium');
  const [size, setSize] = useState<number>(20);
  const [shoe, setShoe] = useState<Card[]>([]);
  const [dealt, setDealt] = useState(0);
  const [roundStart, setRoundStart] = useState(0);
  const [phase, setPhase] = useState<Phase>('setup');
  const [guess, setGuess] = useState('');
  const [showTags, setShowTags] = useState(false);
  const [record, setRecord] = useState(() => (persist ? readHiLoRecord() : readHiLoRecord({ getItem: () => null })));
  const [saved, setSaved] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const ms = HILO_SPEEDS.find((s) => s.id === speed)!.ms;
  const roundEnd = Math.min(shoe.length, roundStart + size);
  // `dealt` passes the round end only when the player (or timer) moves on
  // from the final card, so every card stays visible for its full turn.
  const shown = Math.min(dealt, roundEnd);
  const view: Phase = phase === 'dealing' && dealt > roundEnd ? 'answer' : phase;
  const seen = shoe.slice(0, shown);
  const current = shown > 0 ? shoe[shown - 1] : undefined;
  const running = runningCount(seen);
  const remaining = shoe.length - shown;

  useEffect(() => {
    if (view !== 'dealing' || ms === 0) return;
    const timer = setInterval(() => setDealt((d) => Math.min(d + 1, roundEnd + 1)), ms);
    return () => clearInterval(timer);
  }, [view, ms, roundEnd]);
  useEffect(() => {
    if (view !== 'dealing' || ms !== 0) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      setDealt((d) => Math.min(d + 1, roundEnd + 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [view, ms, roundEnd]);
  useEffect(() => {
    if (view === 'answer') input.current?.focus();
    if (view === 'result') next.current?.focus();
  }, [view]);

  const startRound = (fresh: boolean) => {
    let s = shoe;
    let d = shown;
    // Reshuffle at a fresh start or when fewer than a round + ¼ deck remain.
    if (fresh || shoe.length - dealt < size + 13) {
      s = createShoe(decks);
      d = 0;
      setShoe(s);
      setDealt(0);
    }
    setRoundStart(d);
    setDealt(d);
    setGuess('');
    setPhase('dealing');
    if (ms === 0) setDealt(d + 1);
  };
  const submit = () => {
    const value = Number(guess);
    if (guess.trim() === '' || !Number.isInteger(value)) return;
    const nextRecord = scoreHiLo(record, value === running);
    setRecord(nextRecord);
    if (persist) setSaved(saveHiLoRecord(nextRecord));
    setDealt(shown);
    setPhase('result');
  };
  const correct = Number(guess) === running;
  const roundCards = shoe.slice(roundStart, roundEnd);

  return (
    <section className="hilo" aria-labelledby="hilo-title">
      <header className="hilo-head">
        <div>
          <span className="hilo-eyebrow">CARD COUNTING DRILL</span>
          <h2 id="hilo-title">Hi-Lo 记牌练习</h2>
          <p>2–6 记 +1，7–9 记 0，10 / 人头 / A 记 −1。看完一组牌后，报出当前的「流水数」。同一牌靴会跨轮延续，就像真实牌桌。</p>
        </div>
        <dl className="hilo-record">
          <div><dt>答对</dt><dd>{record.correct} / {record.rounds}</dd></div>
          <div><dt>连对</dt><dd>{record.streak}</dd></div>
          <div><dt>最佳连对</dt><dd>{record.bestStreak}</dd></div>
        </dl>
      </header>

      {phase === 'setup' && (
        <div className="hilo-setup">
          <fieldset><legend>牌靴副数</legend>{HILO_DECKS.map((d) => <button key={d} type="button" aria-pressed={decks === d} onClick={() => setDecks(d)}>{d} 副</button>)}</fieldset>
          <fieldset><legend>翻牌速度</legend>{HILO_SPEEDS.map((s) => <button key={s.id} type="button" aria-pressed={speed === s.id} onClick={() => setSpeed(s.id)}>{s.label}</button>)}</fieldset>
          <fieldset><legend>每轮张数</legend>{HILO_ROUND_SIZES.map((n) => <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>{n} 张</button>)}</fieldset>
          <label className="hilo-check"><input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />新手辅助：在牌下显示计数值</label>
          <button type="button" className="hilo-primary" onClick={() => startRound(true)}>洗新牌靴，开始练习</button>
        </div>
      )}

      {phase !== 'setup' && (
        <div className="hilo-table">
          <div className="hilo-meta">
            <span>本轮 {shown - roundStart} / {roundEnd - roundStart} 张</span>
            <span>牌靴剩余 {remaining} 张 · 约 {remainingDecksLabel(remaining)} 副</span>
          </div>
          <div className="hilo-card-stage" aria-live={ms === 0 ? 'polite' : 'off'}>
            {view === 'dealing' && current ? (
              <div className="hilo-current" key={current.id}>
                <PlayingCard card={current} />
                {showTags && <span className="hilo-tag" data-v={hiLoValue(current.rank)}>{tag(hiLoValue(current.rank))}</span>}
              </div>
            ) : view === 'dealing' ? null : (
              <div className="hilo-question">{view === 'answer' ? '牌翻完了。现在的流水数是多少？' : null}</div>
            )}
          </div>
          {view === 'dealing' && (
            <div className="hilo-controls">
              {ms === 0 ? (
                <button type="button" className="hilo-primary" onClick={() => setDealt((d) => Math.min(d + 1, roundEnd + 1))}>{shown >= roundEnd ? '看完了，作答' : '下一张'}<kbd>Space</kbd></button>
              ) : <p>自动翻牌中，默默数着…</p>}
            </div>
          )}
          {view === 'answer' && (
            <form className="hilo-answer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <label htmlFor="hilo-guess">从牌靴洗好后累计的流水数</label>
              <div>
                <button type="button" aria-label="减一" onClick={() => setGuess(String((Number(guess) || 0) - 1))}>−</button>
                <input id="hilo-guess" ref={input} inputMode="numeric" pattern="-?[0-9]*" value={guess} onChange={(e) => setGuess(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
                <button type="button" aria-label="加一" onClick={() => setGuess(String((Number(guess) || 0) + 1))}>+</button>
              </div>
              <button type="submit" className="hilo-primary" disabled={guess.trim() === '' || guess === '-'}>确认</button>
            </form>
          )}
          {phase === 'result' && (
            <div className={`hilo-result ${correct ? 'is-correct' : 'is-wrong'}`}>
              <output><strong>{correct ? `答对了：流水数 ${tag(running)}` : `差一点：你答 ${tag(Number(guess))}，实际是 ${tag(running)}`}</strong></output>
              <p>按剩余约 {remainingDecksLabel(remaining)} 副牌换算，真数约 {tag(trueCount(running, remaining))}。真数越高，剩下的大牌越多，对玩家越有利。</p>
              <ol className="hilo-strip" aria-label="本轮翻过的牌">
                {roundCards.map((c) => <li key={c.id}><b className={c.suit === 'hearts' || c.suit === 'diamonds' ? 'is-red' : ''}>{c.rank}</b><span data-v={hiLoValue(c.rank)}>{tag(hiLoValue(c.rank))}</span></li>)}
              </ol>
              <p className="hilo-sub">本轮净变化 {tag(runningCount(roundCards))}，上一轮结束时为 {tag(running - runningCount(roundCards))}。</p>
              <div className="hilo-controls">
                <button type="button" ref={next} className="hilo-primary" onClick={() => startRound(false)}>继续这个牌靴</button>
                <button type="button" onClick={() => setPhase('setup')}>调整设置</button>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="hilo-note">{saved ? '练习成绩只保存在当前浏览器。' : '浏览器暂时无法保存成绩，仍可继续练习。'}记牌是数学练习，标准牌桌每局重洗六副牌，不会因计数而改变结果。</p>
    </section>
  );
}
