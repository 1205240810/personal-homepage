import type Phaser from 'phaser';
/** Original pixel character. Eight gait frames, opposite arm/leg swing, and a planted idle pose. */
export function makePlayerTextures(scene: Phaser.Scene) {
  for (let direction = 0; direction < 4; direction++)
    for (let frame = 0; frame < 8; frame++) {
      const key = `walker-${direction}-${frame}`;
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, 32, 42)!;
      const c = texture.context;
      c.imageSmoothingEnabled = false;
      const phase = (frame * Math.PI) / 4,
        swing = Math.round(Math.sin(phase) * 3),
        bob = Math.round(Math.abs(Math.sin(phase)) * 1);
      const side = direction === 1 || direction === 2,
        left = direction === 1,
        back = direction === 3;
      const rect = (
        x: number,
        y: number,
        w: number,
        h: number,
        color: string,
      ) => {
        c.fillStyle = color;
        c.fillRect(Math.round(x), Math.round(y), w, h);
      };
      const limb = (x: number, y: number, dx: number, color: string) => {
        rect(x, y, 4, 5, color);
        rect(x + Math.round(dx * 0.5), y + 4, 4, 5, color);
        rect(x + dx, y + 8, 5, 3, '#172c34');
      };
      if (side) {
        limb(13, 28, -swing, '#3c6663');
        rect(left ? 18 : 10, 17 + bob, 4, 11, '#9c723d');
        rect(14, 17 + bob, 4, 8, '#97a89c');
        rect(14 - swing, 23 + bob, 4, 4, '#c79f7e');
      } else {
        const leftLift = Math.max(0, swing),
          rightLift = Math.max(0, -swing);
        rect(10, 28, 5, 10 - leftLift, '#416f69');
        rect(19, 28, 5, 10 - rightLift, '#527d73');
        rect(9, 38 - leftLift, 6, 3, '#172c34');
        rect(18, 38 - rightLift, 6, 3, '#172c34');
      }
      rect(side ? 12 : 10, 15 + bob, side ? 10 : 14, 13, '#648681');
      rect(side ? 13 : 11, 16 + bob, side ? 6 : 10, 10, '#8fa799');
      rect(side ? 12 : 10, 27 + bob, side ? 10 : 14, 2, '#6f8777');
      if (side) {
        limb(15, 28, swing, '#638679');
        rect(left ? 10 : 21, 17 + bob, 4, 6, '#8aa699');
        rect((left ? 10 : 21) + swing, 23 + bob, 4, 5, '#d6b08b');
      } else {
        rect(7, 16 + bob, 4, 8 - swing, '#779889');
        rect(7, 23 - swing + bob, 4, 4, '#d6b08b');
        rect(24, 16 + bob, 4, 8 + swing, '#5c8076');
        rect(24, 23 + swing + bob, 4, 4, '#c9a281');
      }
      // Neck, irregular hair silhouette, profile eyes and a warm maintenance collar.
      rect(14, 12 + bob, 6, 4, '#c29a78');
      rect(10, 4 + bob, 14, 9, '#d7b38c');
      rect(9, 3 + bob, 15, 5, '#263b40');
      rect(11, 1 + bob, 11, 3, '#354951');
      rect(8, 5 + bob, 3, 5, '#263b40');
      rect(22, 5 + bob, 3, 5, '#1d3138');
      rect(12, 2 + bob, 7, 1, '#52645e');
      if (back) {
        rect(10, 7 + bob, 14, 6, '#293e44');
        rect(13, 13 + bob, 9, 2, '#476058');
      } else if (side) {
        rect(left ? 10 : 22, 8 + bob, 2, 2, '#122a31');
        rect(left ? 8 : 24, 10 + bob, 2, 2, '#d7b38c');
        rect(left ? 14 : 18, 12 + bob, 4, 1, '#ad8468');
      } else {
        rect(12, 9 + bob, 2, 2, '#162e35');
        rect(20, 9 + bob, 2, 2, '#162e35');
        rect(15, 12 + bob, 4, 1, '#ae8666');
      }
      rect(12, 15 + bob, 10, 2, '#c79653');
      if (back) {
        rect(11, 18 + bob, 12, 10, '#9e743d');
        rect(12, 18 + bob, 10, 7, '#d1a15d');
        rect(14, 20 + bob, 6, 3, '#e0b56e');
        rect(12, 26 + bob, 10, 2, '#785733');
      } else if (side) {
        rect(left ? 20 : 8, 18 + bob, 5, 10, '#af8042');
        rect(left ? 21 : 8, 18 + bob, 4, 6, '#d2a05b');
      } else {
        rect(12, 17 + bob, 2, 10, '#9c7b4c');
        rect(22, 17 + bob, 2, 10, '#9c7b4c');
        rect(17, 19 + bob, 3, 2, '#527a73');
      }
      texture.refresh();
    }
}
