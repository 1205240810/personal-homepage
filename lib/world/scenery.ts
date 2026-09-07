import Phaser from 'phaser';
import type { Point, SceneDefinition } from './types';
export type SceneryLayer = {
  id: string;
  art: string;
  x: number;
  y: number;
  width: number;
  anchor: Point;
  sourceWidth: number;
  outline?: number[][];
  depth?: number;
  nodeId?: string;
  canopy?: boolean;
};
export type DoorDefinition = {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** World objects are independent sprites. Their feet determine occlusion with the player. */
export class CourtyardScenery {
  private objects: {
    sprite: Phaser.GameObjects.Image;
    layer: SceneryLayer;
    alpha: number;
  }[] = [];
  private doors = new Map<
    string,
    {
      g: Phaser.GameObjects.Graphics;
      light: Phaser.GameObjects.Graphics;
      def: DoorDefinition;
      open: number;
    }
  >();
  constructor(
    private scene: Phaser.Scene,
    private def: SceneDefinition,
    private reduced: boolean,
    private onObject: (nodeId: string) => void,
    private onNotice: (message: string) => void,
  ) {
    for (const layer of def.layers ?? []) {
      const atlas = scene.textures.get(`layer:${layer.art}`);
      const texture = atlas.getSourceImage() as HTMLImageElement;
      const bounds = layer.outline
        ? {
            x: Math.floor(Math.min(...layer.outline.map((p) => p[0]))),
            y: Math.floor(Math.min(...layer.outline.map((p) => p[1]))),
            right: Math.ceil(Math.max(...layer.outline.map((p) => p[0]))),
            bottom: Math.ceil(Math.max(...layer.outline.map((p) => p[1]))),
          }
        : { x: 0, y: 0, right: texture.width, bottom: texture.height };
      const frameWidth = bounds.right - bounds.x,
        frameHeight = bounds.bottom - bounds.y;
      let renderKey = `layer:${layer.art}`;
      if (layer.outline) {
        // The outline is static: composite it once into a Phaser texture instead of
        // running a full mask pass for every piece of furniture on every frame.
        renderKey = `scenery:${def.id}:${layer.id}`;
        if (!scene.textures.exists(renderKey)) {
          const clipped = scene.textures.createCanvas(
            renderKey,
            frameWidth,
            frameHeight,
          )!;
          const context = clipped.context;
          context.imageSmoothingEnabled = false;
          context.save();
          context.beginPath();
          layer.outline.forEach(([x, y], index) => {
            if (index === 0) context.moveTo(x - bounds.x, y - bounds.y);
            else context.lineTo(x - bounds.x, y - bounds.y);
          });
          context.closePath();
          context.clip();
          context.drawImage(
            texture,
            bounds.x,
            bounds.y,
            frameWidth,
            frameHeight,
            0,
            0,
            frameWidth,
            frameHeight,
          );
          context.restore();
          clipped.refresh();
        }
        const key = renderKey;
        scene.events.once('shutdown', () => scene.textures.remove(key));
      }
      const scale = layer.width / layer.sourceWidth;
      const sprite = scene.add
        .image(layer.x, layer.y, renderKey)
        .setOrigin(
          (layer.anchor.x - bounds.x) / frameWidth,
          (layer.anchor.y - bounds.y) / frameHeight,
        )
        .setScale(scale)
        .setDepth(layer.depth ?? layer.y - 20);
      if (
        layer.id === 'workshop' &&
        scene.game.renderer.type === Phaser.WEBGL
      ) {
        sprite.enableFilters();
        sprite.filters!.internal.addKey({
          color: 0xf703f8,
          threshold: 0.24,
          feather: 0.12,
        });
      }
      if (layer.nodeId) {
        if (def.doors?.some((door) => door.nodeId === layer.nodeId))
          for (let i = 0; i < 3; i++)
            scene.add
              .ellipse(
                layer.x - 60 + i * 5,
                layer.y + 13,
                layer.width * (0.76 + i * 0.035),
                18 + i * 7,
                0x414e30,
                0.045,
              )
              .setDepth(2);
        if (layer.outline)
          sprite.setInteractive({
            useHandCursor: true,
            hitArea: new Phaser.Geom.Polygon(
              layer.outline.flatMap(([x, y]) => [x - bounds.x, y - bounds.y]),
            ),
            hitAreaCallback: Phaser.Geom.Polygon.Contains,
          });
        else
          sprite.setInteractive({
            useHandCursor: true,
            pixelPerfect: true,
            alphaTolerance: 100,
          });
        sprite.on('pointerup', () => onObject(layer.nodeId!));
        sprite.on('pointerover', () => sprite.setTint(0xf4ffeb));
        sprite.on('pointerout', () => sprite.clearTint());
      }
      this.objects.push({ sprite, layer, alpha: 1 });
      if (layer.canopy) {
        scene.add
          .ellipse(
            layer.x - 38,
            layer.y - 15,
            layer.width * 0.65,
            layer.width * 0.16,
            0x445331,
            0.13,
          )
          .setDepth(2);
      }
    }
    for (const def of this.def.doors ?? []) {
      const light = scene.add.graphics().setDepth(3),
        g = scene.add.graphics().setDepth(def.y - 18);
      this.doors.set(def.nodeId, { g, light, def, open: 0 });
      this.drawDoor(def.nodeId, 0);
    }
    if (!def.outdoor) this.createRoomAtmosphere();
  }
  private drawDoor(id: string, open: number) {
    const door = this.doors.get(id);
    if (!door) return;
    door.open = open;
    const { g, light, def: d } = door,
      w = d.width * Math.cos(open * Math.PI * 0.46),
      shift = -d.width * 0.23 * Math.sin(open * Math.PI * 0.46),
      x = d.x - d.width / 2,
      y = d.y;
    g.clear();
    g.fillStyle(0x846744);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(x, y - d.height),
        new Phaser.Math.Vector2(x + w, y - d.height + shift),
        new Phaser.Math.Vector2(x + w, y + shift),
        new Phaser.Math.Vector2(x, y),
      ],
      true,
    );
    g.lineStyle(1.5, 0x4d4931, 0.85);
    g.strokePoints(
      [
        new Phaser.Math.Vector2(x, y - d.height),
        new Phaser.Math.Vector2(x + w, y - d.height + shift),
        new Phaser.Math.Vector2(x + w, y + shift),
        new Phaser.Math.Vector2(x, y),
      ],
      true,
    );
    g.lineStyle(1, 0xb1986a, 0.75);
    for (let i = 1; i < 5; i++)
      g.lineBetween(
        x + (w * i) / 5,
        y - d.height + (shift * i) / 5,
        x + (w * i) / 5,
        y + (shift * i) / 5,
      );
    g.fillStyle(0xd7c296);
    g.fillCircle(x + w * 0.84, y - d.height * 0.48 + shift * 0.84, 2.2);
    light.clear();
    if (open) {
      light.fillStyle(0xf5cf83, open * 0.17);
      light.fillPoints(
        [
          new Phaser.Math.Vector2(x, y),
          new Phaser.Math.Vector2(x + d.width, y),
          new Phaser.Math.Vector2(x + d.width + 34, y + 55),
          new Phaser.Math.Vector2(x - 25, y + 55),
        ],
        true,
      );
    }
  }
  hasDoor(id: string) {
    return this.doors.has(id);
  }
  private createRoomAtmosphere() {
    const shadows: Record<string, number[][]> = {
      undergraduate: [
        [264, 758, 290, 25],
        [231, 809, 132, 15],
        [1418, 739, 135, 18],
      ],
      graduate: [
        [200, 658, 248, 24],
        [147, 737, 84, 15],
        [1360, 609, 150, 19],
      ],
      life: [
        [439, 461, 200, 23],
        [1284, 681, 150, 22],
      ],
    };
    for (const [x, y, w, h] of shadows[this.def.id] ?? [])
      this.scene.add
        .ellipse(x * 0.42, y * 0.42, w * 0.42, h * 0.42, 0x45523a, 0.11)
        .setDepth(2);
    if (this.reduced) return;
    for (let i = 0; i < 7; i++) {
      const mote = this.scene.add
        .circle(
          (340 + i * 123) * 0.42,
          (410 + ((i * 57) % 275)) * 0.42,
          1.2,
          0xfff4d4,
          0.18,
        )
        .setDepth(1300);
      this.scene.tweens.add({
        targets: mote,
        x: mote.x + 18,
        y: mote.y - 26,
        alpha: 0.52,
        duration: 3300 + i * 271,
        yoyo: true,
        repeat: -1,
        delay: i * 270,
      });
    }
  }
  openDoor(id: string, done: () => void) {
    const door = this.doors.get(id);
    if (!door) {
      done();
      return () => {};
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.drawDoor(id, 1);
      done();
    };
    if (this.reduced || door.open === 1) {
      finish();
      return () => {};
    }
    const tween = this.scene.tweens.addCounter({
      from: door.open,
      to: 1,
      duration: 340,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => this.drawDoor(id, t.getValue() ?? 1),
      onComplete: finish,
    });
    return () => {
      tween.stop();
      finish();
    };
  }
  update(player: Point, delta: number, time: number) {
    let inShade = false;
    for (const object of this.objects) {
      const { sprite, layer } = object;
      if (!layer.canopy) continue;
      const behind =
        Math.abs(player.x - layer.x) < layer.width * 0.35 &&
        player.y < layer.y + 15 &&
        player.y > layer.y - layer.width * 0.7;
      const target = behind ? 0.38 : 1;
      object.alpha += (target - object.alpha) * Math.min(1, delta / 160);
      sprite.setAlpha(object.alpha);
      if (behind) inShade = true;
      if (!this.reduced)
        sprite.setAngle(Math.sin(time / 1900 + layer.x) * 0.32);
    }
    return inShade;
  }
}
