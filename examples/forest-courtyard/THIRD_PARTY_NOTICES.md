# 林间小院：来源、参考与许可说明

本例提取自本仓库早期林间小院版本，对应历史标签 [`archive/forest-courtyard`](https://github.com/1205240810/personal-homepage/tree/archive/forest-courtyard)，用于保存和讲解当时的场景实现。公开历史已做隐私清理，独立化的修改范围见 [README](README.md)。本文件保留历史项目的参考记录与音乐署名，并说明独立案例实际使用的材料。

## 设计与代码组织参考

原项目记录了以下开源参考：

- [Phaser React TypeScript 官方模板](https://github.com/phaserjs/template-react-ts)，MIT：参考 React 生命周期与 Phaser 的组织边界。
- [Bruno Simon Folio 2019](https://github.com/brunosimon/folio-2019)，MIT：参考可操控空间的导航与环境反馈。
- [JSLegendDev 2D Portfolio](https://github.com/JSLegendDev/2d-portfolio-kaboom)，MIT：参考邻近物件提示、角色移动与阅读切换。

这些是设计与组织方式的参考记录。本例的场景图片、人物和家具资产没有取自以上参考项目；不得将其许可证理解为本例原创资产的许可证。

## 软件依赖

运行与构建使用 React、React DOM、Phaser、TypeScript、Vite、Tailwind CSS、KaTeX、lucide-react、Base UI、shadcn 及其他样式辅助依赖。准确版本由本目录的 [package-lock.json](package-lock.json) 记录；各依赖遵循其分发包内的 LICENSE、NOTICE 与其他授权文件。

`components/ui/` 保留原项目使用的按钮、弹层、抽屉与标签页基础组件。独立案例没有包含原 Sites 托管环境；不要根据根项目的运行依赖，推断本例也需要部署服务。

## 背景音乐

**Morning — Kevin MacLeod (incompetech.com)**

- ISRC：**USUAN2300003**。
- 作者与曲目来源：[原曲及授权页](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN2300003)。
- 许可证：[Creative Commons Attribution 4.0 International / CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- 文件：`public/audio/morning.mp3`，音源来自作者提供的 MP3，原曲未剪辑；循环播放与阅读时音量降低由播放器控制。
- 页面内的音乐菜单同时保留作者、曲名、来源及许可证链接。

保留或再分发该音乐时，应保留适当署名及许可证信息；若对音源做了修改，应说明修改。音乐的 CC BY 4.0 授权仅适用于该音乐，不适用于整个案例。

## 内容与原创资产

本例包含三篇新编教学笔记与两个公开项目的链接资料，不包含迁移的私人博客或原个人经历档案。项目名称、说明和外链的来源记录保留在 `content/data/projects.json`，链接到原仓库不代表取得了其全部内容与资产的再授权。

14 张历史场景原画、代码绘制的角色以及本项目自身的代码与教学文字，保留于此用于版本维护与学习参考。**仓库目前没有为项目整体设置开源许可证**；可访问源码不等于可以任意复制、再分发或商用。若后续决定开放使用，应由权利人明确选择项目许可证，并单独说明美术、音乐与其他第三方材料的适用范围。
