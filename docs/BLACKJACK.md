# 暗牌 21：从独立游戏接入游戏室

线上地址为 `/games/blackjack`。从机甲游戏厅进入时带 `?from=explore`，游戏室与机甲返回链接会保留来源。本站直接挂载原有 React 组件，共用 React 19.2.6；没有 iframe、第二份 React 或独立页面的内联应用包。

## 保留的玩法

- 每局重新洗一副 52 张牌；玩家选择要牌或停牌，无真实金钱、充值和赌注。
- 经典庄家按 S17 行动，策略庄家则根据玩家终值与剩余点数数量选择行动。策略庄家有后手信息优势，界面明确说明这一点。
- 教练默认关闭，只在赛后分析保存的可见信息快照。有限单副牌精确计算超出预算时，会整体切换到独立抽牌近似，并在结果中标明。
- 两种模式各自保存胜负平、积分和音效/教练设置，键为 `twenty-one:v2`。旧 v1 历史保留；不恢复未完成对局。
- H 要牌、S 停牌、N 新局，仅牌桌有焦点时响应。切后台暂停发牌及庄家行动，返回需点「继续对局」。音效默认关闭，系统减少动态效果设置生效。

## 单一源码与同步

维护源在 `standalone/blackjack/src/`。`scripts/sync-blackjack.mjs` 将十个非测试运行源码同步到 `components/games/blackjack/generated/`，所有生成文件都有来源声明。不要直接修改生成目录；宿主的导航、加载界面和兼容样式在生成目录外。

```sh
# 修改独立游戏后，在其目录执行
npm ci
npm run typecheck
npm test
npm run build

# 返回仓库根目录；开发、检查与构建的前置步骤也会同步
node scripts/sync-blackjack.mjs
node scripts/sync-blackjack.mjs --check
npm run check
npm run build:node
```

修改 `coach.worker.ts` 或 `solver.ts` 后，先运行独立项目的 `npm run build` 或 `npm test`。它们会重新生成 `coachWorkerSource.ts`。宿主同步此源码字符串，不需要独立项目的 npm 依赖。独立开发入口 `main.tsx`、测试和 portable HTML 不进入宿主组件。

## 宿主边界

宿主 `/games/blackjack` 页面先呈现导航与加载界面，客户端 hydration 完成后按需导入牌桌，避免持久化统计造成服务端首屏不一致。牌桌源码样式均使用 `bj-` 类名，宿主样式使用 `blackjack-` 类名，不修改 body、html 或其他游戏的样式。

教练以 Blob URL 创建 Worker，由原组件负责取消任务、拒绝过期结果、终止 Worker 和撤销 URL。现有部署不新增外部计算服务；浏览器若禁止该方式，教练显示明确失败提示，游戏本身可继续。没有修改或放宽服务器安全策略。退出使用整页导航，触发牌桌卸载并释放定时器、音频上下文及 Worker。

关于规则、求解器信息边界和算法验证，分别参考 [独立项目 README](../standalone/blackjack/README.md)、[SOLVER-NOTES](../standalone/blackjack/SOLVER-NOTES.md) 与 [验证记录](../standalone/blackjack/qa/VERIFICATION.md)。浏览器视觉、手机布局和线上验证记录以本站的 [游戏验收记录](GAMES-ACCEPTANCE.md) 为准。

## 本次接入验证

2026-10-08：独立项目 TypeScript 检查通过，8 个测试文件的 70 项测试通过，生产构建通过。独立 HTML 冒烟验证实际执行内联教练 Worker，在经典与策略模式各完成一次发牌、停牌、结算和复盘；创建 2 个 Blob URL，撤销 2 个，外部资源请求入口为 0。宿主新增路由、同步脚本与运行组件通过定向 lint，`sync-blackjack.mjs --check` 通过。

为防止嵌套项目向上读取宿主 Vinext 的 Vite 8 配置，独立目录增加了自己的 `vite.config.ts` 和 `vitest.config.ts`。它仍使用自己的锁定开发依赖运行测试，本站发布运行时不携带这套独立开发工具。

本站实际浏览器验证已补齐：桌面经典模式完成发牌、12点停牌、庄家S17结算和精确复盘；手机策略模式完成14点要牌到20点、停牌、庄家追牌及两步复盘切换。390×844和320×740无横向溢出；玩法对话框Esc关闭后焦点回到入口，退出按钮返回`/games?from=explore`，三款游戏目录保留机甲来路。测试过程中未观察到控制台错误。正式生产与公网结果另记游戏验收记录。
