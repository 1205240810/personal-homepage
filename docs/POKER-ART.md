# 扑克练习室人物素材

九个席位使用同一套原创、虚构的半身人物图。它们是透明的二维渲染素材，不是网页中实时求解的三维人体模型。真实筹码、扑克牌、行动状态及动效由组件绘制，不烘焙进人物图，人数、余额和下注改变后仍能正确呈现。

素材通过内置 **imagegen** 生成，每个角色单独一条请求，未使用 CLI 或外部人物照片。统一要求成人比例、细致面部与织物、柔和暖光与深绿轮廓光、自然坐姿、透明背景，无文字、标志或背景场景。每个请求及输出文件 SHA-256 记录在 [素材清单](poker-art-manifest.json)。

项目中实际引用的文件位于 `public/assets/poker/portraits/seat-0.webp` 至 `seat-8.webp`。原始 PNG 保留在生成目录；发布文件按原画比例缩小到 512 × 512，并编码为 WebP，保留 alpha，没有额外重绘、抠图或裁切。

| 席位 | 角色描述 | 文件 |
| --- | --- | --- |
| 0 | 深灰外衫、暖色内搭的年轻玩家 | [seat-0.webp](../public/assets/poker/portraits/seat-0.webp) |
| 1 | 深蓝针织衫、短须的分析型对手 | [seat-1.webp](../public/assets/poker/portraits/seat-1.webp) |
| 2 | 细框眼镜、奶油色开衫的沉稳对手 | [seat-2.webp](../public/assets/poker/portraits/seat-2.webp) |
| 3 | 锈棕夹克、专注神情的积极对手 | [seat-3.webp](../public/assets/poker/portraits/seat-3.webp) |
| 4 | 靛蓝衬衣、短发的灵活对手 | [seat-4.webp](../public/assets/poker/portraits/seat-4.webp) |
| 5 | 橄榄色马甲、银发的观察型对手 | [seat-5.webp](../public/assets/poker/portraits/seat-5.webp) |
| 6 | 深青外衫、矩形眼镜的专注对手 | [seat-6.webp](../public/assets/poker/portraits/seat-6.webp) |
| 7 | 苔绿西装、深色卷发的沉着对手 | [seat-7.webp](../public/assets/poker/portraits/seat-7.webp) |
| 8 | 棕色绒面夹克、深灰高领衫的耐心对手 | [seat-8.webp](../public/assets/poker/portraits/seat-8.webp) |

更换素材时保留透明背景、方形画布、头部与前臂完整，并沿用柔和暖光和绿边光，避免头像区出现不一致的光照。动作效果由 CSS 状态触发；减少动态效果开启时，应保留静态角色和真实数字信息。
