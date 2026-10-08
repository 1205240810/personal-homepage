# 标准模式验证 · 2026-10-08

本次标准模式验证通过：

- 11 个 Vitest 文件、123 项测试，包括原 70 项回归、27 项标准引擎、17 项标准教练和 9 项标准 UI。
- TypeScript、独立 Vite 构建、自包含 HTML、旧休闲 Worker 实际内联代码冒烟通过；2 个 Blob URL 创建与撤销相等。
- 引擎测试额外运行 200 局固定种子的混合合法行动，逐步验证可用资金加托管下注及结束后的净收益守恒。天然 3:2、保险先检查、S17、晚投降、DAS、最多四手、分 A 与异常退款均覆盖。
- 新教练与明确独立抽牌基准核对，覆盖硬牌、软牌、对子、peek 条件、资金与手数限制、尺度不变和拒绝暗牌输入。它是披露的近似，不使用旧模式的精确标签。
- 标准组件验证独立存储、未结算余额不持久扣除、奇余额/历史盈利下注/破产恢复、损坏数据、设置二次确认、教程问答/Escape/焦点、后台暂停与分手查看。
- Playwright + 独立 Microsoft Edge 浏览器：标准教程六节完成；2000 初始筹码、100 下注的加倍实际结算为 2200，教练推荐加倍且收益差 0；此流程在宿主 Node 正式产物执行。
- 最新独立页面手机尺寸 390×844：8/8 分牌、首手加倍爆牌、第二手停牌，资金为 980；刷新仍为 980。下一局买半注保险后主手获胜、保险亏损，资金为 990；复盘保险建议不买、估计差 0.77（20 注）。
- 最新布局 1440×900 的操作按钮在首屏内；390×844 的当前分手与操作同时可见；320×740 教程无横向溢出、可滚动且 Escape 焦点恢复。减少动态效果覆盖保留。

截图在宿主忽略目录 `output/playwright/blackjack-standard-{desktop-compact,mobile-split,tutorial-320}.png`。这些是实际浏览器的 DOM/CSS 结果，不是设计稿。手机是浏览器尺寸模拟；没有宣称真机音频或 file:// 行为已验证。最终公网站点与联合发布验证记录见宿主 `content/backups/` 的部署记录。

以下保留原 v0.3.0 的历史证据与当时执行环境限制；不代表本次 HTTP 浏览器验收仍被阻塞。

---

# Verification · v0.3.0 · 2026-10-08

Passed:
- 70 Vitest tests across eight files, including all 59 original tests and 11 additional independent interaction checks.
- TypeScript noEmit, production Vite build and self-contained HTML packaging.
- Exact finite-deck solver versus independent small-deck permutation oracle, both modes. Gameplay, solver, storage and Worker implementation unchanged.
- Negative natural-check posterior, hidden-field invariance, multi-ace/naturals/ties, forced replacement fallback.
- Mode-isolated stats, legacy data isolation, input locks, pending reset/mode switch disabled, background pause and explicit continue.
- Coach off by default and postgame only; cancellation/stale-message refusal across replay, toggle and mode switch; collapse cancellation and reopen; same-step navigation and cache behavior.
- New-round repeated input guard and scoped keyboard operation after starting. Dialog focus trapping, Escape dismissal, trigger focus restoration and rules-to-background-pause focus transition.
- Hidden card face is absent from the DOM until reveal.
- Worker URL revocation on normal disposal, cancellation-before-startup and construction failure.
- Actual portable production HTML executed in jsdom with its genuine embedded Worker source executed in real Node worker_threads. Classic and strategic rounds both completed and produced exact reviews. Two Blob URLs created/two revoked; no external script/link assets. See portable-smoke-results.json.
- CSS/source inspection: no external font or image calls; reduced-motion override; bounded horizontal hand scrolling; touch-sized primary controls. This is inspection, not a rendered measurement.

Not verified:
- Real browser visual layout, mobile touch, actual audio playback, browser Blob Worker/file:// behavior.
- Browser checks were retried for this revision. Chromium could not launch because socket() was prohibited by the execution environment. The separate cloud browser could not reach the workspace's localhost preview, and it provided no supported artifact-preview route. No screenshots are claimed or supplied.

The earlier solver benchmark remains included as historical v0.2.0 performance evidence (18 exact coach samples and 990 exact dealer combinations); algorithms did not change. It is not a new browser or mobile performance benchmark.

Node/jsdom/worker_threads tests establish packaged-source integrity and functional behavior, not browser visual quality or file-scheme compatibility.
