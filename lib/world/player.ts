import type Phaser from 'phaser';
import atlas from './explorer-frames.json';
/** Frame rectangles and foot pivots are measured from the original transparent artwork. */
export function makePlayerTextures(scene: Phaser.Scene) {
  const texture = scene.textures.get('explorer');
  for (const frame of atlas.frames) {
    const r = frame.sourceRect,
      key = `walk-${frame.row}-${frame.column}`;
    if (!texture.has(key)) texture.add(key, 0, r.x, r.y, r.width, r.height);
  }
}
export function posePlayer(
  sprite: Phaser.GameObjects.Sprite,
  direction: number,
  frame: number,
) {
  const f = atlas.frames[direction * 8 + frame];
  sprite
    .setFrame(`walk-${direction}-${frame}`)
    .setOrigin(
      f.pivotWithinRect.x / f.sourceRect.width,
      f.pivotWithinRect.y / f.sourceRect.height,
    );
}
