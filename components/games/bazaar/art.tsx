// 刺桐市集原创插画：六种货与骆驼。纯 SVG，主色取自 --c，两种主题通用。
const L = 'color-mix(in srgb, var(--c) 45%, #fff)';
const D = 'color-mix(in srgb, var(--c) 65%, #000)';

const ART = [
  // 明珠：蚌壳托珠
  <g key={0}>
    <path d="M6 30c2-12 12-18 18-18s16 6 18 18z" fill={D} />
    <path
      d="M10 30c2-9 8-14 14-14s12 5 14 14"
      fill="none"
      stroke={L}
      strokeWidth="1.2"
    />
    <path d="M24 16v14M16 19l4 11M32 19l-4 11" stroke={L} strokeWidth="1" />
    <path d="M4 32c6 6 34 6 40 0l-2-2H6z" fill="var(--c)" />
    <circle
      cx="24"
      cy="27"
      r="6.5"
      fill="#fbf3ee"
      stroke={D}
      strokeWidth=".8"
    />
    <circle cx="22" cy="25" r="2" fill="#fff" />
  </g>,
  // 金锭：元宝
  <g key={1}>
    <ellipse cx="24" cy="38" rx="17" ry="3" fill="rgb(0 0 0 / .18)" />
    <path
      d="M5 22c5 2 9 3 11 3h16c2 0 6-1 11-3-1 9-7 15-21 15S6 31 5 22z"
      fill="var(--c)"
    />
    <path d="M14 25c0-6 4-10 10-10s10 4 10 10z" fill={L} />
    <path
      d="M17 22c1-3 4-5 7-5"
      fill="none"
      stroke="#fff"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path d="M9 27c4 4 9 6 15 6" fill="none" stroke={D} strokeWidth="1" />
  </g>,
  // 银锭：船形银锭叠放
  <g key={2}>
    <path d="M8 34h32l-3 6H11z" fill={D} />
    <path d="M6 26h36l-4 8H10z" fill="var(--c)" />
    <path d="M10 26c2-4 8-6 14-6s12 2 14 6z" fill={L} />
    <path d="M14 17h20l-3 4H17z" fill="var(--c)" />
    <path d="M16 17c2-3 5-4 8-4s6 1 8 4z" fill={L} />
    <path d="M12 29h24" stroke="#fff" strokeOpacity=".6" strokeWidth="1" />
  </g>,
  // 丝绸：卷起的绸匹
  <g key={3}>
    <path d="M8 18h26l8 20H16z" fill={L} />
    <path d="M8 18h26l8 20H16z" fill="none" stroke={D} strokeWidth=".8" />
    <path
      d="M12 24h22M14 30h22"
      stroke="var(--c)"
      strokeWidth="1.2"
      strokeDasharray="2 3"
    />
    <ellipse cx="10" cy="20" rx="6" ry="9" fill="var(--c)" />
    <ellipse cx="10" cy="20" rx="2.6" ry="4" fill={D} />
    <path
      d="M6 14c2-2 6-2 8 0"
      stroke="#fff"
      strokeOpacity=".7"
      strokeWidth="1"
      fill="none"
    />
  </g>,
  // 香料：香料罐与胡椒
  <g key={4}>
    <path d="M14 14h20v4H14z" fill={D} />
    <path
      d="M12 18h24c2 4 3 9 2 14-1 5-6 7-14 7s-13-2-14-7c-1-5 0-10 2-14z"
      fill="var(--c)"
    />
    <path d="M14 24c6 2 14 2 20 0" stroke={L} strokeWidth="1.4" fill="none" />
    <path
      d="M18 30l3-3 3 3 3-3 3 3"
      stroke="#fff"
      strokeOpacity=".6"
      strokeWidth="1"
      fill="none"
    />
    <circle cx="40" cy="36" r="2" fill={D} />
    <circle cx="36" cy="38" r="1.6" fill={D} />
    <circle cx="8" cy="37" r="1.8" fill={D} />
  </g>,
  // 茶叶：茶饼与嫩芽
  <g key={5}>
    <ellipse cx="24" cy="31" rx="17" ry="7" fill={D} />
    <ellipse cx="24" cy="29" rx="17" ry="7" fill="var(--c)" />
    <ellipse cx="24" cy="29" rx="5" ry="2" fill={D} />
    <path d="M24 22c-2-7 2-12 8-13-1 6-3 10-8 13z" fill="#5e9a5a" />
    <path d="M24 22c0-5-3-8-8-9 0 5 3 8 8 9z" fill="#7cb46e" />
    <path
      d="M12 29c3-2 6-2 9 0M27 31c3-2 6-2 9 0"
      stroke={L}
      strokeWidth="1"
      fill="none"
    />
  </g>,
  // 骆驼
  <g key={6}>
    <ellipse cx="24" cy="41" rx="16" ry="2.4" fill="rgb(0 0 0 / .18)" />
    <path
      d="M8 22c-1-3 1-6 4-6 2 0 3 2 3 4l1 5c2-4 5-7 8-7 3 0 4 2 5 4 1-2 3-3 5-2 3 1 4 4 4 8l1 3c0 3-2 4-4 4v6h-2v-6l-2 6h-2v-6H20v6h-2l-1-6-2 6h-2l1-8c-2-1-3-3-3-5z"
      fill="var(--c)"
    />
    <path d="M10 18a1.2 1.2 0 1 0 0 .1" fill={D} />
    <path d="M22 22c3-3 8-3 10 0" stroke={L} strokeWidth="1.2" fill="none" />
    <path d="M18 27h18" stroke="#b9573a" strokeWidth="3" />
    <path
      d="M18 27h18"
      stroke="#e8c36a"
      strokeWidth="1"
      strokeDasharray="2 2"
    />
  </g>,
];

export function WareArt({ c }: { c: number }) {
  return (
    <svg className="bz-art" viewBox="0 0 48 44" aria-hidden="true">
      {ART[c]}
    </svg>
  );
}
