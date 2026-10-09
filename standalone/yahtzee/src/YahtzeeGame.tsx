import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  bonusFor,
  categories,
  Category,
  descriptions,
  Difficulty,
  initial,
  labels,
  options,
  restore,
  roll,
  score,
  State,
  STORAGE,
  total,
  upper,
  bestScore,
} from './logic';
import { createAudio } from './audio';
import { requestHold, type HoldDecision } from './ai';
import './styles.css';
// Phones and touch screens get a compact score picker right under the dice, so
// players do not have to scroll down to the score card after every roll.
const QUICK_QUERY = '(max-width: 690px), (pointer: coarse)';
const subscribeQuick = (notify: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUICK_QUERY);
  mq.addEventListener?.('change', notify);
  return () => mq.removeEventListener?.('change', notify);
};
const quickSnapshot = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.(QUICK_QUERY).matches;
const quickServerSnapshot = () => false;
export type YahtzeeGameProps = {
  onExit?: () => void;
  onComplete?: (result: {
    player: number;
    ai: number;
    winner: 'player' | 'ai' | 'draw';
  }) => void;
  persist?: boolean;
  className?: string;
  globalKeyboard?: boolean;
};
const pipPlaces: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
function Die({
  value,
  held,
  index,
  disabled,
  rolling,
  onClick,
}: {
  value: number;
  held: boolean;
  index: number;
  disabled: boolean;
  rolling: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`yd-die ${held ? 'is-held' : ''} ${rolling && !held ? 'is-rolling' : ''}`}
      aria-label={`骰子 ${index + 1}，${value} 点，${held ? '已保留' : '未保留'}`}
      aria-pressed={held}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="yd-face" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className={pipPlaces[value].includes(i) ? 'pip' : ''} />
        ))}
      </span>
      <span className="yd-hold">{held ? '已保留' : '点击保留'}</span>
    </button>
  );
}
export function YahtzeeGame({
  onExit,
  onComplete,
  persist = true,
  className = '',
  globalKeyboard = false,
}: YahtzeeGameProps) {
  // Render the same fresh view on the server/client, then hydrate browser-only
  // progress before the first save. A render-time storage read caused mismatches
  // (and could overwrite a restored game) inside an SSR personal homepage.
  const [state, setState] = useState<State>(() => initial());
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const dialogTitle = useId();
  const ref = useRef(state);
  ref.current = state;
  const [selected, setSelected] = useState<Category | null>(null);
  const quick = useSyncExternalStore(
    subscribeQuick,
    quickSnapshot,
    quickServerSnapshot,
  );
  const [resumedNotice, setResumedNotice] = useState(false),
    [fastAI, setFastAI] = useState(false);
  const [paused, setPaused] = useState(false),
    [rolling, setRolling] = useState(false),
    [dialog, setDialog] = useState<'restart' | Category | null>(null),
    [music, setMusic] = useState(false),
    [sfx, setSfx] = useState(false),
    [musicVolume, setMusicVolume] = useState(0.35),
    [sfxVolume, setSfxVolume] = useState(0.45),
    [soundError, setSoundError] = useState(false),
    [saveError, setSaveError] = useState(false),
    [coach, setCoach] = useState(true);
  const mounted = useRef(false),
    pauseRef = useRef(paused);
  pauseRef.current = paused;
  const modalRef = useRef<HTMLElement>(null);
  const audio = useRef<ReturnType<typeof createAudio> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    busy = useRef(false),
    root = useRef<HTMLElement>(null),
    completed = useRef('');
  const commit = (s: State) => {
    ref.current = s;
    setState(s);
  };
  useEffect(() => {
    mounted.current = true;
    audio.current = createAudio('yahtzee');
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      audio.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (persist) {
      try {
        const saved = restore(localStorage.getItem(STORAGE));
        if (saved) {
          const waiting =
            saved.turn !== 'done' &&
            (saved.rolls > 0 || Object.keys(saved.cards[0]).length > 0);
          commit(saved);
          pauseRef.current = waiting;
          setPaused(waiting);
          setResumedNotice(waiting);
        }
      } catch {
        setSaveError(true);
      }
    }
    setReady(true);
  }, [persist]);
  useEffect(() => {
    if (!ready) return;
    if (persist)
      try {
        localStorage.setItem(STORAGE, JSON.stringify(state));
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
  }, [state, persist, ready]);
  useEffect(() => {
    audio.current?.setMusicVolume(musicVolume);
    audio.current?.setSfxVolume(sfxVolume);
  }, [musicVolume, sfxVolume]);
  useEffect(() => {
    if (paused) audio.current?.pause();
    else audio.current?.resume();
  }, [paused]);
  useEffect(() => {
    const f = () => {
      if (document.hidden) {
        pauseRef.current = true;
        audio.current?.pause();
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  const animate = () => {
    busy.current = true;
    setRolling(true);
    timer.current = setTimeout(() => {
      busy.current = false;
      setRolling(false);
    }, 380);
  };
  const playerRoll = () => {
    const s = ref.current;
    if (
      s.turn !== 'player' ||
      !ready ||
      busy.current ||
      pauseRef.current ||
      dialog ||
      s.rolls >= 3 ||
      (s.rolls > 0 && s.held.every(Boolean))
    )
      return;
    setSelected(null);
    audio.current?.play('roll');
    commit(roll(s));
    animate();
  };
  const hold = (i: number) => {
    const s = ref.current;
    if (
      s.turn !== 'player' ||
      !ready ||
      !s.rolls ||
      busy.current ||
      pauseRef.current ||
      dialog
    )
      return;
    setSelected(null);
    audio.current?.play('tap');
    commit({ ...s, held: s.held.map((h, j) => (i === j ? !h : h)) });
  };
  const commitScore = (c: Category) => {
    const s = ref.current;
    if (
      s.turn !== 'player' ||
      !ready ||
      pauseRef.current ||
      busy.current ||
      !s.rolls
    )
      return;
    const next = score(s, c);
    if (next === s) return;
    audio.current?.play('success');
    commit(next);
    setDialog(null);
    setSelected(null);
  };
  const pick = (c: Category) => {
    const s = ref.current;
    if (
      s.turn !== 'player' ||
      !ready ||
      !s.rolls ||
      pauseRef.current ||
      busy.current ||
      dialog
    )
      return;
    const pts = options(s.dice, s.cards[0])[c];
    if (pts === undefined) return;
    setSelected(null);
    if (pts === 0) setDialog(c);
    else setSelected(c);
  };
  useEffect(() => {
    if (!ready || state.turn !== 'ai' || paused || dialog) return;
    let cancel: undefined | (() => void),
      stale = false;
    const t = setTimeout(
      () => {
        const s = ref.current;
        if (
          stale ||
          !mounted.current ||
          pauseRef.current ||
          document.hidden ||
          s.turn !== 'ai'
        )
          return;
        if (s.rolls === 0) {
          commit({
            ...roll(s),
            lastAI: '蓝调掷出了五枚骰子，正在衡量可用分栏。',
          });
          audio.current?.play('roll');
          return;
        }
        const act = (decision: HoldDecision | null) => {
          if (
            stale ||
            !mounted.current ||
            pauseRef.current ||
            document.hidden ||
            ref.current !== s
          )
            return;
          const best = bestScore(s.dice, s.cards[1], s.difficulty);
          if (!decision || decision.held.every(Boolean)) {
            const next = score(s, best.category);
            commit({
              ...next,
              lastAI:
                next.lastAI +
                (decision?.emergency
                  ? ' 策略计算暂不可用，本回合按当前合法分栏记分。'
                  : ` ${s.difficulty === 'normal' ? '兼顾分栏机会成本和上区奖励进度。' : '优先争取眼前分数。'}`),
            });
            audio.current?.play('success');
          } else {
            const values = s.dice.filter((_, i) => decision.held[i]);
            commit({
              ...roll({ ...s, held: decision.held }),
              lastAI: `蓝调保留 ${values.length ? values.join(' · ') : '零枚骰子'}，重掷 ${5 - values.length} 枚。按下一掷的全部点数组合估计收益。`,
            });
            audio.current?.play('roll');
          }
        };
        if (s.rolls >= 3) act(null);
        else cancel = requestHold(s.dice, s.cards[1], s.difficulty, act);
      },
      fastAI ? 120 : 850,
    );
    return () => {
      stale = true;
      clearTimeout(t);
      cancel?.();
    };
  }, [state, paused, dialog, fastAI, ready]);
  useEffect(() => {
    if (ready && state.turn === 'done' && completed.current !== state.id) {
      completed.current = state.id;
      const player = total(state.cards[0], state.bonus[0]),
        ai = total(state.cards[1], state.bonus[1]);
      onComplete?.({
        player,
        ai,
        winner: player > ai ? 'player' : player < ai ? 'ai' : 'draw',
      });
      audio.current?.play('win');
    }
  }, [state, onComplete, ready]);
  useEffect(() => {
    const target = globalKeyboard ? window : root.current;
    if (!target) return;
    const f = (event: Event) => {
      const e = event as KeyboardEvent;
      if (
        e.repeat ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.isComposing ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,select,textarea,button,a,summary,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]',
          ))
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        playerRoll();
      }
      if (/^[1-5]$/.test(e.key)) hold(Number(e.key) - 1);
    };
    target.addEventListener('keydown', f);
    return () => target.removeEventListener('keydown', f);
  });
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDialog(null);
      }
      if (e.key === 'Tab') {
        const buttons = modalRef.current?.querySelectorAll('button');
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [dialog]);
  const toggleSound = async (type: 'music' | 'sfx') => {
    const enabled = type === 'music' ? music : sfx;
    if (!enabled) {
      const ok = await audio.current?.start();
      if (!mounted.current) return;
      if (pauseRef.current) audio.current?.pause();
      if (!ok) {
        setSoundError(true);
        return;
      }
      setSoundError(false);
    }
    if (type === 'music') {
      audio.current?.setMusicEnabled(!enabled);
      setMusic(!enabled);
    } else {
      audio.current?.setSfxEnabled(!enabled);
      setSfx(!enabled);
    }
  };
  const restart = () => {
    if (timer.current) clearTimeout(timer.current);
    busy.current = false;
    setRolling(false);
    commit(initial(state.difficulty));
    setDialog(null);
    setPaused(false);
    setResumedNotice(false);
    setSelected(null);
  };
  const active = state.turn === 'player',
    card = state.cards[0],
    available = state.rolls && active ? options(state.dice, card) : {},
    pScore = total(card, state.bonus[0]),
    aScore = total(state.cards[1], state.bonus[1]),
    round = Math.min(13, Object.keys(state.cards[1]).length + 1);
  const quickOptions = categories
    .filter((c) => available[c] !== undefined)
    .sort((x, y) => available[y]! - available[x]!);
  return (
    <main
      ref={root}
      tabIndex={0}
      className={`yd-game ${className}`}
      aria-label="快艇骰子游戏"
    >
      <div className="yd-shell" inert={Boolean(dialog)}>
        <header className="yd-header">
          <div>
            <span className="yd-eyebrow">THE BLUE HOUR · DICE CLUB</span>
            <h1>
              快艇骰子<span>与蓝调对弈</span>
            </h1>
          </div>
          <div className="yd-header-actions">
            {onExit && (
              <button
                onClick={() => {
                  pauseRef.current = true;
                  audio.current?.pause();
                  setPaused(true);
                  onExit();
                }}
              >
                返回
              </button>
            )}
            <button onClick={() => setDialog('restart')}>新一局</button>
            <button
              aria-pressed={paused}
              onClick={() => {
                pauseRef.current = !paused;
                setPaused(!paused);
                setResumedNotice(false);
              }}
            >
              {paused ? '继续' : '暂停'}
            </button>
          </div>
        </header>
        {resumedNotice && (
          <p className="yd-restore-note" role="status">
            已恢复上次对局：骰子、保留状态和剩余投掷次数均已保留。点击“继续”后再行动。
          </p>
        )}
        <section className="yd-scoreline" aria-label="总分">
          <div className={active ? 'active' : ''}>
            <span>YOU / 你</span>
            <strong>{pScore.toString().padStart(2, '0')}</strong>
            <small>{Object.keys(card).length} / 13 栏</small>
          </div>
          <div className="yd-round">
            <span>ROUND</span>
            <strong>{round.toString().padStart(2, '0')}</strong>
            <small>共十三轮</small>
          </div>
          <div className={state.turn === 'ai' ? 'active' : ''}>
            <span>BLUE / 蓝调</span>
            <strong>{aScore.toString().padStart(2, '0')}</strong>
            <small>{Object.keys(state.cards[1]).length} / 13 栏</small>
          </div>
        </section>
        <div className="yd-layout">
          <section className="yd-table">
            <div
              className="yd-turn-label"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span
                className={`yd-status-dot ${state.turn === 'ai' ? 'thinking' : ''}`}
              />
              <span>
                {paused
                  ? '对局已暂停'
                  : state.turn === 'done'
                    ? '本局落幕'
                    : active
                      ? '轮到你了'
                      : '蓝调的回合'}
              </span>
              <span className="yd-roll-count">{state.rolls} / 3 次投掷</span>
            </div>
            <div className="yd-felt">
              <div className="yd-watermark">BLUE HOUR</div>
              <div className="yd-dices">
                {state.dice.map((value, i) => (
                  <Die
                    key={i}
                    index={i}
                    value={value}
                    held={state.held[i] && state.rolls > 0}
                    disabled={
                      !ready ||
                      !active ||
                      !state.rolls ||
                      paused ||
                      rolling ||
                      Boolean(dialog)
                    }
                    rolling={rolling}
                    onClick={() => hold(i)}
                  />
                ))}
              </div>
              <p className="yd-dice-hint">
                {state.turn === 'done'
                  ? '好运需要勇气，分数需要取舍。'
                  : paused
                    ? '慢慢来，骰子会等你。'
                    : active
                      ? state.rolls === 0
                        ? '五枚骰子，十三次抉择。准备好就掷。'
                        : state.rolls >= 3
                          ? '本回合投掷已用完，请在记分簿选择一栏。'
                          : `已保留 ${state.held.filter(Boolean).length} 枚 · 还可重掷 ${3 - state.rolls} 次。点击骰子切换保留。`
                      : '蓝调正在思考。它看不到下一次骰子的结果。'}
              </p>
            </div>
            <button
              className="yd-roll"
              onClick={playerRoll}
              disabled={
                !active ||
                paused ||
                rolling ||
                Boolean(dialog) ||
                state.rolls >= 3 ||
                (state.rolls > 0 && state.held.every(Boolean))
              }
            >
              {rolling
                ? '骰子落定中…'
                : state.turn === 'done'
                  ? '本局已结束'
                  : !active
                    ? '蓝调正在行动…'
                    : !ready
                      ? '正在读取进度…'
                      : !state.rolls
                        ? '掷出骰子'
                        : state.rolls >= 3
                          ? '请选择分栏记分'
                          : state.held.every(Boolean)
                            ? '已全部保留，请记分'
                            : `重掷 ${state.held.filter((h) => !h).length} 枚`}
              <span>SPACE</span>
            </button>
            {quick && active && state.rolls > 0 && quickOptions.length > 0 && (
              <section className="yd-quick" aria-label="快速记分">
                <div className="yd-quick-head">
                  <span>快速记分</span>
                  <small>按得分排序 · 先选再确认</small>
                </div>
                <div className="yd-quick-list">
                  {quickOptions.map((c) => (
                    <button
                      key={c}
                      aria-pressed={selected === c}
                      aria-label={`快速记分：${labels[c]} ${available[c]} 分`}
                      className={`${available[c] === 0 ? 'zero' : ''} ${selected === c ? 'selected' : ''}`}
                      disabled={paused || rolling || Boolean(dialog)}
                      onClick={() => pick(c)}
                    >
                      <span>{labels[c]}</span>
                      <b>{available[c]}</b>
                    </button>
                  ))}
                </div>
                {selected && available[selected] !== undefined && (
                  <div className="yd-quick-confirm">
                    <button onClick={() => setSelected(null)}>取消</button>
                    <button
                      disabled={paused || rolling || Boolean(dialog)}
                      onClick={() => commitScore(selected)}
                    >
                      确认：{labels[selected]} {available[selected]} 分
                      {bonusFor(state.dice, card) > 0 ? ' +100' : ''}
                    </button>
                  </div>
                )}
              </section>
            )}
            <div className="yd-ai-note" role="status">
              <span>蓝调的手记</span>
              <p>{state.lastAI}</p>
            </div>
            {state.turn === 'done' && (
              <section className="yd-result">
                <span>
                  FINAL SCORE · {pScore} : {aScore}
                </span>
                <h2>
                  {pScore > aScore
                    ? '这一夜，你赢了。'
                    : pScore < aScore
                      ? '蓝调略胜一筹。'
                      : '旗鼓相当的一局。'}
                </h2>
                <p>
                  你获得上区奖励 {upper(card) >= 63 ? 35 : 0} 分、快艇奖励{' '}
                  {state.bonus[0]} 分。
                </p>
                <button onClick={restart}>再来一局</button>
                {coach && (
                  <details open>
                    <summary>赛后复盘 · 行动记录</summary>
                    <p>
                      记录真实选择；AI
                      采用单步期望和长期启发式，不代表全局最优。
                    </p>
                    <ol>
                      {state.log
                        .slice()
                        .reverse()
                        .map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                    </ol>
                  </details>
                )}
              </section>
            )}
            <details className="yd-settings">
              <summary>桌边设置与玩法</summary>
              <div className="yd-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={fastAI}
                    onChange={(e) => setFastAI(e.target.checked)}
                  />{' '}
                  快速 AI 节奏（决策不变）
                </label>
                <label>
                  对手水平
                  <select
                    value={state.difficulty}
                    disabled={
                      Object.keys(card).length > 0 ||
                      state.rolls > 0 ||
                      state.turn !== 'player'
                    }
                    onChange={(e) =>
                      commit({
                        ...state,
                        difficulty: e.target.value as Difficulty,
                      })
                    }
                  >
                    <option value="easy">轻松 · 眼前收益</option>
                    <option value="normal">标准 · 兼顾分栏</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={coach}
                    onChange={(e) => setCoach(e.target.checked)}
                  />{' '}
                  赛后行动复盘
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={paused}
                    checked={music}
                    onChange={() => void toggleSound('music')}
                  />{' '}
                  原创背景音乐
                </label>
                <label>
                  音乐音量
                  <input
                    aria-label="音乐音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(+e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={paused}
                    checked={sfx}
                    onChange={() => void toggleSound('sfx')}
                  />{' '}
                  轻触音效
                </label>
                <label>
                  音效音量
                  <input
                    aria-label="音效音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={sfxVolume}
                    onChange={(e) => setSfxVolume(+e.target.value)}
                  />
                </label>
              </div>
              {soundError && (
                <p role="alert">浏览器暂未允许声音，请再次点击开关。</p>
              )}
              <p>
                每回合最多掷三次，可提前记分。十三栏各用一次；上区至少 63
                分，奖励 35 分。小顺为四连点，大顺为五连点。葫芦为三同加二同。
              </p>
              <p>
                快艇栏已填后再掷五同：先强制填相应上区；该栏已填则选下区，葫芦/小顺/大顺按固定分计；下区全满才可上区填零。快艇栏原为
                50 时另奖 100 分，原为零则无奖励。
              </p>
              <p>
                标准 AI
                精确枚举下一次重掷的点数组合，权衡分栏机会成本与上区奖励；它不是整局最优解。轻松
                AI 只考虑当下得分。双方均用独立公平随机骰子。
              </p>
              <p>
                键盘：聚焦桌面后空格投掷、1–5
                保留。支持减少动态效果。切到后台会暂停，回来后点“继续”。无真钱交易。
              </p>
              <a
                href="https://www.hasbro.com/common/instruct/yahtzee.pdf"
                target="_blank"
                rel="noreferrer"
              >
                官方规则参考 ↗
              </a>
            </details>
          </section>
          <aside className="yd-card">
            <div className="yd-card-title">
              <h2>记分簿</h2>
              <span>
                {active && state.rolls
                  ? '先选预览，再确认记分'
                  : '粗体为已记入分数'}
              </span>
            </div>
            <div className="yd-columns">
              <span>分栏</span>
              <span>你</span>
              <span>蓝调</span>
            </div>
            {categories.map((c, i) => (
              <div className={`yd-score-row ${i === 6 ? 'lower' : ''}`} key={c}>
                <span>
                  <b>{labels[c]}</b>
                  <small>{descriptions[i]}</small>
                </span>
                <button
                  title={
                    card[c] !== undefined
                      ? '已记分'
                      : available[c] === undefined
                        ? '当前不可记入'
                        : `记入${labels[c]} ${available[c]} 分`
                  }
                  aria-label={`${labels[c]}，${card[c] !== undefined ? '已记入 ' + card[c] : available[c] !== undefined ? '记入 ' + available[c] + ' 分' : '待记分'}`}
                  aria-pressed={selected === c}
                  className={`${card[c] !== undefined ? 'filled' : available[c] !== undefined ? 'preview' : ''} ${selected === c ? 'selected' : ''}`}
                  disabled={
                    card[c] !== undefined ||
                    available[c] === undefined ||
                    paused ||
                    rolling ||
                    Boolean(dialog)
                  }
                  onClick={() => pick(c)}
                >
                  {card[c] === undefined && available[c] !== undefined && (
                    <small aria-hidden="true">预览</small>
                  )}
                  {card[c] ?? (available[c] === undefined ? '—' : available[c])}
                </button>
                <span className="yd-ai-score">{state.cards[1][c] ?? '—'}</span>
                {selected === c && available[selected] !== undefined && (
                  <div className="yd-score-selection" role="status">
                    <p>
                      将{labels[selected]}记入 <b>{available[selected]} 分</b>
                      {bonusFor(state.dice, card) > 0
                        ? '，另加 100 分快艇奖励'
                        : ''}
                      。本局不能再改。
                    </p>
                    <div>
                      <button onClick={() => setSelected(null)}>
                        取消选择
                      </button>
                      <button
                        disabled={paused || rolling || Boolean(dialog)}
                        onClick={() => commitScore(selected)}
                      >
                        记入{labels[selected]} {available[selected]} 分
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="yd-bonus">
              <div>
                <span>上区进度 / 63</span>
                <b>
                  {upper(card)} · {upper(state.cards[1])}
                </b>
              </div>
              <progress
                value={Math.min(63, upper(card))}
                max="63"
                aria-label="你的上区奖励进度"
              />
              <div>
                <span>上区奖励</span>
                <b>
                  {upper(card) >= 63 ? 35 : 0} ·{' '}
                  {upper(state.cards[1]) >= 63 ? 35 : 0}
                </b>
              </div>
              <div>
                <span>快艇奖励</span>
                <b>
                  {state.bonus[0]} · {state.bonus[1]}
                </b>
              </div>
              {bonusFor(state.dice, card) > 0 && active && state.rolls > 0 ? (
                <p>本次记分另奖 100 分！</p>
              ) : null}
            </div>
          </aside>
        </div>
        <footer className="yd-footer">
          <span>原创骰面 · 一局好时光</span>
          <span>
            {persist
              ? !ready
                ? '正在读取进度…'
                : saveError
                  ? '保存不可用，本局仍可继续'
                  : '进度自动保存在此浏览器'
              : '本局不保存进度'}
          </span>
        </footer>
      </div>
      {dialog && (
        <div className="yd-overlay">
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitle}
            className="yd-dialog"
          >
            <h2 id={dialogTitle}>
              {dialog === 'restart'
                ? '重新开始这一局？'
                : `把${labels[dialog]}记为 ${available[dialog] ?? 0} 分？`}
            </h2>
            <p>
              {dialog === 'restart'
                ? '当前对局会被清空。'
                : `确认后，这个分栏本局不能再用。${active && bonusFor(state.dice, card) > 0 ? '本次另加 100 分快艇奖励。' : ''}你也可以返回，再想一想。`}
            </p>
            <div>
              <button autoFocus onClick={() => setDialog(null)}>
                返回对局
              </button>
              <button
                onClick={() =>
                  dialog === 'restart' ? restart() : commitScore(dialog)
                }
              >
                {dialog === 'restart'
                  ? '确认重开'
                  : available[dialog] === 0
                    ? '确认记零'
                    : '确认记分'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default YahtzeeGame;
