# PR #2：游戏室改进与合并验收

## 问题依据

生产客户端原先把 `new URL('./holdem-worker.ts', import.meta.url)` 编译成带 `file:///ROOT/components/games/holdem-lab.tsx` 基准的 URL。即使第一参数已经是 `/_next/static/holdem-worker-*.js`，它仍解析为 `file:` URL，浏览器无法从网站启动这个 Worker，正常对局因而持续使用回退计算。

改为 `import holdemWorkerUrl from './holdem-worker.ts?worker&url'`，然后在客户端 effect 内调用 `new Worker(holdemWorkerUrl, { type: 'module' })`。Vite 显式生成公开资产 URL，避免依赖被 RSC 提前替换的 `import.meta.url`。`vite-worker.d.ts` 仅声明这个导入的字符串类型。

## 构建产物验证

Node 生产构建后运行：

```bash
npm run build:node
# build:node 已在构建后自动执行 Worker 产物检查
```

脚本读取客户端实际生成的 `holdem-lab` chunk，用 TypeScript AST 解析 `Worker` 参数及其变量绑定，不依赖压缩后的变量名，也不执行应用 bundle。它拒绝 `file:`、跨站地址、源码路径及不属于公开 Worker 资产的路径，检查被引用的 Worker 文件存在、非空，并核对 standalone 包中的 chunk 和 Worker 副本一致。

也可以把独立产物目录作为参数：

```bash
node scripts/check-holdem-worker-build.mjs /path/to/dist
```

此检查用于捕获 URL 与打包回归；浏览器是否成功启动 Worker、超时提示与重试是否正常，仍需实际交互验证。

审阅时，当前生产产物检查通过，引用的 Worker 为 41,746 字节且 standalone 副本一致。独立临时 fixture 验证了换用其他压缩变量名仍通过，而复制原先的 `file:` 基准表达式、指向源码 `.ts`、引用不存在的 Worker 资产均失败；没有修改生产产物来构造失败用例。


## 合并复核

- 以正式版 `85de143` 为基线合入，解决 README、根检查脚本与六款游戏目录的兼容冲突。
- 六款游戏统一收紧卡片预览，保持原配色、入口与游戏本体；暗牌 21 同步维护源、嵌入副本及便携 HTML，补齐其内嵌运行库的 MIT 许可。
- 部署文档补充 Blackjack 测试依赖安装，避免新环境的完整检查因缺依赖而失败。
- 信号接力的存档版本、恢复历史、提示和完成记录经过独立复核；多标签页之间不做即时存档合并。
- 德州分段计算与原策略在固定种子下保持一致，不增加对对手底牌或未来牌面的读取。指南和复盘文本不改变策略模型，也不把近似范围模型宣传成精确 GTO 求解器。

## 验证记录（2026-10-09）

- 根 `npm run check` 通过，共 222 项：既有世界、内容、目录、德州规则/策略检查，加 124 项 Blackjack、6 项 Signal React、4 项存档、12 项 Worker 测试。Worker 地址修正后再次通过 TypeScript 与 12 项 Worker 回归。
- `npm run build:node` 与 Worker 产物检查通过；临时坏产物用例验证旧 `file:` 表达式、源码路径及缺失 Worker 都会失败，更换压缩变量名不影响检查。
- 暗牌 21 便携构建与独立测试通过：无外部运行资源，创建的两个 Worker 均释放。
- Microsoft Edge 的真实浏览器验证：指南以原生 modal 阻止后台焦点，Escape 关闭恢复入口焦点；指南打开暂停对局，原本手动暂停的状态在关闭后保留。
- 正常德州 AI 收到实际独立 Worker 回复。仅在测试浏览器注入“构造失败”和“静默线程”：分别触发分段回退与实际 15 秒行动超时，后者停止线程且重试恢复。复盘静默注入触发实际 45 秒超时，完整行动回放仍可查看，重试重新得到决策分析。
- 320 像素宽的德州指南和复盘无页面横溢。

全库 lint 有既有诊断；不把它记为通过。三款新增游戏的核心代码与 `85de143` 保持一致，本次没有重复声称对其 267 项独立测试完成新一轮执行。

- 大厅 1165×747：六款预览均为 240px 高，同行标题对齐，首行三张卡的 44px 开始区域完整可见；390×844 及 320×740：预览均为 224px 高，无横溢，首个开始区域完整可见。320px 的引导留白另收紧 20px。
- Signal 浏览器实测两格操作、提示后立即刷新，完整恢复历史、提示次数；继续后焦点返回首格，撤回恢复上一棋盘；通过工作台→游戏室回到游戏仍保留进度。320/390px 无横溢，五阶灯格为 44×44px。
- Blackjack 320/390px 无越界操作；教程和桌规能纯 Tab/Enter 访问，Escape 关闭教程后焦点返回；实际开局、要牌和停牌结算正常。本次未手工注入牌组复做分牌、保险场景，不把它们记为手工通过。
