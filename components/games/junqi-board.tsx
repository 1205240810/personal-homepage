'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CELLS,
  FLAG,
  KIND_MARK,
  KIND_NAME,
  RAIL,
  ROAD,
  canMoveKind,
  cellKindName,
  cellName,
  isCamp,
  isHq,
  slotsFor,
  targetsFrom,
  xOf,
  yOf,
  type JunqiEvent,
  type JunqiView,
  type Kind,
  type Layout,
  type Move,
  type SeenPiece,
  type Side,
} from '@/lib/games/junqi';
import { useBoardViewport } from './kit';
import './junqi.css';

// 棋盘坐标（viewBox 单位）：列距 100，行距 56，山界额外 60。
const BW = 500;
const BH = 756;
const cx = (x: number) => 50 + x * 100;
const cy = (y: number) => 40 + y * 56 + (y >= 6 ? 60 : 0);
const PW = 74;
const PH = 40;

/** 显示位置：自己永远在下方，蓝方视角把棋盘转 180°。 */
const disp = (i: number, flip: boolean) => (flip ? CELLS - 1 - i : i);
const box = (i: number, flip: boolean, w = PW, h = PH): CSSProperties => {
  const d = disp(i, flip);
  return {
    left: `${((cx(xOf(d)) - w / 2) / BW) * 100}%`,
    top: `${((cy(yOf(d)) - h / 2) / BH) * 100}%`,
    width: `${(w / BW) * 100}%`,
    height: `${(h / BH) * 100}%`,
  };
};

// 静态的棋盘线条（棋盘中心对称，翻转后图样不变）。
const SEGMENTS = (() => {
  const rail: [number, number][] = [];
  const road: [number, number][] = [];
  for (let a = 0; a < CELLS; a++)
    for (const b of ROAD[a])
      if (a < b) (RAIL[a].includes(b) ? rail : road).push([a, b]);
  return { rail, road };
})();
const line = ([a, b]: [number, number]) => ({
  x1: cx(xOf(a)),
  y1: cy(yOf(a)),
  x2: cx(xOf(b)),
  y2: cy(yOf(b)),
});

function BoardArt() {
  const stations = Array.from({ length: CELLS }, (_, i) => i);
  return (
    <svg
      className="jq-art"
      viewBox={`0 0 ${BW} ${BH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="jq-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.32"
            numOctaves="3"
            seed="7"
          />
          <feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0 0.07  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect className="jq-slab" x="0" y="0" width={BW} height={BH} rx="14" />
      <rect
        className="jq-grain"
        x="0"
        y="0"
        width={BW}
        height={BH}
        rx="14"
        filter="url(#jq-grain)"
      />
      <rect
        className="jq-groove"
        x="12"
        y="12"
        width={BW - 24}
        height={BH - 24}
        rx="9"
      />
      {/* 山界 */}
      <g className="jq-front">
        <rect
          x="12"
          y={cy(5) + 24}
          width={BW - 24}
          height={cy(6) - cy(5) - 48}
        />
        {[1, 3].map((x) => (
          <path
            key={x}
            d={`M${cx(x) - 46} ${cy(5) + 74}l18-20 12 10 16-22 16 22 12-10 18 20z`}
            className="jq-ridge"
          />
        ))}
        <text x={cx(1)} y={cy(5) + 64} className="jq-front-word">
          山
        </text>
        <text x={cx(3)} y={cy(5) + 64} className="jq-front-word">
          界
        </text>
      </g>
      {SEGMENTS.road.map((s) => (
        <line key={`r${s[0]}-${s[1]}`} {...line(s)} className="jq-road" />
      ))}
      {SEGMENTS.rail.map((s) => (
        <g key={`t${s[0]}-${s[1]}`}>
          <line {...line(s)} className="jq-rail-bed" />
          <line {...line(s)} className="jq-rail-gap" />
          <line {...line(s)} className="jq-rail-tie" />
        </g>
      ))}
      {stations.map((i) => {
        const x = cx(xOf(i));
        const y = cy(yOf(i));
        if (isCamp(i))
          return (
            <g key={i} className="jq-camp">
              <circle cx={x} cy={y} r="27" />
              <circle cx={x} cy={y} r="21" className="inner" />
            </g>
          );
        if (isHq(i))
          return (
            <g key={i} className="jq-hq">
              <path
                d={`M${x - 46} ${y + 25}v-38q0-21 22-21h48q22 0 22 21v38z`}
              />
              <text x={x} y={y - 23} className="jq-hq-word">
                大本营
              </text>
            </g>
          );
        return (
          <rect
            key={i}
            x={x - PW / 2 - 2}
            y={y - PH / 2 - 2}
            width={PW + 4}
            height={PH + 4}
            rx="6"
            className="jq-station"
          />
        );
      })}
    </svg>
  );
}

/** 一枚棋子：明子刻字，暗子只有背面。 */
export function JunqiPiece({
  piece,
  className = '',
  style,
}: {
  piece: SeenPiece;
  className?: string;
  style?: CSSProperties;
}) {
  const hidden = piece.k < 0;
  return (
    <span
      className={`jq-piece s${piece.s}${hidden ? ' is-back' : ` k${piece.k}`} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {hidden ? <i className="jq-seal" /> : <b>{KIND_MARK[piece.k as Kind]}</b>}
    </span>
  );
}

const OUTCOME_TAG: Record<Exclude<JunqiEvent['outcome'], 'move'>, string> = {
  win: '吃子',
  lose: '受挫',
  both: '同归于尽',
  flag: '夺旗',
};

function deployBoard(
  view: JunqiView,
  viewer: Side,
  layout: Layout,
): (SeenPiece | null)[] {
  const opp = (1 - viewer) as Side;
  const board = view.board.map((p) => (p && p.s === opp ? p : null));
  slotsFor(viewer).forEach((c, slot) => {
    board[c] = { s: viewer, k: layout[slot], id: c };
  });
  if (!view.ready[opp])
    for (const c of slotsFor(opp)) board[c] = { s: opp, k: -1, id: c };
  return board;
}

export type DeployProps = {
  layout: Layout;
  bad: number[];
  onSwap: (a: number, b: number) => void;
};

/**
 * 军棋棋盘。对局中：点自己能动的棋子，再点亮起的格子走棋 / 进攻；
 * 布阵时：点两枚己方棋子互换，或直接拖到另一枚上。
 */
export function JunqiBoard({
  view,
  viewer,
  live,
  onMove,
  hint,
  deploy,
  positionKey,
  label = '军棋棋盘',
}: {
  view: JunqiView;
  viewer: Side;
  live: boolean;
  onMove?: (m: Move) => void;
  hint?: Move | null;
  deploy?: DeployProps;
  /** A server position changes on an action, not on presence-only broadcasts. */
  positionKey?: string | number;
  label?: string;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  useBoardViewport(ref);
  const flip = viewer === 1;
  const position = positionKey ?? view;
  const layout = deploy?.layout;
  const interaction = useMemo(
    () => ({ position, live, viewer, layout }),
    [position, live, viewer, layout],
  );
  const [sel, setSel] = useState<{ key: unknown; cell: number } | null>(null);
  const [dragState, setDrag] = useState<{
    key: object;
    slot: number;
    x: number;
    y: number;
    over: number | null;
  } | null>(null);
  const press = useRef<{
    key: object;
    slot: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const drag = dragState?.key === interaction ? dragState : null;
  const mySlots = slotsFor(viewer);
  const slotOf = (cell: number) => mySlots.indexOf(cell);

  // 布阵时用当前阵型画己方，对方半场显示背面。
  const board = deploy ? deployBoard(view, viewer, deploy.layout) : view.board;
  // 选中状态跟着局面走：换了局面就自动作废。
  const selKey = interaction;
  const selected = sel && sel.key === selKey ? sel.cell : null;
  const choose = (cell: number | null) =>
    setSel(cell === null ? null : { key: selKey, cell });
  const canAct =
    live && !deploy && view.phase === 'play' && view.toPlay === viewer;
  const targets =
    canAct && selected !== null ? targetsFrom(board, selected) : new Map();
  const movable = (i: number) => {
    const p = board[i];
    return canAct && !!p && p.s === viewer && targetsFrom(board, i).size > 0;
  };
  const last = view.log.at(-1);
  const badCells = new Set((deploy?.bad ?? []).map((s) => mySlots[s]));

  const click = (i: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (deploy) {
      if (!live) return;
      const slot = slotOf(i);
      if (slot < 0) return;
      if (selected === null) return choose(i);
      if (selected === i) return choose(null);
      deploy.onSwap(slotOf(selected), slot);
      return choose(null);
    }
    if (!canAct) return;
    if (selected !== null && targets.has(i)) {
      choose(null);
      onMove?.({ from: selected, to: i });
      return;
    }
    if (movable(i)) return choose(selected === i ? null : i);
    choose(null);
  };

  const cellAt = (x: number, y: number) => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('[data-jq-cell]');
    return el ? Number(el.dataset.jqCell) : null;
  };

  const pieces: { p: SeenPiece; i: number }[] = [];
  board.forEach((p, i) => p && pieces.push({ p, i }));
  pieces.sort((a, b) => a.p.id - b.p.id);

  // 交战动画：从战报最后一条画出阵亡的棋子（在目标格碎裂淡出）。
  const ghosts: { p: SeenPiece; key: string; cls: string }[] = [];
  if (last && last.outcome !== 'move' && !deploy) {
    const a: SeenPiece = { s: last.side, k: last.ak, id: last.aid };
    const d: SeenPiece | null =
      last.dk === null || last.did === null
        ? null
        : { s: (1 - last.side) as Side, k: last.dk, id: last.did };
    if (last.outcome === 'lose' || last.outcome === 'both')
      ghosts.push({ p: a, key: `a${last.ply}`, cls: 'is-attacker' });
    if (d && (last.outcome === 'win' || last.outcome === 'both'))
      ghosts.push({ p: d, key: `d${last.ply}`, cls: 'is-defender' });
  }

  const status = deploy
    ? '布阵：点两枚棋子互换位置，或把棋子拖到另一枚上'
    : canAct
      ? '点自己的棋子，再点亮起的格子'
      : '';
  return (
    <div className={`jq-scene${flip ? ' is-flipped' : ''}`}>
      <fieldset
        ref={ref}
        className={`jq-board${deploy ? ' is-deploy' : ''}${canAct || (deploy && live) ? '' : ' is-idle'}`}
        aria-label={`${label}${status ? `。${status}` : ''}`}
      >
        <BoardArt />
        {last && !deploy && (
          <>
            <i
              className="jq-trace is-from"
              style={box(last.from, flip, 34, 34)}
            />
            <i
              key={`to${last.ply}`}
              className={`jq-trace is-to is-${last.outcome}`}
              style={box(last.to, flip, PW + 8, PH + 8)}
            />
          </>
        )}
        {Array.from({ length: CELLS }, (_, i) => {
          const p = board[i];
          const target = targets.has(i);
          const mine = p?.s === viewer;
          const can = deploy ? live && mine : target || movable(i);
          const hinted = hint && (hint.from === i || hint.to === i);
          const what = p
            ? p.k >= 0
              ? `${p.s === viewer ? '我方' : '对方'}${KIND_NAME[p.k as Kind]}`
              : '对方暗子'
            : '空';
          return (
            <button
              key={i}
              type="button"
              data-jq-cell={i}
              className={`jq-cell${target ? (p ? ' is-attack' : ' is-target') : ''}${selected === i ? ' is-selected' : ''}${hinted ? ' is-hint' : ''}${badCells.has(i) ? ' is-bad' : ''}${drag?.over === i && drag.slot !== slotOf(i) ? ' is-over' : ''}`}
              style={box(i, flip, 96, 54)}
              tabIndex={can ? 0 : -1}
              aria-disabled={!can || undefined}
              aria-pressed={selected === i || undefined}
              aria-label={`${cellName(i, viewer)} ${cellKindName(i)} ${what}${target ? (p ? ' 可进攻' : ' 可走') : ''}`}
              onClick={() => click(i)}
              onPointerDown={(e) => {
                if (!deploy || !live || !mine || e.button > 0) return;
                press.current = {
                  key: interaction,
                  slot: slotOf(i),
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                };
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* 测试环境没有指针捕获 */
                }
              }}
              onPointerMove={(e) => {
                const pr = press.current;
                if (!pr || pr.key !== interaction || !deploy || !live) return;
                if (
                  !pr.moved &&
                  Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 8
                )
                  return;
                pr.moved = true;
                setDrag({
                  key: interaction,
                  slot: pr.slot,
                  x: e.clientX,
                  y: e.clientY,
                  over: cellAt(e.clientX, e.clientY),
                });
              }}
              onPointerUp={(e) => {
                const pr = press.current;
                press.current = null;
                if (!pr?.moved || pr.key !== interaction || !deploy || !live)
                  return;
                setDrag(null);
                suppressClick.current = true;
                // 触屏的 click 可能不触发：稍后自动复位。
                setTimeout(() => (suppressClick.current = false), 0);
                const over = cellAt(e.clientX, e.clientY);
                const slot = over === null ? -1 : slotOf(over);
                if (slot >= 0 && slot !== pr.slot)
                  deploy?.onSwap(pr.slot, slot);
                choose(null);
              }}
              onPointerCancel={() => {
                press.current = null;
                setDrag(null);
              }}
            />
          );
        })}
        {pieces.map(({ p, i }) => (
          <JunqiPiece
            key={p.id}
            piece={p}
            className={`${selected === i ? 'is-selected' : ''}${movable(i) && selected === null ? ' is-ready' : ''}${drag?.slot === slotOf(i) && p.s === viewer && deploy ? ' is-lifted' : ''}${p.k === FLAG && view.flagShown[p.s] && p.s !== viewer ? ' is-exposed' : ''}${!deploy && p.s === viewer && !canMoveKind(p.k < 0 ? 3 : p.k) ? ' is-fixed' : ''}`}
            style={box(i, flip)}
          />
        ))}
        {ghosts.map((g) => (
          <JunqiPiece
            key={g.key}
            piece={g.p}
            className={`is-ghost ${g.cls}`}
            style={box(last!.to, flip)}
          />
        ))}
        {last && last.outcome !== 'move' && !deploy && (
          <span
            key={`clash${last.ply}`}
            className={`jq-clash is-${last.outcome}`}
            style={box(last.to, flip, 120, 70)}
            aria-hidden="true"
          >
            <i />
            <em>{OUTCOME_TAG[last.outcome]}</em>
          </span>
        )}
      </fieldset>
      {drag && deploy && (
        <JunqiPiece
          piece={{ s: viewer, k: deploy.layout[drag.slot], id: -1 }}
          className="is-floating"
          style={{ left: drag.x, top: drag.y }}
        />
      )}
    </div>
  );
}
