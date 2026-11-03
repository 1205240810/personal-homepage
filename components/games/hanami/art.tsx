// 花街七席的原创插画：七位宾客的半身像与七种礼物。纯 SVG，颜色取自 --c，
// 两种主题下都能看清。
import type { ReactNode } from 'react';

const SKIN = '#f3dcc4';
const INK = '#2b2622';

/** Shared bust: shoulders in the guest's colour, a face, then per-guest details. */
function Bust({
  hair,
  front,
  back,
  collar = '#fffaf0',
}: {
  hair: ReactNode;
  front?: ReactNode;
  back?: ReactNode;
  collar?: string;
}) {
  return (
    <>
      {back}
      <path d="M10 64c1-13 10-20 22-20s21 7 22 20z" fill="var(--c)" />
      <path d="M26 45l6 9 6-9" fill="none" stroke={collar} strokeWidth="2.4" />
      <rect x="28.5" y="36" width="7" height="9" rx="3" fill={SKIN} />
      <ellipse cx="32" cy="29" rx="10" ry="11.5" fill={SKIN} />
      <path
        d="M27.6 30.6q1.4 1 2.8 0M33.6 30.6q1.4 1 2.8 0"
        stroke={INK}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M30.5 35.6q1.5.8 3 0"
        stroke="#b5584a"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      {hair}
      {front}
    </>
  );
}

const GUESTS: ReactNode[] = [
  // 琴师：低髻，怀抱长琴。
  <Bust
    key={0}
    hair={
      <>
        <path
          d="M21.5 28c0-9 4.5-14 10.5-14s10.5 5 10.5 14c-2-5-6-7.5-10.5-7.5S23.5 23 21.5 28z"
          fill={INK}
        />
        <circle cx="32" cy="14" r="4.6" fill={INK} />
        <path d="M27 12.5h10" stroke="#d9b25a" strokeWidth="1.4" />
      </>
    }
    front={
      <>
        <rect
          x="6"
          y="51"
          width="52"
          height="7"
          rx="3.5"
          fill="#7a4a2a"
          transform="rotate(-12 32 54)"
        />
        <path
          d="M12 56l40-8.6M12 53.6l40-8.6"
          stroke="#f4e3c1"
          strokeWidth=".6"
          transform="rotate(-1 32 54)"
        />
      </>
    }
  />,
  // 书生：幞头双翅，手持书卷。
  <Bust
    key={1}
    hair={
      <>
        <path d="M21.5 27c0-8 4.5-12 10.5-12s10.5 4 10.5 12z" fill={INK} />
        <rect x="24" y="12" width="16" height="7" rx="2" fill={INK} />
        <path
          d="M24 18l-10 2.6M40 18l10 2.6"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </>
    }
    front={
      <g transform="rotate(-18 44 54)">
        <rect
          x="36"
          y="50"
          width="18"
          height="7"
          rx="3.5"
          fill="#f4ead2"
          stroke="#b49a6a"
        />
        <path d="M40 53.5h10" stroke="#b49a6a" strokeWidth=".8" />
      </g>
    }
  />,
  // 隐士：斗笠，长须。
  <Bust
    key={2}
    hair={
      <>
        <path d="M24 37q8 13 16 0q-2 5-8 5t-8-5z" fill="#e8e4dc" />
        <path
          d="M27 34q5 3 10 0"
          stroke="#e8e4dc"
          strokeWidth="2"
          fill="none"
        />
        <path d="M6 22L32 9l26 13q-26 4-52 0z" fill="#b9935a" />
        <path
          d="M12 21.5L32 11l20 10.5"
          stroke="#8a6a3a"
          strokeWidth=".8"
          fill="none"
        />
      </>
    }
    collar="#d8ccb0"
  />,
  // 画师：束巾，耳后别笔。
  <Bust
    key={3}
    hair={
      <>
        <path
          d="M21.5 29c0-10 4.5-15 10.5-15s10.5 5 10.5 15c-3-6-7-8-10.5-8s-7.5 2-10.5 8z"
          fill={INK}
        />
        <path
          d="M21 22q11-6 22 0"
          stroke="var(--c)"
          strokeWidth="3.4"
          fill="none"
        />
        <path
          d="M43 22l7 6"
          stroke="var(--c)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M42 16l7-9"
          stroke="#7a4a2a"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M49 7l1.6-2.2"
          stroke={INK}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </>
    }
  />,
  // 舞者：双髻，飘带。
  <Bust
    key={4}
    back={
      <path
        d="M4 44q8-10 14-2t14-4"
        stroke="color-mix(in srgb, var(--c) 55%, #fff)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    }
    hair={
      <>
        <path
          d="M21.5 28c0-9 4.5-14 10.5-14s10.5 5 10.5 14c-2-5-6-7-10.5-7s-8.5 2-10.5 7z"
          fill={INK}
        />
        <circle cx="22" cy="15" r="5" fill={INK} />
        <circle cx="42" cy="15" r="5" fill={INK} />
        <circle cx="22" cy="15" r="1.8" fill="#e05a6a" />
        <circle cx="42" cy="15" r="1.8" fill="#e05a6a" />
      </>
    }
  />,
  // 剑客：高马尾，背负长剑。
  <Bust
    key={5}
    back={
      <>
        <path
          d="M50 10L18 60"
          stroke="#59606a"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M47 15l6 3"
          stroke="#c9a347"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    }
    hair={
      <>
        <path
          d="M21.5 28c0-9 4.5-14 10.5-14s10.5 5 10.5 14c-1-3-3-6-6-7l-9 1c-3 1-5 3-6 6z"
          fill={INK}
        />
        <path d="M33 14q8-6 12 4q-4-2-7-1z" fill={INK} />
        <rect x="29" y="11.5" width="7" height="3" rx="1.5" fill="var(--c)" />
      </>
    }
  />,
  // 名伶：凤冠珠饰。
  <Bust
    key={6}
    hair={
      <>
        <path
          d="M21.5 30c0-10 4.5-15 10.5-15s10.5 5 10.5 15c-2-6-6-8.5-10.5-8.5S23.5 24 21.5 30z"
          fill={INK}
        />
        <path d="M19 19q13-14 26 0q-13-5-26 0z" fill="#d9b25a" />
        <circle cx="32" cy="9.5" r="2.4" fill="#e05a6a" />
        <circle cx="24" cy="13" r="1.6" fill="#f6efe0" />
        <circle cx="40" cy="13" r="1.6" fill="#f6efe0" />
        <path
          d="M20 20v9M44 20v9"
          stroke="#f6efe0"
          strokeWidth="1.2"
          strokeDasharray="1.6 1.4"
        />
      </>
    }
  />,
];

/** A guest's bust portrait. */
export function GuestPortrait({
  p,
  className,
}: {
  p: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {GUESTS[p]}
    </svg>
  );
}

const GIFT_ART: ReactNode[] = [
  // 冰弦：一卷丝弦。
  <g key={0}>
    <circle
      cx="24"
      cy="24"
      r="13"
      fill="none"
      stroke="var(--c)"
      strokeWidth="2.4"
    />
    <circle
      cx="24"
      cy="24"
      r="9"
      fill="none"
      stroke="var(--c)"
      strokeWidth="1.4"
      opacity=".7"
    />
    <circle
      cx="24"
      cy="24"
      r="5"
      fill="none"
      stroke="var(--c)"
      strokeWidth="1.2"
      opacity=".5"
    />
    <path
      d="M36 28q6 4 6 12"
      stroke="var(--c)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
    />
  </g>,
  // 徽墨：墨锭与描金纹。
  <g key={1}>
    <rect x="15" y="8" width="18" height="32" rx="2.5" fill="var(--c)" />
    <rect
      x="18"
      y="12"
      width="12"
      height="16"
      rx="1"
      fill="none"
      stroke="#e2c26a"
      strokeWidth="1.2"
    />
    <path
      d="M21 17q3 3 6 0M21 22q3 3 6 0"
      stroke="#e2c26a"
      strokeWidth="1"
      fill="none"
    />
    <path d="M36 34q2 4 0 6q-2-2 0-6z" fill="var(--c)" opacity=".7" />
  </g>,
  // 团茶：压纹茶饼与一片叶。
  <g key={2}>
    <circle
      cx="24"
      cy="26"
      r="14"
      fill="color-mix(in srgb, var(--c) 30%, #fff8ea)"
      stroke="var(--c)"
      strokeWidth="2"
    />
    <circle
      cx="24"
      cy="26"
      r="8"
      fill="none"
      stroke="var(--c)"
      strokeWidth="1.2"
      strokeDasharray="2 2"
    />
    <path d="M30 9q8 0 9 8q-8 1-9-8z" fill="var(--c)" />
    <path d="M30 9l9 8" stroke="#fff8ea" strokeWidth=".8" />
  </g>,
  // 纨扇：圆扇与扇柄。
  <g key={3}>
    <circle
      cx="24"
      cy="20"
      r="13"
      fill="color-mix(in srgb, var(--c) 18%, #fffaf0)"
      stroke="var(--c)"
      strokeWidth="2"
    />
    <path
      d="M17 24q4-9 9-3t6-4"
      stroke="var(--c)"
      strokeWidth="1.3"
      fill="none"
    />
    <circle cx="29" cy="15" r="2" fill="var(--c)" opacity=".6" />
    <path
      d="M24 33v11"
      stroke="#7a4a2a"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path d="M24 44q-2 2 0 4" stroke="var(--c)" strokeWidth="1.2" fill="none" />
  </g>,
  // 玉簪：长簪与花头。
  <g key={4}>
    <path
      d="M12 40L34 14"
      stroke="color-mix(in srgb, var(--c) 70%, #fff)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    {[0, 72, 144, 216, 288].map((r) => (
      <ellipse
        key={r}
        cx="36"
        cy="8"
        rx="2.6"
        ry="4.4"
        fill="var(--c)"
        transform={`rotate(${r} 36 12)`}
      />
    ))}
    <circle cx="36" cy="12" r="2" fill="#f6e3a0" />
    <path
      d="M30 22q-4 6-2 12"
      stroke="var(--c)"
      strokeWidth="1"
      fill="none"
      strokeDasharray="1.4 1.6"
    />
  </g>,
  // 酒壶：葫芦与系绳。
  <g key={5}>
    <circle cx="24" cy="17" r="7" fill="var(--c)" />
    <ellipse cx="24" cy="33" rx="11" ry="11" fill="var(--c)" />
    <rect x="21.5" y="6" width="5" height="5" rx="1" fill="#7a4a2a" />
    <path d="M17 23q7 3 14 0" stroke="#e2c26a" strokeWidth="1.8" fill="none" />
    <path d="M31 24q6 4 4 10" stroke="#e2c26a" strokeWidth="1.2" fill="none" />
    <ellipse cx="20" cy="30" rx="2.4" ry="4" fill="#fff" opacity=".25" />
  </g>,
  // 明珠：锦盒托着一颗珠。
  <g key={6}>
    <path d="M8 34h32l-4 8H12z" fill="color-mix(in srgb, var(--c) 75%, #000)" />
    <path d="M8 34q16-6 32 0" fill="var(--c)" />
    <circle
      cx="24"
      cy="23"
      r="9"
      fill="#fbf6ee"
      stroke="color-mix(in srgb, var(--c) 40%, #ccc)"
    />
    <circle cx="21" cy="20" r="3" fill="#fff" />
    <circle
      cx="24"
      cy="23"
      r="12.5"
      fill="none"
      stroke="#e8c96a"
      strokeWidth=".8"
      strokeDasharray="1 3"
    />
  </g>,
];

/** One gift's icon. */
export function GiftIcon({ g, className }: { g: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {GIFT_ART[g]}
    </svg>
  );
}

/** The favour ribbon (彩绸) — a knotted silk bow. */
export function Ribbon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 12L4 3q-3 9 0 18zM20 12l16-9q3 9 0 18z" fill="#c8323c" />
      <path d="M20 12l-6 12h4zM20 12l6 12h-4z" fill="#a3242d" />
      <circle cx="20" cy="12" r="3.6" fill="#e6b84a" />
    </svg>
  );
}
