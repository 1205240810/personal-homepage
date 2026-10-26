# 工业探索机甲 · 光影纵深试作

- 日期：2026-10-26
- 模式：内置 image_gen，以原 `public/art/arrival-industrial-explorer.png` 为编辑目标。
- 母版：`docs/design/originals/arrival-industrial-explorer-depth.png`。
- 网页资产：`public/art/arrival-industrial-explorer-depth.webp`，保持原生像素，Sharp WebP 质量 90。
- 保留墨绿单眼机甲、旧铜关节、手扶检修架的姿态、左侧标题空间与全部页面入口。
- 调整近处的暗框、主体暖色侧光、远景冷灰空气透视，减少各层都同样清晰明亮的平面感。
- 四图随机逻辑、遮罩、灯光、音乐和减少动态设置沿用现有实现。新版桌面焦点上移至 `64% 20%`，避免矮屏裁掉头部；手机沿用 `69% 50%`。旧图保留，可直接回退引用。
- 手机工具栏缩为图标优先，保留完整无障碍标签；品牌不再逐字折行，按钮点击区域至少 44×44px。
- 本地试作，尚未发布。

## 核对

- 图像原生尺寸 1672 × 941；网页 WebP 250,036 字节（约 244 KB），未缩放原图。
- `npx tsc --noEmit`、`npx oxlint lib/arrival-art.ts`、`npm run build:node`、`git diff --check` 通过。
- 在本地正式构建检查 1440×900、1280×800、1366×600、390×844、430×932、320×720；均无横向溢出，入口和页脚保持在视口内。
- 检修灯可切换；鼠标视差正常，减少动态模式场景 transform 为 none。三处导航仍指向 `/workbench`、`/explore`、`/games`。
- 补查 360/361、600/601px 断点两侧，无横向溢出或顶部文字折行；320px 下主题与检修灯切换正常。宽短屏优先保留头部，脚部会随 cover 取景裁切。
- 最终桌面/手机效果在忽略目录 `output/playwright/home-depth-desktop.png`、`output/playwright/home-depth-mobile.png`；取景与工具栏补查截图为 `refined-*.png`。

## 实际提示词

```text
Use case: style-transfer.
Asset type: cinematic architectural science-fiction artwork used full-bleed behind a personal homepage, 16:9 landscape, requested 2048 x 1152.
Input image 1 is the EDIT TARGET: the existing ink-green industrial explorer mecha in its maintenance archive hall.
Primary request: art-direct this exact scene into a more sophisticated and visibly more layered cinematic image. Keep the recognizable rounded green exploration machine, single round amber optical eye, aged copper joints, coherent two arms and two legs, relaxed pose with hand on maintenance trestle, and all full-body feet/head visible. Keep the quiet monumental hall, planetary wall motifs and subject placement on the right. Do not redesign the robot.
Composition: the complete hero stays within x=49%-87%, head around y=13%, feet around y=88%. Left 38% remains quiet dark architecture for a large white Chinese headline, with no typography rendered into the image. Create purposeful foreground / middle-ground / far-background separation: a soft out-of-focus dark structural edge at the extreme right and a subtle near-floor foreground at the bottom; crisp tactile mech in the middle; repeated architectural bays receding into cool atmospheric depth behind it. The foreground should frame without hiding any body part or consuming usable copy space. Lower and simplify distracting background scaffolding highlights.
Light and color: retain natural warm daylight from upper right but make it directional and sculptural, grazing brass joints and green armor with elegant luminous edges. Cooler slate-blue shadows and restrained soft distance haze separate the planes. A few believable diagonal light shafts in the distant hall, subtle floating dust only in those shafts. Rich but readable dark values; restrained champagne highlights, deep desaturated forest green, and brushed bronze. Avoid uniform gray lighting or aggressive orange-teal grading. The single amber eye is an intimate secondary focal point, never a glowing sci-fi beam.
Materials: refinement through better light and surface hierarchy, softly patinated satin enamel, machined edges, selective small wear marks, beautifully tactile stone and concrete, plausible grounded soft contact shadows. Less uniformly busy scratch detail. Floor has soft broken reflections, not mirror gloss.
Finish: exceptionally considered cinematic still with architectural photographic credibility. Calm, monumental, spacious, detailed yet uncluttered. No heavy fog, no overdone bloom or artificial vignette, no neon, no people, no weapons, no extra robots, no letters, no text, no logos, no UI, no borders. Preserve a seamless full-bleed scene and the left-hand text-safe region.
```

