'use client';

import { Flag, Lightbulb, Shuffle, Swords } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  KIND_NAME,
  MINE,
  PIECES,
  SIDE_NAME,
  checkLayout,
  deploy as deploySide,
  isLegal,
  maskFor,
  newGame,
  play,
  resign,
  type JunqiEvent,
  type JunqiState,
  type JunqiView,
  type Kind,
  type Layout,
  type Move,
  type Side,
} from '@/lib/games/junqi';
import {
  JUNQI_LEVELS,
  type JunqiAiResult,
  type JunqiLevel,
} from '@/lib/games/junqi-ai';
import { PRESETS, randomLayout } from '@/lib/games/junqi-layouts';
import { JunqiBoard } from './junqi-board';
import { GameResult } from './result';
import { useLocalRecords } from './kit';
import './kit.css';
// Vite provides the default URL export for this worker asset.
// oxlint-disable-next-line import/default
import junqiWorkerUrl from './junqi-worker.ts?worker&url';

const SETTINGS = 'tscjj:junqi-settings:v1';
const RECORDS = 'tscjj:junqi-records:v1';
const LAYOUT = 'tscjj:junqi-layout:v1';
type Settings = { level: JunqiLevel; side: Side; open: boolean };
type Records = Partial<Record<JunqiLevel, { won: number; played: number }>>;
const isLevel = (v: unknown): v is JunqiLevel =>
  typeof v === 'number' && v in JUNQI_LEVELS;
function validateSettings(v: unknown): Settings | null {
  const o = v as Partial<Settings> | null;
  if (!o || !isLevel(o.level) || (o.side !== 0 && o.side !== 1)) return null;
  return { level: o.level, side: o.side, open: o.open === true };
}
function validateRecords(v: unknown): Records | null {
  if (!v || typeof v !== 'object') return null;
  const out: Records = {};
  for (const [k, r] of Object.entries(v)) {
    const lv = Number(k);
    const rec = r as { won?: unknown; played?: unknown };
    if (
      isLevel(lv) &&
      Number.isSafeInteger(rec?.won) &&
      Number.isSafeInteger(rec?.played) &&
      (rec.won as number) >= 0 &&
      (rec.played as number) >= (rec.won as number)
    )
      out[lv] = { won: rec.won as number, played: rec.played as number };
  }
  return out;
}
const validateLayout = (v: unknown): Layout | null =>
  checkLayout(v).errors.length ? null : (v as Layout);

function requestAi(
  view: JunqiView,
  level: JunqiLevel,
  resolve: (r: JunqiAiResult) => void,
  reject: () => void,
) {
  let worker: Worker | undefined;
  let live = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    live = false;
    clearTimeout(timeout);
    worker?.terminate();
  };
  const fail = () => {
    if (!live) return;
    cancel();
    reject();
  };
  try {
    worker = new Worker(junqiWorkerUrl, { type: 'module' });
    worker.onmessage = (e) => {
      if (!live || e.data?.id !== 1) return;
      if (e.data.error || !isLegal(view, e.data.result?.move)) return fail();
      cancel();
      resolve(e.data.result);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
    timeout = setTimeout(fail, 12000);
    worker.postMessage({ id: 1, view, level });
  } catch {
    fail();
  }
  return cancel;
}

/** 一条战报，从 viewer 的角度描述。 */
export function describeEvent(e: JunqiEvent, viewer: Side): string {
  const mine = e.side === viewer;
  const name = (k: number | null) => (k === null || k < 0 ? '' : KIND_NAME[k]);
  let text: string;
  if (e.outcome === 'move') {
    const turned =
      e.path.length > 1 &&
      !e.path.every((c) => c % 5 === e.from % 5) &&
      !e.path.every((c) => Math.floor(c / 5) === Math.floor(e.from / 5));
    text = mine
      ? `你的${name(e.ak)}${e.path.length > 1 ? '沿铁路' : ''}行进`
      : `对方${turned ? '工兵沿铁路拐弯' : e.path.length > 1 ? '一子沿铁路' : '一子'}行进`;
  } else if (mine) {
    const foe = name(e.dk);
    const what = foe ? `对方${foe}` : '对方一子';
    text =
      e.outcome === 'flag'
        ? `你的${name(e.ak)}夺下对方军旗！`
        : e.outcome === 'win'
          ? `你的${name(e.ak)}吃掉${what}`
          : e.outcome === 'both'
            ? `你的${name(e.ak)}与${what}同归于尽`
            : `你的${name(e.ak)}进攻失利，阵亡`;
  } else {
    const dk = e.dk ?? -1;
    const foe = name(e.ak);
    const who = foe ? `对方${foe}` : '对方一子';
    text =
      e.outcome === 'flag'
        ? `${who}夺走了你的军旗`
        : dk === MINE
          ? e.outcome === 'win'
            ? `你的地雷被${foe ? who : '对方工兵'}排除`
            : e.outcome === 'both'
              ? `你的地雷被${foe ? who : '对方炸弹'}炸掉`
              : `${who}撞上你的地雷，阵亡`
          : e.outcome === 'win'
            ? `${who}吃掉你的${name(dk)}`
            : e.outcome === 'both'
              ? `${who}与你的${name(dk)}同归于尽`
              : `${who}进攻你的${name(dk)}，被吃掉`;
  }
  for (const s of e.flags)
    text +=
      s === viewer ? '。你的司令阵亡，军旗暴露' : '。对方司令阵亡，亮出军旗';
  return text;
}

/** 双方阵亡的棋子（暗棋里只知道对方损失了几枚，除非看得到）。 */
export function lostPieces(view: JunqiView): [SeenKindList, SeenKindList] {
  const out: [SeenKindList, SeenKindList] = [[], []];
  for (const e of view.log) {
    if (e.outcome === 'move' || e.outcome === 'flag') continue;
    const d = (1 - e.side) as Side;
    if (e.outcome === 'lose' || e.outcome === 'both') out[e.side].push(e.ak);
    if (e.outcome === 'win' || e.outcome === 'both') out[d].push(e.dk ?? -1);
  }
  return out;
}
type SeenKindList = (Kind | -1)[];

export function JunqiPlayers({
  view,
  names,
  viewer,
}: {
  view: JunqiView;
  names: [ReactNode, ReactNode];
  viewer: Side;
}) {
  const lost = lostPieces(view);
  const order: Side[] = [(1 - viewer) as Side, viewer];
  return (
    <div className="jq-side">
      {order.map((p) => (
        <span
          key={p}
          className={`jq-player s${p}${view.phase === 'play' && view.toPlay === p ? ' is-turn' : ''}`}
        >
          <i aria-hidden="true" />
          <strong>{names[p]}</strong>
          <span className="jq-lost">
            {lost[p].length === 0
              ? '无损失'
              : lost[p].every((k) => k < 0)
                ? `阵亡 ${lost[p].length} 子`
                : lost[p]
                    .slice()
                    .sort((a, b) => b - a)
                    .map((k, n) => (
                      <s key={n}>{k < 0 ? '暗子' : KIND_NAME[k as Kind]}</s>
                    ))}
          </span>
        </span>
      ))}
    </div>
  );
}

export function JunqiReport({
  view,
  viewer,
}: {
  view: JunqiView;
  viewer: Side;
}) {
  const items = view.log.slice(-4).reverse();
  if (!items.length) return null;
  return (
    <ol className="jq-report" aria-label="战报">
      {items.map((e) => (
        <li key={e.ply}>
          第 {e.ply + 1} 步 · {describeEvent(e, viewer)}
        </li>
      ))}
    </ol>
  );
}

/** 布阵工具条：预设阵型、随机布阵和违规提示。 */
export function DeployTools({
  layout,
  setLayout,
  children,
  disabled = false,
}: {
  layout: Layout;
  setLayout: (l: Layout) => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { errors } = checkLayout(layout);
  return (
    <>
      <div className="kit-row">
        <select
          aria-label="预设阵型"
          disabled={disabled}
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) setLayout(p.layout.slice());
          }}
        >
          <option value="" disabled>
            预设阵型…
          </option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.note}）
            </option>
          ))}
        </select>
        <button
          type="button"
          data-shortcut="s"
          disabled={disabled}
          onClick={() => setLayout(randomLayout())}
        >
          <Shuffle size={15} aria-hidden="true" /> 随机布阵
        </button>
        {children}
      </div>
      {errors.length > 0 && (
        <p className="jq-errors" role="alert">
          {errors.join('；')}
        </p>
      )}
    </>
  );
}

export const swapLayout = (l: Layout, a: number, b: number): Layout => {
  const next = l.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

export function JunqiGame({ fromExplore = false }: { fromExplore?: boolean }) {
  const [settings, saveSettings] = useLocalRecords(SETTINGS, validateSettings, {
    level: 3,
    side: 0,
    open: false,
  } as Settings);
  const [records, saveRecords] = useLocalRecords(RECORDS, validateRecords, {});
  const [savedLayout, saveLayout] = useLocalRecords<Layout | null>(
    LAYOUT,
    validateLayout,
    null,
  );
  const [draft, setDraft] = useState<Layout | null>(null);
  const layout = draft ?? savedLayout ?? PRESETS[0].layout;
  const setLayout = (l: Layout) => {
    setDraft(l);
    if (checkLayout(l).errors.length === 0) saveLayout(l);
  };
  const [game, setGame] = useState<{
    match: Settings;
    state: JunqiState;
  } | null>(null);
  const [deploying] = useState(() => newGame());
  const recorded = useRef(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [hintFor, setHintFor] = useState<JunqiState | null>(null);
  const [hintError, setHintError] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [retry, setRetry] = useState(0);
  const match = game?.match ?? settings;
  const state = game?.state ?? deploying;
  const human = match.side;
  const ai = (1 - human) as Side;
  const view = useMemo(
    () => maskFor(state, human, match.open),
    [state, human, match.open],
  );
  const aiTurn = state.phase === 'play' && state.toPlay === ai;
  const hinting = hintFor === state && !aiTurn && state.phase === 'play';

  const commit = (next: JunqiState) => {
    setHint(null);
    setHintFor(null);
    setHintError(false);
    setAiError(false);
    setGame({ match, state: next });
    if (next.phase === 'over' && state.phase !== 'over' && !recorded.current) {
      recorded.current = true;
      const cur = records[match.level] ?? { won: 0, played: 0 };
      saveRecords({
        ...records,
        [match.level]: {
          won: cur.won + (next.winner === human ? 1 : 0),
          played: cur.played + 1,
        },
      });
    }
  };
  const commitAi = useEffectEvent(commit);
  useEffect(() => {
    if (!aiTurn) return;
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = requestAi(
      maskFor(state, ai, match.open),
      match.level,
      (r) => {
        try {
          const next = play(state, r.move);
          timer = setTimeout(
            () => commitAi(next),
            Math.max(0, 650 - (Date.now() - t0)),
          );
        } catch {
          setAiError(true);
        }
      },
      () => setAiError(true),
    );
    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [aiTurn, state, ai, match.level, match.open, retry]);
  useEffect(() => {
    if (!hinting) return;
    return requestAi(
      view,
      3,
      (r) => {
        setHintFor(null);
        setHint(r.move);
      },
      () => {
        setHintFor(null);
        setHintError(true);
      },
    );
  }, [hinting, view]);

  const start = () => {
    if (checkLayout(layout).errors.length) return;
    recorded.current = false;
    let s = newGame();
    // AI 自己布阵：它看不到你的阵型。
    s = deploySide(s, ai, randomLayout());
    s = deploySide(s, human, layout);
    setHint(null);
    setHintFor(null);
    setHintError(false);
    setAiError(false);
    setGame({ match: settings, state: s });
  };
  const backToDeploy = () => {
    setGame(null);
    setHint(null);
    setHintFor(null);
    setHintError(false);
    setAiError(false);
  };
  const onMove = (m: Move) => {
    if (aiTurn) return;
    try {
      commit(play(state, m));
    } catch {
      /* 棋盘只提供合法走法 */
    }
  };

  const names: [string, string] = [
    human === 0 ? '你（红）' : `AI（红）`,
    human === 1 ? '你（蓝）' : `AI（蓝）`,
  ];
  const stats = records[match.level];
  const last = view.log.at(-1);
  const status = aiError
    ? 'AI 计算失败，请重试'
    : state.phase === 'deploy'
      ? '布阵：点两枚棋子互换，或拖动交换；排好后点「开战」'
      : aiTurn
        ? 'AI 思考中…'
        : state.phase === 'play'
          ? `轮到你 · ${last ? describeEvent(last, human) : '红方先走'}`
          : '';
  const deployingNow = state.phase === 'deploy';
  return (
    <div className="kit junqi">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            军棋 · 两人陆战棋 · {match.open ? '明棋' : '暗棋'} ·{' '}
            {JUNQI_LEVELS[match.level].name}
          </p>
          <h2 className="kit-sr">军棋</h2>
        </div>
        <a
          className="jq-online-link"
          href={`/games/junqi/online${fromExplore ? '?from=explore' : ''}`}
        >
          和朋友联机 →
        </a>
      </header>
      <div className="jq-layout">
        <div className="jq-top">
          {deployingNow ? (
            <>
              <div className="kit-row">
                <select
                  aria-label="难度"
                  value={settings.level}
                  onChange={(e) =>
                    saveSettings({
                      ...settings,
                      level: Number(e.target.value) as JunqiLevel,
                    })
                  }
                >
                  {(Object.keys(JUNQI_LEVELS).map(Number) as JunqiLevel[]).map(
                    (l) => (
                      <option key={l} value={l}>
                        {JUNQI_LEVELS[l].name}（{JUNQI_LEVELS[l].note}）
                      </option>
                    ),
                  )}
                </select>
                <select
                  aria-label="执子"
                  value={settings.side}
                  onChange={(e) =>
                    saveSettings({
                      ...settings,
                      side: Number(e.target.value) as Side,
                    })
                  }
                >
                  <option value={0}>执红（先走）</option>
                  <option value={1}>执蓝（后走）</option>
                </select>
                <select
                  aria-label="暗棋或明棋"
                  value={settings.open ? 'open' : 'hidden'}
                  onChange={(e) =>
                    saveSettings({
                      ...settings,
                      open: e.target.value === 'open',
                    })
                  }
                >
                  <option value="hidden">暗棋（裁判判子）</option>
                  <option value="open">明棋（全部亮出）</option>
                </select>
              </div>
              <DeployTools layout={layout} setLayout={setLayout}>
                <button
                  type="button"
                  className="kit-primary"
                  data-shortcut="k"
                  disabled={checkLayout(layout).errors.length > 0}
                  onClick={start}
                >
                  <Swords size={15} aria-hidden="true" /> 开战
                </button>
              </DeployTools>
            </>
          ) : (
            <div className="kit-row">
              <button
                type="button"
                onClick={askHintFor(
                  state,
                  aiTurn,
                  hinting,
                  setHintError,
                  setHintFor,
                )}
                disabled={aiTurn || hinting || state.phase !== 'play'}
              >
                <Lightbulb size={15} aria-hidden="true" />{' '}
                {hinting ? '计算中…' : '提示'}
              </button>
              {aiError && (
                <button
                  type="button"
                  onClick={() => (setAiError(false), setRetry((n) => n + 1))}
                >
                  重试 AI
                </button>
              )}
              <button
                type="button"
                onClick={() => commit(resign(state, human))}
                disabled={state.phase !== 'play' || aiTurn}
              >
                <Flag size={15} aria-hidden="true" /> 认输
              </button>
              <button type="button" data-shortcut="r" onClick={backToDeploy}>
                重新布阵
              </button>
              <span className="kit-stats">
                <span>第 {state.ply} 步</span>
                {stats && (
                  <span>
                    本档 {stats.won} 胜 / {stats.played} 局
                  </span>
                )}
              </span>
            </div>
          )}
          <JunqiPlayers view={view} names={names} viewer={human} />
          <p className="kit-brief">
            <output aria-live="polite">{status}</output>
          </p>
          {state.phase === 'over' && (
            <GameResult
              tone={state.winner === human ? 'win' : 'lose'}
              title={
                state.winner === null
                  ? '和棋'
                  : state.winner === human
                    ? '你赢了'
                    : 'AI 赢了'
              }
              actions={[
                { label: '再来一局', primary: true, onClick: backToDeploy },
              ]}
            >
              {resultText(state, human)} · 共 {state.ply} 步 ·
              终局已亮出全部棋子
            </GameResult>
          )}
        </div>
        <div className="jq-stage">
          <JunqiBoard
            view={view}
            viewer={human}
            live={deployingNow || (!aiTurn && state.phase === 'play')}
            onMove={onMove}
            hint={hint}
            deploy={
              deployingNow
                ? {
                    layout,
                    bad: checkLayout(layout).cells,
                    onSwap: (a, b) => setLayout(swapLayout(layout, a, b)),
                  }
                : undefined
            }
          />
          {hintError && (
            <p className="kit-brief">
              <output>提示计算失败，请重试</output>
            </p>
          )}
          {hint && <p className="kit-brief">提示：可以考虑走虚线框里的棋子</p>}
        </div>
        <div className="jq-bottom">
          {!deployingNow && <JunqiReport view={view} viewer={human} />}
          <p className="kit-help">
            {deployingNow
              ? `布阵规则：军旗放在大本营，地雷只能放最后两排，炸弹不能放第一排，行营开局留空。共 ${PIECES} 子。快捷键：S 随机布阵、K 开战。`
              : '点自己的棋子，再点绿点走棋、点红框进攻。工兵在铁路上能拐弯，其他棋子在铁路上只能直走；行营里的棋子不能被攻击。快捷键：R 重新布阵。'}
          </p>
        </div>
      </div>
    </div>
  );
}

function askHintFor(
  state: JunqiState,
  aiTurn: boolean,
  hinting: boolean,
  setHintError: (v: boolean) => void,
  setHintFor: (s: JunqiState) => void,
) {
  return () => {
    if (aiTurn || hinting || state.phase !== 'play') return;
    setHintError(false);
    setHintFor(state);
  };
}

export function resultText(
  state: { reason: JunqiState['reason']; winner: Side | null },
  viewer: Side | null,
) {
  const w = state.winner;
  const who = (s: Side) =>
    viewer === null ? `${SIDE_NAME[s]}方` : s === viewer ? '你' : '对方';
  switch (state.reason) {
    case 'flag':
      return `${who(w!)}夺下了军旗`;
    case 'stuck':
      return `${who((1 - w!) as Side)}已无子可动`;
    case 'resign':
      return `${who((1 - w!) as Side)}认输`;
    case 'draw':
      return `连续 50 回合没有交战，或双方都无子可动，判和`;
    default:
      return '';
  }
}
