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

- 默认 `/` 的 Workbench 与 `/explore` 的 WorldShell 共用 `ContentSource.list/get`。首页精选只取正式文章，栏目自动收录新增内容。
- `lib/world/registry.ts` 是空间唯一数据源。SceneDefinition 的 `width/height` 对应背景，`groundY` 是角色脚底线，`playerScale` 控制人物与家具的比例；节点、出生点应落在同一脚底线。房间的 `returnTo` 指向枢纽的独立返回点。
- 当前是横版单层维修通道，不是自由俯视移动。新增舱室只需注册背景、脚底线、人物比例、返回点和互动节点，不改角色控制。室内 `frame` 为三行图集中的索引；普通独立背景不设 frame。
- 运行 `npm run maps` 同步 Tiled 导出，再运行 `npm run check`。不能只编辑导出地图而不同步注册表。
- 内容动作使用 open-content / open-collection / open-projects；可选游戏使用 open-game，场景连接使用 enter-scene。inspect / discover 只承接小反馈，任何内容均不依赖游戏完成。
- `npm run check` 验证重复 ID、入口、出生点、节点可达性、文章引用、草稿隔离与 Markdown 自动收录。

## 官方备份迁移

从博客园后台使用[官方备份](https://www.cnblogs.com/cmt/p/17240655.html)。原始 ZIP / SQLite / JSON / XML 应保存到被忽略的 `content/backups/`，不要放进 public 或提交到仓库。

取得实际备份后先检查结构和文章数量，再转换为 `content/articles/cnblogs.json` 的字段：id、slug、title、chapter、date、publishedAt、status、tags、summary、format、sourceURL、html。保留官方文章 ID，现有三篇用 ID 去重，保留已经公开的 slug。

必须逐项核对：文章总数、标题/日期/标签、图片下载结果、公式、代码块、表格、内部链接。备份中草稿仍标 draft；不能按文章是否存在推断已发表。输出迁移报告后才更新正式包。当前未收到备份，未声称全量迁移完成。

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

当前背景为 `public/art/mecha-section.png` 和三行 `mecha-cabins.png`；图集由引擎按原图行高取帧，源像素保持原样。生成提示词见 `docs/design/mecha-sideview-assets.md`。旧 courtyard / river 图层与素材保留作历史参考，不在当前场景加载。

角色使用 `explorer-walk.png` 与 `explorer-frames.json` 中测量好的帧矩形、脚锚点，横版只使用左右两组帧，不按等宽网格盲切。角色在维修道前景移动，通道不延伸到背景的桌椅和机体。

音乐音量保存在 `mecha-music-volume`，每次打开页面均由访客主动播放。更换曲目时同步来源和 THIRD_PARTY_NOTICES 授权记录。
