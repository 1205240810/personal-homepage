# 四幅机甲开屏 · 光影纵深

- 日期：2026-10-26
- 工具：内置 image_gen。每张独立编辑，原机甲为编辑目标，已确认的工业探索新版为光影参考。
- 保留四种机甲身份、全部导航、四图服务端随机选择和手机焦点。前景暗框、主体轮廓光与冷灰远景统一空间层次。
- 母版：`docs/design/originals/arrival-{industrial-explorer,navigator,maintainer,surveyor}-depth.png`。
- 网页图片：`public/art/arrival-{industrial-explorer,navigator,maintainer,surveyor}-depth.webp`。原生 1672×941，Sharp WebP 质量 90；旧资产保留。
- 矮屏优先保住头部，脚部可能随 cover 取景裁切。工业探索、导航、检修、勘探的桌面纵向焦点分别为 20%、15%、10%、0%。
- 第一张的生成记录见 [工业探索试作](arrival-industrial-explorer-depth.md)。

## navigator

```text
Use case: style-transfer.
Asset type: full-bleed 16:9 homepage hero artwork, preserve original native aspect ratio.
Input 1 is the edit target: the COBALT BLUE astronomical navigation mecha in its monumental instrument hall. Input 2 is a lighting and depth treatment reference ONLY; do not copy its robot.
Refine input 1 into a sophisticated cinematic architectural photograph, matching the restrained layered visual quality of reference 2 while keeping the target's distinct blue palette and instrument-museum setting.
Identity invariants: keep the slender cobalt blue machine, wide horizontal oval observation head and its recessed lenses, circular shoulder bearings, narrow waist, two coherent arms/hands and legs, stable feet and relaxed stance. Keep it on the right, roughly x=54%-80%. Give the full head 9%-12% headroom and keep the feet around y=90%; slightly reduce the whole figure within the frame if needed rather than clipping any part. Do not turn it into the bulky green robot.
Depth: a small softly blurred dark foreground structural edge at the extreme right and a subtle floor-edge foreground at bottom; crisp beautifully crafted blue enamel and dark titanium in the middle; repeated arches and instruments receding into soft cool atmospheric distance. Preserve the celestial globe in the upper right background but reduce its contrast so it supports the main subject. Left 38% should be quiet dark low-contrast architecture for white homepage copy; tame the bright left windows without losing their architectural shapes.
Light: directional natural high-window daylight, cool luminous blue armor highlights with delicate champagne reflected edges and warm brass points, refined luminous but readable shadows. Subtle narrow distant volumetric light, no blanket gray haze. Main figure separates clearly from the softer lower-contrast background. Less uniform micro-scratching, elegant satin enamel, machined metal edges, soft broken floor reflections.
Preserve the original scene and identity. No text, UI, logos, borders, new characters, weapons, neon, heavy bloom, artificial vignette, excessive fog, melted joints, extra limbs, cropped feet or head. Original calm scholarly industrial atmosphere.
```

## maintainer

```text
Use case: style-transfer.
Asset type: full-bleed 16:9 homepage hero artwork, preserve original native aspect ratio.
Input 1 is the edit target: the OLD COPPER heavy maintenance mecha in a monumental service hall. Input 2 is a lighting/depth art-direction reference ONLY, never copy its green machine.
Primary request: refine the target scene with the same sophisticated foreground/middle-ground/background separation as the reference, keeping its own robust copper industrial identity.
Keep the wide squared shoulders, small rectangular head with exactly two warm amber optical lenses, compact powerful torso, heavy articulated arms and complete practical hands, thick load-bearing legs, broad grounded feet and calm asymmetric stance. Preserve subject placement on the right and the service-hall architecture. Entire machine visible; head top near 10%-12% of frame, feet near 90%. Slightly relax framing if needed for headroom.
Make the copper feel like beautifully aged warm reddish-brown metal with restrained patina and satin surfaces, not uniformly orange rust; charcoal chassis and precise machined joints. Selective warm natural side light catches the head and shoulder contours, with soft warm bounce at the feet. Deep cool blue-gray shadows and a lightly softened receding aisle separate it from the background. Simplify the distant maintenance displays by reducing contrast, not adding props. Retain existing background objects only as quiet silhouettes.
A softly blurred dark foreground structural edge confined to the extreme right and small lower corners frames the sharp middle-ground robot. Long floor seams and soft broken reflections lead into architectural depth; background portal frames fade gradually into cool distance. Left 38%-40% stays dark, spacious and low contrast for large white homepage text. No foreground clutter in the copy zone.
Lighting stays believable and luminous, with a few restrained diagonal rays from the existing high windows. Avoid clipping metal highlights. Rich readable shadows; subtle dust in light only. Calm, monumental, coherent architectural photograph with premium cinematic color discipline.
Preserve the original identity and scene. No text, logos, UI, people, extra robots, weapons, neon, overdone glow, blanket fog, artificial vignette, cutout effect, extra/missing limbs, cropped head or feet.
```

## surveyor

```text
Use case: style-transfer.
Asset type: full-bleed 16:9 homepage hero artwork; preserve original native aspect ratio.
Input 1 is the EDIT TARGET: graphite long-range survey mecha in its mountain expedition archive hall. Input 2 is a lighting and depth reference ONLY; retain the target's graphite robot, not the reference's green robot.
Primary request: make this exact composition more refined and clearly layered, with photographic architectural atmosphere and tactile engineered materials.
Identity constraints: keep the deep graphite armor, slender vertical head with warm amber optical slit, compact back-mounted dish/antenna/scanning sensor array, broad load-bearing hips, long articulated legs and complete feet, two complete practical arms and hands, calm forward-ready asymmetric stance. Keep the museum architecture and snowy mountains glimpsed through high windows. No weapon. Place the whole machine on the right roughly x=51%-79%, entire head and antennas with comfortable headroom, feet near y=91%. Slightly reduce figure scale to leave at least 8%-10% top margin around the highest antenna. Keep the left 38% quiet for white homepage copy.
Three spatial planes: dark soft out-of-focus structural edge just at extreme right and a small near-floor foreground edge, precise tactile robot in the middle, repeated galleries and mountain windows receding into soft cool-blue distance. Reduce background display contrast and sharpness without adding props. The machine should stand out through rim light and material separation rather than looking pasted in.
Natural cool alpine window light reveals graphite-blue satin panels, subtle warm champagne grazes on machined edges and reflected floor light. Tiny amber equipment points remain restrained. Give the shadows depth but keep joints readable. A few thin distant shafts of light, subtle suspended dust, soft broken stone-floor reflections, realistic contact shadows. Strongest detail and tonal contrast belong to the robot; the far hall is quieter.
Preserve original subject identity and mechanical coherence. Calm, spacious, monumental premium cinematic finish. No text, letters, UI, logo, watermark, border, neon, excessive fog or bloom, artificial vignette, new people or robots, wings, spiky redesign, missing/fused limbs, clipped antenna/head/feet.
```


