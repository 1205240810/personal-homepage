# 内容与世界维护

## 添加一篇文章

已审核文章放在 `content/posts/`；未确认内容先在 `content/drafts/` 起草，该目录下的 Markdown 被 Git 忽略，仅保存在本地。文件名可以改，`id` 与 `slug` 一经发布应保留。每次启动或构建自动整理内容；不需要改书架坐标。

```md
---
id: a-stable-content-id
slug: a-stable-public-url
title: 文章标题
date: 2026-09-07
chapter: graduate
status: draft
tags: [工程实践]
summary: 用一句话说明这篇文章讨论什么。
---

## 问题从哪里开始

正文。
```

`chapter` 为 undergraduate / graduate / life；`status` 为 draft / published。核对通过后，将文件移到 `content/posts/` 并改为 published，运行 `npm run check` 和对应部署目标的构建命令：Sites 使用 `npm run build`，Node 使用 `npm run build:node`。直接地址为 `/posts/a-stable-public-url`。公开正文图片放在 `public/content-assets/`，引用 `/content-assets/文件名`。

开发与 `build:preview` 可以加载本地草稿，正式构建排除草稿。公开仓库不提供那四篇未确认草稿，首次克隆时没有真实草稿也能运行检查；草稿隔离由临时测试文章验证。草稿的未公开图片也应留在本地，不能提前放进 `public/`。

HTML 旧文集中在 `content/articles/cnblogs.json`。复杂代码、表格、公式保持清理过的 HTML，不强制转换 Markdown。编译时清除脚本及事件属性，已迁入文章之间的精确原文链接映射到本站。未迁入的历史链接保留原地址。

个人档案与荣誉在 `content/data/profile.json` 和 `awards.json`。修改日期/学校/奖项必须有用户确认或原始来源；不把私人联系方式或未核实奖项加入公开内容。

身份展示统一使用昵称「徒手拆机甲」。README、页面正文、标题与描述、档案数据和迁入文章中的作者署名均按此维护。重新导入旧文时也要替换作者真名，连同含姓名的标题锚点、图片替代文本及摘要一起检查；不因原文曾公开而恢复实名。

荣誉按本科 / 研究生平行展示。日期可以仅到年，不自动补齐月份；京东百强为用户确认的 2022 年本科记录，华为杯仅确认研一阶段。`competition` 和 `result` 分列，保持相同字号与权重。

现行机甲配置只修改 `lib/world/registry.ts`；旧 `room-definitions.ts` 不参与运行。互动的 `x/y` 是角色可达站位，`effectPoint` 是原画上的真实物件位置，两者分离。`lighting` 只控制场景灯光，不改变碰撞与阅读权限。切舱在新场景加载并淡入后才解锁输入；读档案时人物停步，关闭后原位恢复。

## 接入新内容与场景

- `/` 引导页下的 `/workbench` 与 `/explore` 共用 `ContentSource.list/get`。工作台精选只取正式文章，栏目自动收录新增内容；游戏入口统一到 `/games`，不占用文章栏目。
- `lib/world/registry.ts` 是空间唯一数据源。SceneDefinition 的 `width/height` 对应背景，`walkable` 指定可通行多边形，`obstacles` 指定家具脚底，`foreground` 为按深度遮挡的原画轮廓；`playerScale` 控制人物比例。节点与出生点必须可通行。`returnTo` 指向枢纽独立返回点。
- 当前为斜俯视 2.5D；新增舱室只需注册背景、地面、家具、人物比例、返回点和互动节点，不改角色控制。当前四个内舱均为独立1536×1024原图，逻辑坐标887×591；前景遮挡从原生分辨率取样，普通独立背景不设 frame。
- 运行 `npm run maps` 同步 Tiled 导出，再运行 `npm run check`。不能只编辑导出地图而不同步注册表。
- 内容动作使用 open-content / open-collection / open-projects；场景内的原有轻量小游戏使用 open-game，独立游戏室使用 open-arcade，场景连接使用 enter-scene。inspect / discover 只承接小反馈，任何内容均不依赖游戏完成。
- `npm run check` 验证重复 ID、入口、出生点、节点可达性、文章引用、草稿隔离与 Markdown 自动收录。

## 官方备份迁移

从博客园后台使用[官方备份](https://www.cnblogs.com/cmt/p/17240655.html)。原始 ZIP / SQLite / JSON / XML 应保存到被忽略的 `content/backups/`，不要放进 public 或提交到仓库。

取得实际备份后先检查结构和文章数量，再转换为 `content/articles/cnblogs.json` 的字段：id、slug、title、chapter、date、publishedAt、status、tags、summary、format、sourceURL、html。保留官方文章 ID，现有三篇用 ID 去重，保留已经公开的 slug。

必须逐项核对：文章总数、标题/日期/标签、图片下载结果、公式、代码块、表格、内部链接。备份中草稿仍标 draft；不能按文章是否存在推断已发表。输出迁移报告后才更新正式包。2026-09-08 已完成74篇公开文章抓取迁移，并取得79篇官方SQLite备份。额外5篇保持私藏，不进入本管线。完整原文/代码/公式/表格核对见 docs/cnblogs-public-audit.json。

已提供保守的官方 SQLite 检查器：

```sh
node scripts/inspect-cnblogs-backup.mjs /path/to/official-backup.db
```

它保留原始文件和 SHA-256，核对官方 blog_Content 表，只提取访问权限为公开的文章到被忽略的 review.json。**不会自动修改站点文章**。已迁入的 ID 带出既有标签与地址；新记录一律待核对。官方 SQLite 阅读器中没有可靠的已发表状态或标签映射，不能把访问权限 0 当成已发表。依据：[官方客户端固定版本](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/service/blog-export/blog-export-post.store.ts)。JSON/XML 待取得实际备份再添加适配，避免猜测字段丢内容。

## 状态、动效与排障

探索状态位于本机 `mecha-archive-world-v1`，包含场景、布局版本、位置、已看物件和游戏成绩。布局变更时提高 `layoutVersion`，旧位置回到对应出生点，已失效物件 ID 被过滤。旧 exploration 字段仅为存档兼容保留，不参与河流、桥或升降台计算。

减少动态效果可在运行中改变；关闭镜头缓动、待机呼吸并跳过转场。失焦或打开阅读后清空方向输入，停步保存最终坐标。存储不可用不阻止探索。

地图载入失败仍可从上方直接阅读，或访问 `/archive`、`/projects`、`/about` 与 `/posts/:slug`。

## 游戏室与浏览器游戏

欢迎页保留工作台与机甲两个主入口，额外提供游戏室链接；工作台导航和侧栏均通向 `/games`。`lib/games/catalog.ts` 维护稳定游戏 ID、名称、说明、独立地址、分类、控制说明与预计游玩时长。新增游戏需完成独立页面与实际玩法，再加入目录，不显示未配置内容的假入口。具体模块边界与检查步骤见 [游戏室与扩展](GAMES.md)。

当前独立游戏为 `/games/holdem-lab` 的德州扑克练习桌，以及 `/games/signal-pulse` 的信号接力。灯阵复用原有 `PulseGame` 与十二关数据，不复制一套规则。界面共享 `GamePageFrame` 与 `components/games/games.css`；独立灯阵适配样式为 `signal-pulse.css`。

试作间的 `arcade-terminal` 是可达的街机角，执行 `open-arcade`。离开世界前先清空方向输入、暂停并保存人物位置，再打开 `/games?from=explore`。选择游戏时继续携带 `?from=explore`；返回游戏室保留该参数，「返回机甲」只跳转 `/explore`，不附加 scene 参数覆盖原存档。新增这种跨页面入口时，必须一起检查浏览器后退、手机触控与返回后的停步状态。

德州扑克是单挑单机练习，全部筹码为虚拟数值。发牌、合法行动、底池结算、牌型比较、AI 与复盘由浏览器运行；AI 不读取玩家隐藏底牌来做策略决策，也不调用联网大模型。`holdem-cards.ts` 比较真实五至七张牌，并对随机合法对手底牌和剩余公共牌做蒙特卡洛抽样。`holdem-strategy.ts` 根据权益、底池赔率与对手风格生成混合启发式行动；复盘提供赔率、下注目的与 GTO 思路的解释，不应宣传为严格 GTO 求解或精确最优频率。

权益计算假设对手未知牌均匀随机；真实行动范围可能更紧或更宽，因此估计不能直接等同于面对当前 AI 的真实胜率。代码默认抽样次数与 Worker 内抽样次数可能不同，不在页面文案里承诺固定精度。修改牌型、全下、盲注、加注重新开放或复盘逻辑，应运行相应规则检查，而不是只点击几手确认。

练习记录使用本机 `localStorage` 键 `tscjj:holdem-practice:v1`，保存累计手数、胜局数、虚拟筹码净变化与最近八手的玩家底牌、公共牌和复盘；不恢复正在进行中的对局。它和文章数据、机甲探索存档分开，不会因推送 GitHub 自动同步。信号接力的完成统计仍只保存在当前页面内存，刷新重置，目录页不能把它宣传为永久存档。隐私模式或存储不可用时仍应可以开局；分享游戏地址不会携带个人练习记录。

## 项目、美术与音乐

公开项目维护在 `content/data/projects.json`，保留源链接、描述核对日期和实际演示地址。

当前主地图为 `public/art/mecha-isometric.png`，内舱为四张 `interior-*-hd.png`，头像为 `mecha-avatar.png`。开屏从 `lib/arrival-art.ts` 中的四张 `arrival-*.webp` 原画随机选择，服务端每次访问选定一张后传给页面，避免首屏闪换与加载全部图片。每幅图单独设置桌面/手机取景；保留原始分辨率，以 WebP 编码减轻加载。新增三张原始 PNG 保存在 `docs/design/originals/`，灰白机甲 `arrival-maintenance-hall.png` 仅作历史参考。原始提示词见 `docs/design/`。图像文件保留原始像素；家具前景在运行时按多边形裁取并按脚底深度叠放。旧三行内舱、courtyard / river / sideview 资源仅作历史参考，不在当前场景加载。

角色由 `jointed-player.ts` 的 Canvas 关节函数绘制，`player.ts` 一次生成四方向、每方向 16 帧行走与独立 idle 纹理。脚锚点为 (64,166)，画布 128×176。完整步幅为 128×playerScale 世界单位，与 engine 移动距离同步；改步幅必须同步两处，不能用帧率掩盖滑步。

工作台当前有六个项目，按网络工程、数据与算法、效率工具分类。`lib/workbench-projects.ts` 定义项目与展示类型的映射，`components/home/project-library.tsx` 负责选择目录、预览外壳和源码/演示入口。新增项目应先在 `content/data/projects.json` 记录已核实的描述和源链接，再决定是否有足够素材制作交互预览；没有真实实现依据时只做项目导览。

OSPF 与相册预览在 `components/home/project-workbench.tsx`。OSPF 规划函数在 `lib/project-preview.ts`；相册样本在 `content/data/album-preview.json`，照片在 `public/art/album`。保留原始规则标签和分值，不把规则标签宣传成准确语义识别。地址规划真实本地计算，应用、下发及 Ping 明确为模拟回执。配送路径与日均成本的本地计算在 `lib/workbench-demos.ts`；网络仿真和创作流程的文字导览维护在 `lib/workbench-projects.ts`。

灯阵定义在 `lib/pulse-puzzle.ts`，界面在 `components/home/pulse-game.tsx`。12 关分三阶段，前八关 4×4，后四关 5×5，最短步数依次为 1、2、2、3、3、4、5、6、6、7、8、9。新增关卡必须验证可解性与 `par` 最短步数，不能只凭视觉决定难度。`npm run check` 包含求解、边界和重复点击检查。提示、撤回与重来不影响内容访问；完成统计和最佳步数仅保存在当前页面内存，刷新重置。

音乐音量保存在 `mecha-music-volume`，每次打开页面均由访客主动播放。更换曲目时同步来源和 THIRD_PARTY_NOTICES 授权记录。

公开抓取导入器：`node scripts/import-cnblogs-public.mjs 已审核目录`。它只接受本次核实的74篇公开清单，校验原文/图片SHA-256，将原始抓取另存ignored备份并输出迁移清单。不能对私人导出使用。6张源图无法取回，阅读页已放缺失说明；1篇源正文仅字母S，保持原状。3个旧链接404、25个403未能验证，原链接保留。私藏室规则见 PRIVATE-VAULT.md。

## 手机适配

工作台的内容 DOM 顺序为文章、项目、游戏室与探索入口，桌面用 Grid 并排排版；手机先呈现文章。六个项目可按类型筛选，手机选择项目后先提供摘要和展开入口，再复用同一套交互预览。游戏室双卡在手机改为单列，牌桌与灯阵通过独立页面加载。主要触控控件至少 44px，输入字号 16px；正文代码固定 14px，避免 pre/code 重复缩小。修改项目卡片、游戏控制区或 5×5 灯阵时应检查窄屏溢出、操作按钮和焦点顺序。

文章抽屉直接子项不参与 Flex 收缩，关闭栏固定；手机主题筛选可展开，选中后收起。探索菜单和手动方向盘可折叠，点击物件自动寻路沿用原实现。触控布局同时考虑竖屏宽度、粗指针与短横屏，横屏保留可展开的方向盘。竖屏画布上下为导航与工具预留空间，地图继续 cover 与跟随人物，不修改地图坐标或碰撞；画布外由当前场景的暗化背景自然延伸。

## GitHub 与学习案例

源码现维护在公开仓库 [1205240810/personal-homepage](https://github.com/1205240810/personal-homepage)。公开提交及历史不包含实名、未确认草稿和私藏档案数据；原始历史另作私有备份。提交与历史恢复见 [GitHub 维护说明](GITHUB-MAINTENANCE.md)。推送源码不会自动更新线上网站，也不会改变 Sites 的访问范围。

`examples/forest-courtyard/` 保存独立适配的旧林间小院，入口见其 [README](../examples/forest-courtyard/README.md) 和 [学习指南](../examples/forest-courtyard/LEARNING_GUIDE.md)。它使用单独的 Vite 配置、依赖锁文件、教学文章和地图，不导入当前站点代码。根目录的 `example:forest`、`check:forest`、`build:forest` 只是便利命令；修改案例不会改变当前机甲场景。
