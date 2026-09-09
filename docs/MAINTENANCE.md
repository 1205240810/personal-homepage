# 内容与世界维护

## 添加一篇文章

在 `content/posts/` 增加 Markdown，或先在 `content/drafts/` 起草。文件名可以改，`id` 与 `slug` 一经发布应保留。每次启动或构建自动整理内容；不需要改书架坐标。

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

`chapter` 为 undergraduate / graduate / life；`status` 为 draft / published。核对通过后再改为 published，运行 `npm run check` 和 `npm run build`。直接地址为 `/posts/a-stable-public-url`。正文图片放在 `public/content-assets/`，引用 `/content-assets/文件名`。

HTML 旧文集中在 `content/articles/cnblogs.json`。复杂代码、表格、公式保持清理过的 HTML，不强制转换 Markdown。编译时清除脚本及事件属性，已迁入文章之间的精确原文链接映射到本站。未迁入的历史链接保留原地址。

个人档案与荣誉在 `content/data/profile.json` 和 `awards.json`。修改日期/学校/奖项必须有用户确认或原始来源；不把私人联系方式或未核实奖项加入公开内容。

荣誉按本科 / 研究生平行展示。日期可以仅到年，不自动补齐月份；京东百强为用户确认的 2022 年本科记录，华为杯仅确认研一阶段。`competition` 和 `result` 分列，保持相同字号与权重。

现行机甲配置只修改 `lib/world/registry.ts`；旧 `room-definitions.ts` 不参与运行。互动的 `x/y` 是角色可达站位，`effectPoint` 是原画上的真实物件位置，两者分离。`lighting` 只控制场景灯光，不改变碰撞与阅读权限。切舱在新场景加载并淡入后才解锁输入；读档案时人物停步，关闭后原位恢复。

## 接入新内容与场景

- `/` 引导页下的 `/workbench` 与 `/explore` 共用 `ContentSource.list/get`。工作台精选只取正式文章，栏目自动收录新增内容。
- `lib/world/registry.ts` 是空间唯一数据源。SceneDefinition 的 `width/height` 对应背景，`walkable` 指定可通行多边形，`obstacles` 指定家具脚底，`foreground` 为按深度遮挡的原画轮廓；`playerScale` 控制人物比例。节点与出生点必须可通行。`returnTo` 指向枢纽独立返回点。
- 当前为斜俯视 2.5D；新增舱室只需注册背景、地面、家具、人物比例、返回点和互动节点，不改角色控制。当前四个内舱均为独立1536×1024原图，逻辑坐标887×591；前景遮挡从原生分辨率取样，普通独立背景不设 frame。
- 运行 `npm run maps` 同步 Tiled 导出，再运行 `npm run check`。不能只编辑导出地图而不同步注册表。
- 内容动作使用 open-content / open-collection / open-projects；可选游戏使用 open-game，场景连接使用 enter-scene。inspect / discover 只承接小反馈，任何内容均不依赖游戏完成。
- `npm run check` 验证重复 ID、入口、出生点、节点可达性、文章引用、草稿隔离与 Markdown 自动收录。

## 官方备份迁移

从博客园后台使用[官方备份](https://www.cnblogs.com/cmt/p/17240655.html)。原始 ZIP / SQLite / JSON / XML 应保存到被忽略的 `content/backups/`，不要放进 public 或提交到仓库。

取得实际备份后先检查结构和文章数量，再转换为 `content/articles/cnblogs.json` 的字段：id、slug、title、chapter、date、publishedAt、status、tags、summary、format、sourceURL、html。保留官方文章 ID，现有三篇用 ID 去重，保留已经公开的 slug。

必须逐项核对：文章总数、标题/日期/标签、图片下载结果、公式、代码块、表格、内部链接。备份中草稿仍标 draft；不能按文章是否存在推断已发表。输出迁移报告后才更新正式包。2026-09-08 已完成74篇公开文章抓取迁移，并取得79篇官方SQLite备份。额外5篇保持私藏，不进入本管线。完整原文/代码/公式/表格核对见 docs/cnblogs-public-audit.json。

## 状态、动效与排障

探索状态位于本机 `mecha-archive-world-v1`，包含场景、布局版本、位置、已看物件和游戏成绩。布局变更时提高 `layoutVersion`，旧位置回到对应出生点，已失效物件 ID 被过滤。旧 exploration 字段仅为存档兼容保留，不参与河流、桥或升降台计算。

减少动态效果可在运行中改变；关闭镜头缓动、待机呼吸并跳过转场。失焦或打开阅读后清空方向输入，停步保存最终坐标。存储不可用不阻止探索。

地图载入失败仍可从上方直接阅读，或访问 `/archive`、`/projects`、`/about` 与 `/posts/:slug`。

已提供保守的官方 SQLite 检查器：

```sh
node scripts/inspect-cnblogs-backup.mjs /path/to/official-backup.db
```

它保留原始文件和 SHA-256，核对官方 blog_Content 表，只提取访问权限为公开的文章到被忽略的 review.json。**不会自动修改站点文章**。已迁入的 ID 带出既有标签与地址；新记录一律待核对。官方 SQLite 阅读器中没有可靠的已发表状态或标签映射，不能把访问权限 0 当成已发表。依据：[官方客户端固定版本](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/service/blog-export/blog-export-post.store.ts)。JSON/XML 待取得实际备份再添加适配，避免猜测字段丢内容。

## 项目、美术与音乐

公开项目维护在 `content/data/projects.json`，保留源链接、描述核对日期和实际演示地址。

当前主地图为 `public/art/mecha-isometric.png`，内舱为四张 `interior-*-hd.png`，头像为 `mecha-avatar.png`。开屏从 `lib/arrival-art.ts` 中的四张 `arrival-*.webp` 原画随机选择，服务端每次访问选定一张后传给页面，避免首屏闪换与加载全部图片。每幅图单独设置桌面/手机取景；保留原始分辨率，以 WebP 编码减轻加载。新增三张原始 PNG 保存在 `docs/design/originals/`，灰白机甲 `arrival-maintenance-hall.png` 仅作历史参考。原始提示词见 `docs/design/`。图像文件保留原始像素；家具前景在运行时按多边形裁取并按脚底深度叠放。旧三行内舱、courtyard / river / sideview 资源仅作历史参考，不在当前场景加载。

角色由 `jointed-player.ts` 的 Canvas 关节函数绘制，`player.ts` 一次生成四方向、每方向 16 帧行走与独立 idle 纹理。脚锚点为 (64,166)，画布 128×176。完整步幅为 128×playerScale 世界单位，与 engine 移动距离同步；改步幅必须同步两处，不能用帧率掩盖滑步。

两个项目示例在 `project-workbench.tsx`。OSPF 规划函数在 `lib/project-preview.ts`；相册样本在 `content/data/album-preview.json`，照片在 `public/art/album`。保留原始规则标签和分值，不把规则标签宣传成准确语义识别。地址规划真实本地计算，应用、下发及 Ping 明确为模拟回执。

音乐音量保存在 `mecha-music-volume`，每次打开页面均由访客主动播放。更换曲目时同步来源和 THIRD_PARTY_NOTICES 授权记录。

公开抓取导入器：`node scripts/import-cnblogs-public.mjs 已审核目录`。它只接受本次核实的74篇公开清单，校验原文/图片SHA-256，将原始抓取另存ignored备份并输出迁移清单。不能对私人导出使用。6张源图无法取回，阅读页已放缺失说明；1篇源正文仅字母S，保持原状。3个旧链接404、25个403未能验证，原链接保留。私藏室规则见 PRIVATE-VAULT.md。

## 手机适配

工作台的内容 DOM 顺序为文章、项目、其他入口，桌面用 Grid 并排排版；手机先呈现文章，两个项目以选项卡提供摘要和“展开试用”，展开后复用同一套交互。主要触控控件至少 44px，输入字号 16px；正文代码固定 14px，避免 pre/code 重复缩小。

文章抽屉直接子项不参与 Flex 收缩，关闭栏固定；手机主题筛选可展开，选中后收起。探索菜单和手动方向盘可折叠，点击物件自动寻路沿用原实现。触控布局同时考虑竖屏宽度、粗指针与短横屏，横屏保留可展开的方向盘。竖屏画布上下为导航与工具预留空间，地图继续 cover 与跟随人物，不修改地图坐标或碰撞；画布外由当前场景的暗化背景自然延伸。
