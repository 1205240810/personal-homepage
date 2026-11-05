// 锦绣织造原创插画：线轴、三档织品（丝绞、团扇、锦袍）与贵客半身像。纯 SVG，主色取自 --c。
const L = 'color-mix(in srgb, var(--c) 45%, #fff)';
const D = 'color-mix(in srgb, var(--c) 60%, #000)';

/** 线轴：两端木盘，中间绕满丝线。 */
export function Spool() {
  return (
    <svg className="bc-spool" viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="20" cy="35" rx="13" ry="3" fill="rgb(0 0 0 / .2)" />
      <rect x="9" y="8" width="22" height="24" rx="3" fill="var(--c)" />
      <path
        d="M9 11h22M9 14h22M9 17h22M9 20h22M9 23h22M9 26h22M9 29h22"
        stroke={D}
        strokeWidth=".7"
        opacity=".55"
      />
      <path d="M12 9v22" stroke={L} strokeWidth="2.2" opacity=".7" />
      <rect
        x="5"
        y="4"
        width="30"
        height="5"
        rx="2.5"
        className="bc-spool-wood"
      />
      <rect
        x="5"
        y="31"
        width="30"
        height="5"
        rx="2.5"
        className="bc-spool-wood"
      />
      <path
        d="M31 22c4 2 5 6 3 10"
        stroke="var(--c)"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

const PRODUCTS = [
  // 作坊：一绞丝线
  <g key={0}>
    <path d="M14 8c-6 8-6 24 0 30h8c6-6 6-22 0-30z" fill="var(--c)" />
    <path
      d="M14 8c4 8 4 22 0 30M18 8c3 8 3 22 0 30M22 8c-2 8-2 22 0 30"
      stroke={D}
      strokeWidth=".8"
      fill="none"
      opacity=".6"
    />
    <path d="M10 20h16v4H10z" fill="#f5e6c4" />
    <path d="M10 22h16" stroke="#b4432f" strokeWidth=".8" />
  </g>,
  // 绣庄：绣花团扇
  <g key={1}>
    <path
      d="M18 34v8"
      stroke="#8a6040"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <circle
      cx="18"
      cy="20"
      r="14"
      fill="#fbf6ea"
      stroke="var(--c)"
      strokeWidth="2.4"
    />
    <circle cx="18" cy="20" r="11" fill="none" stroke={L} strokeWidth=".8" />
    <path
      d="M10 26c4-2 6-6 8-12 2 6 4 10 8 12"
      stroke={D}
      strokeWidth="1"
      fill="none"
    />
    <circle cx="14" cy="16" r="2.6" fill="var(--c)" />
    <circle cx="22" cy="14" r="2" fill="var(--c)" opacity=".8" />
    <circle cx="20" cy="22" r="1.6" fill={D} />
    <path d="M17 43l1 3 1-3" stroke="var(--c)" strokeWidth="1" fill="none" />
  </g>,
  // 名品：锦袍
  <g key={2}>
    <path d="M12 6h12l4 4 8 6-4 7-4-3v24H8V20l-4 3-4-7 8-6z" fill="var(--c)" />
    <path d="M14 6l4 8 4-8" fill="none" stroke="#f5d58a" strokeWidth="1.4" />
    <path d="M18 14v30" stroke="#f5d58a" strokeWidth="1" />
    <path d="M8 36h20M8 39h20" stroke="#f5d58a" strokeWidth="1" />
    <circle cx="13" cy="26" r="3" fill="none" stroke={L} strokeWidth="1" />
    <circle cx="23" cy="26" r="3" fill="none" stroke={L} strokeWidth="1" />
    <path
      d="M10 42c3-2 5 2 8 0s5-2 8 0"
      stroke={L}
      strokeWidth="1"
      fill="none"
    />
  </g>,
];

export function ProductArt({ tier }: { tier: number }) {
  return (
    <svg className="bc-art" viewBox="0 0 36 48" aria-hidden="true">
      {PRODUCTS[tier]}
    </svg>
  );
}

const HATS = [
  <path key={0} d="M12 9h16l-2-5H14zM8 10h24v2H8z" />,
  <path key={1} d="M13 10c0-6 14-6 14 0zM6 9h8v2H6zM26 9h8v2h-8z" />,
  <path key={2} d="M14 10l6-7 6 7zM19 3h2v-2h-2z" />,
  <path key={3} d="M11 10c1-5 5-7 9-7s8 2 9 7zM18 2h4v3h-4z" />,
  <path
    key={4}
    d="M12 11c0-4 3-7 8-7s8 3 8 7c-2-1-5-2-8-2s-6 1-8 2zM26 5c3-1 5 0 6 2"
  />,
];

/** 贵客：官帽各异的半身像。 */
export function Guest({ id }: { id: number }) {
  return (
    <svg className="bc-guest" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M6 40c1-9 7-14 14-14s13 5 14 14z" className="bc-guest-robe" />
      <path d="M16 27l4 6 4-6" fill="none" stroke="#f5d58a" strokeWidth="1.2" />
      <ellipse cx="20" cy="18" rx="7" ry="8" fill="#f3dcc4" />
      <path
        d="M17 19q1 .8 2 0M21 19q1 .8 2 0"
        stroke="#2b2622"
        strokeWidth=".9"
        fill="none"
      />
      <g className="bc-guest-hat">{HATS[id % 5]}</g>
    </svg>
  );
}
