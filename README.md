# 徒手拆机甲 · 沉睡机甲档案馆

四张可以探索的 2D 地图，和一份随时可以直接阅读的个人档案。React / TypeScript 管理阅读与目录，Phaser 4.2.1 管理角色、地图和环境反馈，Tiled JSON 管理空间物件。

## 本地预览与检查

```sh
npm ci
npm run dev
```

默认本地预览包含 4 篇带明确标识的待核对草稿。首页支持 WASD / 方向键移动、E 互动、M 拆解图，点击地面也可以行走；手机提供方向按钮。正文打开时移动暂停，关闭后留在原处。独立 `/archive`、`/about` 和 `/posts/:slug` 不依赖地图启动。

```sh
npm run check       # 类型、可达性、内容引用、草稿隔离、自动收录
npm run build       # 仅正式文章，自动重新生成内容，默认不带草稿
npm run build:preview # 私有预览，包括待核对草稿
```

公开发布只能使用 `npm run build`，且应确认托管受众。当前站点设置为仅所有者访问，并设置 noindex；noindex 不是访问控制。后续公开上线再调整站点访问权限和索引元数据。

## 内容现状

- 3 篇完整旧文：ICPC 2022 合肥总结、Game Theory、背包问题总结。
- 4 篇方法与生活草稿，尚未经过本人逐篇核对。
- 已录入用户确认的教育时间线和简历中四项本科荣誉，Codeforces 1951 / Candidate Master 标记为历史成绩。
- 全量旧文迁移尚待实际博客园官方备份；当前 3 篇不是完整历史文章清单。

维护方式见 [内容维护](docs/MAINTENANCE.md)，来源见 [内容来源](docs/SOURCES.md)，第三方参考见 [参考与许可](THIRD_PARTY_NOTICES.md)。
