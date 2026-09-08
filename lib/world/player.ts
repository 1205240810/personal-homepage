import type Phaser from 'phaser';
import { drawExplorer, type ExplorerDirection } from './jointed-player';
/** Four directions, sixteen full stride phases and a separate planted idle pose. */
export function makePlayerTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('explorer')) return;
  const cellW = 128,
    cellH = 176;
  const texture = scene.textures.createCanvas(
    'explorer',
    cellW * 17,
    cellH * 4,
  )!;
  for (let direction = 0; direction < 4; direction++)
    for (let frame = 0; frame < 17; frame++) {
      const x = frame * cellW,
        y = direction * cellH;
      const ctx = texture.context;
      ctx.save();
      ctx.translate(x, y);
      drawExplorer(
        ctx,
        direction as ExplorerDirection,
        (frame / 16) * Math.PI * 2,
        frame < 16,
      );
      ctx.restore();
      texture.add(
        frame === 16 ? `idle-${direction}` : `walk-${direction}-${frame}`,
        0,
        x,
        y,
        cellW,
        cellH,
      );
    }
  texture.refresh();
}
export function posePlayer(
  sprite: Phaser.GameObjects.Sprite,
  direction: number,
  frame: number,
) {
  sprite
    .setFrame(frame < 0 ? `idle-${direction}` : `walk-${direction}-${frame}`)
    .setOrigin(0.5, 166 / 176);
}
