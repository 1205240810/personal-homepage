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

## 接入新内容与场景

- `ContentSource.list/get` 位于 `lib/content/source.ts`，阅读组件只接收其结果。后续可替换为构建时 API 采集；地图不请求第三方服务。
- `SceneDefinition` 位于 `lib/world/types.ts`，注册在 `lib/world/registry.ts`。新增唯一 ID、世界宽高、地表定义、独立图层、出生点、可走多边形、家具脚部碰撞、互动节点和入口，再运行 `npm run maps` 输出 Tiled 文件。
- 本版注册表是地图坐标唯一源，Tiled 文件为可检查的导出结果。若先在 Tiled 调整空间，应将修改同步回注册表，再重新导出；检查会拒绝两者不一致。
- `WorldAction` 的 open-content / open-collection / open-projects / open-game / enter-scene / adjust-sluice / use-lift / inspect / discover 由 React 展示层和世界桥接分发。相册和新 Demo 类型需要新增明确的数据及展示组件，再加入 action 分支；不用改角色控制。
- 为新资产扩展 `SceneDefinition.art/layers/doors`，引擎按定义加载。没有内容的入口不注册。所有场景 ID 与内容 ID 分离。
- `npm run check` 检查重复 ID、失效入口、无效出生点、失效图层/门、不能沿有效路径到达的物件、缺失文章、公开草稿泄漏，以及新 Markdown 自动收录。

## 官方备份迁移

从博客园后台使用[官方备份](https://www.cnblogs.com/cmt/p/17240655.html)。原始 ZIP / SQLite / JSON / XML 应保存到被忽略的 `content/backups/`，不要放进 public 或提交到仓库。

取得实际备份后先检查结构和文章数量，再转换为 `content/articles/cnblogs.json` 的字段：id、slug、title、chapter、date、publishedAt、status、tags、summary、format、sourceURL、html。保留官方文章 ID，现有三篇用 ID 去重，保留已经公开的 slug。

必须逐项核对：文章总数、标题/日期/标签、图片下载结果、公式、代码块、表格、内部链接。备份中草稿仍标 draft；不能按文章是否存在推断已发表。输出迁移报告后才更新正式包。当前未收到备份，未声称全量迁移完成。

## 状态、动效与排障

探索状态仅保存在本机 `mecha-archive-world-v1`，包含位置、已查看物件、小游戏最佳成绩、彩蛋与水阀、浮桥、索道进度。它不限制阅读权限。布局变更时提高 `layoutVersion`，旧位置会回到对应出生点，保留内容进度。系统“减少动态效果”启用后跳过镜头、门、浮桥与索道运动，关闭树木摆动。浏览器存储不可用时仍可探索。

若地图资源加载失败，直接用右上角文章入口、`/archive` 或文章 URL 阅读。图片和正文资源独立于 Phaser；阅读不等待游戏启动。

已提供保守的官方 SQLite 检查器：

```sh
node scripts/inspect-cnblogs-backup.mjs /path/to/official-backup.db
```

它保留原始文件和 SHA-256，核对官方 blog_Content 表，只提取访问权限为公开的文章到被忽略的 review.json。**不会自动修改站点文章**。已迁入的 ID 带出既有标签与地址；新记录一律待核对。官方 SQLite 阅读器中没有可靠的已发表状态或标签映射，不能把访问权限 0 当成已发表。依据：[官方客户端固定版本](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/service/blog-export/blog-export-post.store.ts)。JSON/XML 待取得实际备份再添加适配，避免猜测字段丢内容。

## 项目、图层与音乐

公开项目维护在 `content/data/projects.json`，记录仓库、描述、实际可用的演示链接和核对日期。不自动提交 GitHub 账号变更。

`lib/world/courtyard-layers.ts` 与 `interior-layers.ts` 定义独立原画层。`anchor` 是原素材脚锚点，`sourceWidth` 与 `width` 决定比例，`outline` 只决定原生渲染蒙版与点击区域，`depth` 与角色脚底 y 比较。**outline 不可直接拿来当碰撞框**：人物应能站到桌子的背后，碰撞只限制接地面积。静态轮廓在场景载入时由 Phaser 合成为可复用纹理，离开场景时释放，不在每帧重复跑遮罩。源图文件保持原样。室内基底已清空桌椅；不要改回带家具的原图，否则会出现重复。

新增门将 `nodeId` 对应到真实互动节点，在 `doors` 填原画门洞尺寸。小游戏反馈由明确的 WorldAction 分支处理，不引入通用插件系统。新增场景和互动仍运行 `npm run maps` 与 `npm run check`。

开始菜单在当前标签页首次打开时显示，左上头像可以再次打开。音乐音量保存在 `mecha-music-volume`；音乐每次打开页面都由访客主动播放，不把自动播放权限当作可用前提。更换音乐需要同步音源、展示时长与 THIRD_PARTY_NOTICES 中的授权。

## 河谷扩建边界

地图宽高定义在 SceneDefinition，路径网格从场景地面范围推导，摄影机可视范围独立于地图尺寸。室外 TerrainDefinition 的岸线用于绘图与碰撞，paths 只画路面，不限制草地。

探索状态由 exploration.ts 校验和计算。改变机关时必须调用同一 collisionFor 规则、清空已有路线、更新机关图像并保存；不要直接修改共享注册表。bridge 为单向开启，lift 在 bridge 开启且电路完成后生效。旧版第二地图存档缺少浮桥进度时回到河湾，避免落在无法回程的岸边。

角色原始图集 explorer-walk.png 与 explorer-frames.json 配对使用。生成图集的格子并不等宽，精确帧矩形和脚锚点来自 alpha 区域测量。不得按整齐网格盲切。river-materials.png 和 river-mechanisms.png 同样保留源像素，地表及机关前景通过游戏运行时合成。

室内统一比例为 .42（registry.ts），家具图层、碰撞、站位、出生点须一起缩放。新增场景仍只注册定义，不修改角色移动核心。每次修改地图后运行 npm run maps，再检查初始、浮桥开启及索道启动三个状态。
