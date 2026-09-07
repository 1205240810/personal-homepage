import Phaser from 'phaser';
import type { Point, SceneDefinition } from './types';
import { traversable, clearSegment } from './navigation';
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
  private ball?: Phaser.GameObjects.Container;
  private ballShadow?: Phaser.GameObjects.Ellipse;
  private ballVelocity = { x: 0, y: 0 };
  private goal?: Phaser.GameObjects.Graphics;
  private scored = false;
  private rotation = 0;
  private kickCount = 0;
  ballPosition = { x: 760, y: 655 };
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
    if (def.id === 'hub') {
      this.createPlayground();
    } else this.createRoomAtmosphere();
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
      this.scene.add.ellipse(x, y, w, h, 0x45523a, 0.11).setDepth(2);
    if (this.reduced) return;
    for (let i = 0; i < 7; i++) {
      const mote = this.scene.add
        .circle(340 + i * 123, 410 + ((i * 57) % 275), 1.2, 0xfff4d4, 0.18)
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
  private createPlayground() {
    this.goal = this.scene.add.graphics().setDepth(4);
    this.goal.fillStyle(0x97774e);
    this.goal.fillRoundedRect(803, 519, 10, 27, 2);
    this.goal.fillRoundedRect(875, 519, 10, 27, 2);
    this.goal.lineStyle(2, 0xb4996c, 0.8);
    this.goal.lineBetween(811, 525, 877, 525);
    this.goal.lineStyle(1, 0xa89671, 0.45);
    for (let i = 0; i < 6; i++)
      this.goal.lineBetween(813 + i * 12, 525, 813 + i * 12, 540);
    const body = this.scene.add.graphics();
    body.fillStyle(0xf0e7cd);
    body.fillCircle(0, -9, 12);
    body.lineStyle(2, 0x6e7f63);
    body.strokeCircle(0, -9, 11);
    body.lineBetween(-8, -17, 8, -2);
    body.lineBetween(8, -17, -8, -2);
    body.fillStyle(0xc2cfab, 0.6);
    body.fillCircle(-3, -13, 4);
    this.ball = this.scene.add
      .container(this.ballPosition.x, this.ballPosition.y, [body])
      .setSize(40, 40)
      .setInteractive({ useHandCursor: true });
    this.ball.on('pointerup', () => this.onObject('courtyard-ball'));
    this.ballShadow = this.scene.add
      .ellipse(this.ballPosition.x, this.ballPosition.y, 25, 8, 0x455339, 0.2)
      .setDepth(4);
  }
  kick(player: Point, facing: Point) {
    if (
      !this.ball ||
      Phaser.Math.Distance.BetweenPoints(player, this.ballPosition) > 65 ||
      !clearSegment(
        player,
        this.ballPosition,
        this.def.walkable,
        this.def.obstacles,
      )
    )
      return false;
    let dx = this.ballPosition.x - player.x,
      dy = this.ballPosition.y - player.y,
      length = Math.hypot(dx, dy);
    if (length < 5) {
      dx = facing.x;
      dy = facing.y;
      length = Math.hypot(dx, dy) || 1;
    }
    this.ballVelocity = { x: (dx / length) * 335, y: (dy / length) * 335 };
    this.kickCount++;
    if (this.kickCount === 1)
      this.onNotice('让小球滚过广场边的两个木桩。靠近后按 F，也可以点击它。');
    return true;
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
    if (this.ball && this.ballShadow) {
      const dt = Math.min(delta, 40) / 1000,
        p = this.ballPosition,
        v = this.ballVelocity;
      const nx = p.x + v.x * dt,
        ny = p.y + v.y * dt;
      if (
        traversable(
          { x: nx, y: p.y },
          this.def.walkable,
          this.def.obstacles,
          12,
        )
      )
        p.x = nx;
      else v.x *= -0.62;
      if (
        traversable(
          { x: p.x, y: ny },
          this.def.walkable,
          this.def.obstacles,
          12,
        )
      )
        p.y = ny;
      else v.y *= -0.62;
      const drag = Math.exp(-1.55 * dt);
      v.x *= drag;
      v.y *= drag;
      const speed = Math.hypot(v.x, v.y);
      if (speed < 4) {
        v.x = 0;
        v.y = 0;
      }
      this.rotation += (speed * dt) / 16;
      this.ball
        .setPosition(p.x, p.y)
        .setDepth(p.y)
        .setAngle(speed > 4 ? Math.sin(this.rotation) * 4 : 0);
      this.ballShadow.setPosition(p.x, p.y);
      if (!this.scored && p.x > 809 && p.x < 879 && p.y < 550 && p.y > 512) {
        this.scored = true;
        this.onNotice('进了！这份午后的快乐，留在小院里。');
        const glow = this.scene.add
          .ellipse(844, 540, 90, 26, 0xc5da8a, 0.55)
          .setDepth(5);
        this.scene.tweens.add({
          targets: glow,
          alpha: 0,
          scale: 1.7,
          duration: this.reduced ? 50 : 1200,
          onComplete: () => glow.destroy(),
        });
        this.scene.time.delayedCall(2400, () => {
          this.ballPosition = { x: 760, y: 655 };
          this.ballVelocity = { x: 0, y: 0 };
          this.scored = false;
        });
      }
    }
    return inShade;
  }
}
