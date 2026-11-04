// 丝路远行原创插画：五站地标与驼队契约。纯 SVG，颜色取自 --c，两种主题通用。
const SCENES = [
  // 长安：城楼
  <g key={0}>
    <path d="M6 52h52v6H6z" />
    <path
      d="M12 52V38h40v14h-8v-6a4 4 0 0 0-8 0v6h-8v-6a4 4 0 0 0-8 0v6z"
      opacity=".85"
    />
    <path d="M8 38l24-10 24 10z" />
    <path d="M18 28h28v-4H18z" opacity=".8" />
    <path d="M14 24l18-9 18 9z" />
    <path d="M31 15h2v-5h-2z" />
  </g>,
  // 敦煌：沙丘与石窟
  <g key={1}>
    <path d="M0 58c10-14 22-20 34-20s22 8 30 20z" opacity=".55" />
    <path d="M10 58V30l8-6h28l8 6v28z" opacity=".9" />
    <path
      d="M20 40a4 4 0 0 1 8 0v8h-8zM36 40a4 4 0 0 1 8 0v8h-8z"
      fill="var(--ex-card)"
    />
    <path d="M26 30a6 6 0 0 1 12 0v6H26z" fill="var(--ex-card)" />
    <circle cx="50" cy="14" r="5" opacity=".6" />
  </g>,
  // 天山：雪峰
  <g key={2}>
    <path d="M0 58l18-30 10 12 12-24 24 42z" />
    <path d="M40 16l-5 10 4-2 3 4 3-3 4 2z" fill="var(--ex-card)" />
    <path d="M18 28l-4 7 4-2 3 3 2-2z" fill="var(--ex-card)" />
    <path d="M0 58c12-6 24-6 32-2s20 4 32-2v4H0z" opacity=".5" />
  </g>,
  // 于阗：玉河与玉璧
  <g key={3}>
    <circle cx="32" cy="28" r="14" />
    <circle cx="32" cy="28" r="5" fill="var(--ex-card)" />
    <path
      d="M22 22a12 12 0 0 1 8-6"
      fill="none"
      stroke="var(--ex-card)"
      strokeWidth="1.6"
      opacity=".7"
    />
    <path d="M0 50c10-4 18 4 32 0s22-4 32 0v8H0z" opacity=".55" />
    <path
      d="M0 54c10-3 18 3 32 0s22-3 32 0"
      fill="none"
      stroke="var(--ex-card)"
      strokeWidth="1"
    />
  </g>,
  // 波斯：穹顶
  <g key={4}>
    <path d="M14 58V36h36v22z" opacity=".85" />
    <path d="M18 36c0-10 6-16 14-20 8 4 14 10 14 20z" />
    <path d="M31 16v-6h2v6z" />
    <path d="M27 58v-10a5 5 0 0 1 10 0v10z" fill="var(--ex-card)" />
    <path d="M8 58V30h4v28zM52 58V30h4v28z" opacity=".7" />
    <circle cx="10" cy="28" r="2.4" />
    <circle cx="54" cy="28" r="2.4" />
  </g>,
];

/** 牌面插画：底部地标剪影，契约牌换成驼队。 */
export function RouteArt({ r, wager }: { r: number; wager?: boolean }) {
  return (
    <svg
      className="ex-art"
      viewBox="0 0 64 60"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      {wager ? (
        <g>
          <path d="M0 58c14-6 30-8 64-2v4H0z" opacity=".45" />
          <path d="M14 44c-1-5 2-9 6-10 1-4 4-6 6-4 2-3 5-3 6 0 3 0 6 3 6 7l3-6 3 1-2 8c0 3-2 4-4 4v8h-2v-7h-8v7h-2v-7c-3 0-5-1-6-3l-1 10h-2z" />
          <path
            d="M38 50c-1-4 1-7 4-8 1-3 3-4 5-3 2-2 4-2 5 0 2 0 4 2 4 5l2-4 2 1-1 6c0 2-1 3-3 3v6h-1.5v-5h-6v5H47v-5c-2 0-4-1-4-2l-1 7h-1.5z"
            opacity=".75"
          />
        </g>
      ) : (
        SCENES[r]
      )}
    </svg>
  );
}
