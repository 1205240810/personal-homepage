# 九间数独、快艇骰子与五张梭哈的接入

三款独立游戏来自仓库分支 `feat/puzzle-strategy-trio` 的提交 `c7dec15`。主站保留原有游戏风格和规则，修复实际边界问题后，通过 `/games` 与机甲试作间的街机角进入。

| 游戏         | 地址             | 维护目录              | 本机存档                                                |
| ------------ | ---------------- | --------------------- | ------------------------------------------------------- |
| 九间数独     | `/games/sudoku`  | `standalone/sudoku/`  | `nine-rooms:sudoku:v1`、`nine-rooms:sudoku:progress:v1` |
| 快艇骰子     | `/games/yahtzee` | `standalone/yahtzee/` | `blue-dice:v1`                                          |
| 绯夜五张梭哈 | `/games/stud`    | `standalone/stud/`    | `velvet-stud-v1`                                        |

## 运行与维护

独立目录是单一源码。主站开发、检查和构建前由 `scripts/sync-standalone-games.mjs` 同步十八个运行文件到各游戏的 `generated/`；`--check` 比较内容，防止遗漏同步。不会复制独立 `main.tsx`、测试、依赖目录或包含另一份 React 的便携 HTML。

`components/games/standalone-game-room.tsx` 在 hydration 后按需导入对应组件，传入 `persist=true`、`globalKeyboard=false` 和退出回调。只加载当前游戏，读取独立存档；导航保持 `?from=explore`，回到机甲时读取原有世界位置。加载失败提供刷新重试和游戏室链接，重新获取当前页面以恢复过期的资源分块；游戏本身使用原有中文帮助、音频开关和异常存储提示。

```sh
npm --prefix standalone/sudoku ci
npm --prefix standalone/yahtzee ci
npm --prefix standalone/stud ci
npm run check:trio
npm --prefix standalone/sudoku run verify:bank
npm --prefix standalone/sudoku run build:portable
npm --prefix standalone/sudoku run test:portable
npm --prefix standalone/yahtzee run build:portable
npm --prefix standalone/stud run build:portable
node scripts/sync-standalone-games.mjs
npm run check
npm run build:node
```

独立 Vite/Vitest 配置防止误读取主站 Vinext 配置。三款游戏均保留复用宿主 React 的接口；其依赖只用于独立开发，不增加主站运行依赖。修改骰子 AI 后，独立构建和测试会重新生成内联 Worker。

## 规则与信息边界

数独保留三档各四十题、原题号及唯一解。难度表示本实现扫描次序下所需的推理技巧，并非跨平台统一评级；教练只解释唯一候选、单元唯一位置和宫内锁定，不把预存答案伪装为推理。提示分三步展开：先只高亮线索所在的行、列或宫并说明方向，再标出目标格与依据，最后才给出完整推理和「应用这一步」。计时从第一次填写（含笔记）开始，打开页面后先观察不计时。

快艇骰子按上区 63 分奖励、重复快艇奖励和 Joker 分栏限制计分。AI 枚举下一次重掷的概率，标准档加入分栏机会成本；是单步前瞻教学对手，不宣称整局最优。Worker 与受阻后的同算法协作式计算都只接收自己的骰子和计分卡，无法读取未来随机数。

五张梭哈是双人一暗四明、四轮下注的固定变体，单手有效筹码封顶；未覆盖筹码不扣，不额外构建多人边池。AI 与复盘使用行动时可见信息，均匀抽样未知牌；没有根据完整对手范围求解严格 GTO。完整牌序存在本机恢复存档中，这不是防作弊或竞争排名系统。

三者的背景音乐均为原创程序音频，默认关闭、用户手动开启。切后台、暂停或卸载时停止相应计时与音频。存档只在当前来源的浏览器保存，不上传服务器；不同浏览器或清除站点数据后不共享。

## 审阅与验收

2026-10-09 审阅修复：独立构建配置缺失、数独非法存档及快捷键边界、骰子 AI 消息与取消边界、梭哈焦点丢失和不合法恢复状态。每个项目的具体修复与测试结果记录在自己的 README。保留三款美术，目录延续主站纸面、墨色、砖红的导航和间距；新增预览分别表现九宫棋盘、保留骰子和一暗四明，避免所有新入口误用灯阵预览。

验证包括独立测试、数独独立唯一解检查、生产构建与便携包；正式浏览器另外实测选题与取消、填写/笔记/撤销、骰子完整十三回合、梭哈下注与恢复、暂停/退出、返回游戏室及来路参数。检查 1440px、390px、320px 宽度、横向溢出、焦点、默认静音与控制台错误。实际结果在 [本次验收记录](GAMES-TRIO-ACCEPTANCE.md)，服务器 SHA、构建、路由与回滚记录保存在忽略的 `content/backups/`。
