import Phaser from 'phaser';
import { canWalk } from './geometry';
import mechanismAtlas from './mechanism-frames.json';
import { waterLevel } from './exploration';
import type { ExplorationState, Point, SceneDefinition } from './types';
const P = {
  water: 0x629b9a,
  deep: 0x427d81,
  foam: 0xc9e4cd,
  wood: 0xa88150,
  edge: 0x65553e,
  light: 0xd8b37d,
  brass: 0xd9ac58,
};
/** The ground and visible shoreline share the exact collision polygons. Props remain separate depth-sorted sprites. */
export class RiverRenderer {
  private bridge?: Phaser.GameObjects.Container;
  private gauge?: Phaser.GameObjects.Graphics;
  private wheel?: Phaser.GameObjects.Container;
  private valves: { id: string; rotor: Phaser.GameObjects.Container }[] = [];
  private liftLamp?: Phaser.GameObjects.Arc;
  private ripple: {
    sprite: Phaser.GameObjects.Ellipse;
    x: number;
    y: number;
    phase: number;
  }[] = [];
  private progress: ExplorationState;
  private cat?: Phaser.GameObjects.Graphics;
  private lens?: Phaser.GameObjects.Container;
  private wind: Phaser.GameObjects.Ellipse[] = [];
  private flowers: Phaser.GameObjects.Arc[] = [];
  constructor(
    private scene: Phaser.Scene,
    private def: SceneDefinition,
    progress: ExplorationState,
    private reduced: boolean,
    private interact: (id: string) => void,
  ) {
    this.progress = { ...progress };
    const atlas = scene.textures.get('mechanisms');
    for (const f of mechanismAtlas.frames) {
      const r = f.sourceRect;
      if (!atlas.has(f.id)) atlas.add(f.id, 0, r.x, r.y, r.width, r.height);
    }
    this.ground();
    for (const b of def.terrain!.bridges) {
      const image = this.asset(
        'floating-bridge',
        b.x + b.width / 2,
        b.y + b.height / 2,
        'deckCenter',
        0.55,
      ).setDepth(3);
      this.bridge = scene.add.container(b.x, b.y, [image]);
      image.setPosition(b.width / 2, b.height / 2);
      const front = this.clipped(
        'bridge-rail',
        [
          [65, 257],
          [349, 286],
          [645, 257],
          [660, 317],
          [376, 334],
          [48, 321],
        ],
        355,
        308,
      );
      front
        .setPosition(b.x + b.width / 2, b.y + b.height / 2)
        .setScale(0.55)
        .setDepth(b.y + b.height);
      if (!progress.bridge) front.setAlpha(0.64).setY(front.y + 27);
      this.bridge.setData('front', front);
      this.bridge.y = b.y + (progress.bridge ? 0 : 27);
      this.bridge.setAlpha(progress.bridge ? 1 : 0.64);
    }
    if (def.id === 'hub') {
      this.valve('sluice-intake', 1090, 650, 'intake');
      this.valve('sluice-outlet', 1090, 1060, 'outlet');
      this.gauge = scene.add.graphics().setDepth(790);
      this.drawGauge();
      this.plaque(1160, 770, 'sluice-note');
      this.lift(475, 940, 'hub-lift');
      this.waypost(2180, 930, 1);
      this.waypost(655, 956, 1);
      // The cat is visible before discovery, tucked just beyond the main path.
      const cat = scene.add.graphics().setDepth(1180).setPosition(592, 1170);
      cat.fillStyle(0x644f3b).fillEllipse(0, 0, 31, 16).fillCircle(12, -7, 10);
      cat
        .fillTriangle(5, -12, 7, -23, 14, -14)
        .fillTriangle(13, -14, 21, -23, 22, -10);
      cat.fillStyle(0xc6b18b).fillEllipse(-2, -2, 25, 9);
      cat.lineStyle(4, 0x644f3b).lineBetween(-15, 1, -24, -4);
      cat
        .lineStyle(1, 0x39392e)
        .lineBetween(10, -6, 13, -5)
        .lineBetween(17, -6, 20, -5);
      this.cat = cat;
      cat
        .setInteractive(
          new Phaser.Geom.Rectangle(-28, -28, 62, 40),
          Phaser.Geom.Rectangle.Contains,
        )
        .on('pointerup', () => interact('mechanical-cat'));
    } else {
      this.lift(1090, 890, 'mill-lift');
      this.waterwheel(992, 646);
      this.picnic(750, 955);
      this.waypost(270, 850, -1);
      const lens = scene.add
        .container(1120, 405, [
          scene.add.rectangle(0, 0, 31, 22, 0x687f75),
          scene.add.circle(0, 0, 8, 0x273f3c),
          scene.add.circle(1, 0, 4, 0xdbb867),
        ])
        .setDepth(423);
      this.lens = lens;
      lens
        .setSize(40, 40)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => interact('mecha-eye'));
    }
    this.ambience();
  }
  private ground() {
    const { scene, def } = this,
      key = `terrain:${def.id}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, def.width, def.height)!;
    const c = tex.context;
    c.imageSmoothingEnabled = false;
    let seed = def.id === 'hub' ? 137 : 643;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const shape = (p: number[][], dy = 0) => {
      c.beginPath();
      p.forEach(([x, y], i) => (i ? c.lineTo(x, y + dy) : c.moveTo(x, y + dy)));
      c.closePath();
    };
    const source = scene.textures
      .get(`world:${def.art}`)
      .getSourceImage() as HTMLImageElement;
    const material = (name: string, x: number) => {
      const key = `material:${def.id}:${name}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const tile = scene.textures.createCanvas(key, 625, 1254)!;
      tile.context.drawImage(source, x, 0, 625, 1254, 0, 0, 625, 1254);
      tile.refresh();
      scene.events.once('shutdown', () => scene.textures.remove(key));
      return tile.getSourceImage() as HTMLCanvasElement;
    };
    const grass = material('grass', 0),
      stone = material('stone', 629);
    const grassPattern = c.createPattern(grass, 'repeat')!;
    grassPattern.setTransform(new DOMMatrix().scale(0.68));
    const stonePattern = c.createPattern(stone, 'repeat')!;
    stonePattern.setTransform(new DOMMatrix().scale(0.42));
    c.fillStyle = '#639c9b';
    c.fillRect(0, 0, def.width, def.height);
    // Water has depth, reflected light and slow independent ripples above it.
    for (let i = 0; i < 18000; i++) {
      const x = rnd() * def.width,
        y = rnd() * def.height;
      c.fillStyle = ['#689f9c', '#6ba49f', '#5b9295', '#72aaa2'][i % 4];
      c.globalAlpha = 0.45;
      c.fillRect(x, y, 4 + rnd() * 17, 2);
    }
    c.globalAlpha = 1;
    for (const land of def.terrain!.islands) {
      shape(land, 29);
      c.fillStyle = '#325f62';
      c.fill();
      shape(land, 20);
      c.fillStyle = '#77796a';
      c.fill();
      shape(land, 11);
      c.fillStyle = '#a7aa8d';
      c.fill();
      shape(land);
      c.fillStyle = '#d6d2aa';
      c.fill();
      c.save();
      shape(land);
      c.clip();
      c.fillStyle = grassPattern;
      c.fillRect(0, 0, def.width, def.height);
      c.globalAlpha = 0.06;
      c.fillStyle = '#e8d5a3';
      c.fillRect(0, 0, def.width, def.height);
      c.globalAlpha = 1;
      // Ground-level stone paths guide movement without constraining the grass.
      for (const path of def.terrain!.paths) {
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.beginPath();
        path.points.forEach(([x, y], i) =>
          i ? c.lineTo(x, y) : c.moveTo(x, y),
        );
        c.lineWidth = path.width + 1;
        c.strokeStyle = stonePattern;
        c.stroke();
        c.lineWidth = path.width;
        c.strokeStyle = stonePattern;
        c.stroke();
        // Scattered edge stones soften the path silhouette without hiding its route.
        for (let j = 1; j < path.points.length; j++) {
          const [ax, ay] = path.points[j - 1],
            [bx, by] = path.points[j],
            len = Math.hypot(bx - ax, by - ay),
            nx = -(by - ay) / len,
            ny = (bx - ax) / len;
          for (let t = 0; t < len; t += 15) {
            const x = ax + ((bx - ax) * t) / len,
              y = ay + ((by - ay) * t) / len;
            for (const side of [-1, 1]) {
              const r = path.width / 2 + (rnd() - 0.5) * 12;
              c.save();
              c.beginPath();
              c.ellipse(
                x + nx * r * side,
                y + ny * r * side,
                5 + rnd() * 6,
                4 + rnd() * 4,
                0,
                0,
                Math.PI * 2,
              );
              c.clip();
              c.fillStyle = stonePattern;
              c.fillRect(x - 100, y - 100, 200, 200);
              c.restore();
            }
          }
        }
      }
      c.restore();
      // Individual bank stones follow each traversability edge, so collision is legible.
      for (let j = 0; j < land.length; j++) {
        const a = land[j],
          b = land[(j + 1) % land.length],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0; t < len; t += 20) {
          const x = a[0] + ((b[0] - a[0]) * t) / len,
            y = a[1] + ((b[1] - a[1]) * t) / len;
          c.fillStyle = '#6b7765';
          c.beginPath();
          c.ellipse(x, y + 4, 13, 11, 0, 0, Math.PI * 2);
          c.fill();
          c.save();
          c.beginPath();
          c.ellipse(x, y, 13, 10, 0, 0, Math.PI * 2);
          c.clip();
          c.drawImage(
            stone,
            Math.floor(rnd() * 560),
            Math.floor(rnd() * 1100),
            52,
            45,
            x - 14,
            y - 12,
            28,
            24,
          );
          c.restore();
        }
      }
    }
    if (def.id === 'life') {
      c.fillStyle = '#6b9690';
      c.fillRect(935, 130, 88, 566);
      c.fillStyle = '#aac0a4';
      c.fillRect(937, 130, 5, 566);
      c.fillRect(1015, 130, 5, 566);
      c.fillStyle = '#518582';
      c.fillRect(943, 130, 72, 568);
      for (let y = 150; y < 690; y += 23) {
        c.fillStyle = '#91b7a4';
        c.fillRect(951, y, 35 + (y % 19), 2);
      }
    }
    tex.refresh();
    scene.add.image(0, 0, key).setOrigin(0).setDepth(0);
    scene.events.once('shutdown', () => scene.textures.remove(key));
  }
  private deck(x: number, y: number, w: number, h: number, rails = false) {
    const s = this.scene,
      g = s.add.graphics();
    g.fillStyle(0x253d3a, 0.22).fillRect(-7, 15, w + 14, h + 8);
    g.fillStyle(P.edge).fillRect(-3, 4, w + 6, h + 9);
    for (let i = 0; i < w; i += 19) {
      g.fillStyle(i % 38 ? 0xb5915e : 0xa58353).fillRect(i, 0, 17, h);
      g.fillStyle(0xe1c190, 0.7).fillRect(i, 0, 17, 3);
      g.lineStyle(1, 0x75613f, 0.6).lineBetween(i + 6, 9, i + 6, h - 9);
      g.fillStyle(0x665e47)
        .fillRect(i + 7, 7, 2, 2)
        .fillRect(i + 7, h - 10, 2, 2);
    }
    if (rails) {
      g.fillStyle(0x68583c)
        .fillRect(-8, -10, w + 16, 7)
        .fillRect(-8, h - 3, w + 16, 8);
      g.fillStyle(0xc2a774)
        .fillRect(-8, -11, w + 16, 3)
        .fillRect(-8, h - 4, w + 16, 3);
    }
    return s.add.container(x, y, [g]);
  }
  private asset(
    id: string,
    x: number,
    y: number,
    anchor: string,
    scale: number,
  ) {
    const f = mechanismAtlas.frames.find((f) => f.id === id)!;
    const anchors = f.anchorsWithinRect as Partial<
      Record<string, { x: number; y: number }>
    >;
    const a = anchors[anchor]!;
    return this.scene.add
      .image(x, y, 'mechanisms', id)
      .setOrigin(a.x / f.sourceRect.width, a.y / f.sourceRect.height)
      .setScale(scale);
  }
  private clipped(
    id: string,
    outline: number[][],
    anchorX: number,
    anchorY: number,
  ) {
    const key = `mechanism-part:${this.def.id}:${id}`;
    const minX = Math.floor(Math.min(...outline.map((p) => p[0]))),
      minY = Math.floor(Math.min(...outline.map((p) => p[1]))),
      w = Math.ceil(Math.max(...outline.map((p) => p[0]))) - minX,
      h = Math.ceil(Math.max(...outline.map((p) => p[1]))) - minY;
    if (!this.scene.textures.exists(key)) {
      const t = this.scene.textures.createCanvas(key, w, h)!,
        c = t.context;
      c.save();
      c.beginPath();
      outline.forEach(([x, y], i) =>
        i ? c.lineTo(x - minX, y - minY) : c.moveTo(x - minX, y - minY),
      );
      c.closePath();
      c.clip();
      c.drawImage(
        this.scene.textures
          .get('mechanisms')
          .getSourceImage() as HTMLImageElement,
        -minX,
        -minY,
      );
      c.restore();
      t.refresh();
      this.scene.events.once('shutdown', () => this.scene.textures.remove(key));
    }
    return this.scene.add
      .image(0, 0, key)
      .setOrigin((anchorX - minX) / w, (anchorY - minY) / h);
  }
  private valve(id: string, x: number, y: number, kind: 'intake' | 'outlet') {
    this.asset('sluice-valve', x + 39, y - 5, 'ground', 0.185)
      .setDepth(y - 8)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.interact(id));
    const rg = this.scene.add.graphics();
    rg.lineStyle(2, 0xffdda0, 0.9).lineBetween(0, 0, 0, -22);
    const rotor = this.scene.add.container(x + 39, y - 74, [rg]).setDepth(y);
    rotor.angle = this.progress[kind] * 120;
    this.valves.push({ id, rotor });
  }
  private drawGauge() {
    const g = this.gauge!;
    g.clear();
    g.fillStyle(0x655e48).fillRect(1194, 688, 27, 87);
    g.fillStyle(0xd3cdab).fillRect(1198, 691, 20, 79);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i === 3 ? 0xb18434 : 0x81927e).fillRect(
        1203,
        757 - i * 13,
        i === 3 ? 18 : 10,
        i === 3 ? 4 : 2,
      );
    }
    const level = waterLevel(this.progress);
    g.fillStyle(0x4b8c88, 0.9).fillRect(
      1199,
      757 - level * 13,
      4,
      12 + level * 13,
    );
    g.fillStyle(0xe8bd65).fillTriangle(
      1228,
      756 - level * 13,
      1237,
      750 - level * 13,
      1237,
      762 - level * 13,
    );
  }
  private plaque(x: number, y: number, id: string) {
    const s = this.scene,
      g = s.add
        .graphics()
        .setPosition(x, y - 20)
        .setDepth(y - 10);
    g.fillStyle(0x7a7460).fillRect(-18, -20, 36, 25);
    g.fillStyle(0xd6c8a0).fillRect(-17, -24, 34, 22);
    g.lineStyle(1, 0x777b61)
      .lineBetween(-10, -17, 10, -17)
      .lineBetween(-10, -11, 4, -11);
    g.fillStyle(0xa08042).fillRect(-1, -5, 3, 3);
    g.setInteractive(
      new Phaser.Geom.Rectangle(-26, -30, 52, 52),
      Phaser.Geom.Rectangle.Contains,
    ).on('pointerup', () => this.interact(id));
  }
  private lift(x: number, y: number, id: string) {
    const s = this.scene;
    const image = this.asset('wooden-lift', x, y - 3, 'entry', 0.29).setDepth(
      y - 12,
    );
    image
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.interact(id));
    const front = this.clipped(
      `lift-front-${id}`,
      [
        [680, 1105],
        [1202, 1105],
        [1202, 1180],
        [680, 1180],
      ],
      947,
      1090,
    )
      .setPosition(x, y - 3)
      .setScale(0.29)
      .setDepth(y + 24);
    const cable = s.add.graphics().setDepth(4);
    const dx = this.def.id === 'hub' ? 2100 : -1300,
      dy = this.def.id === 'hub' ? -550 : 390;
    cable
      .lineStyle(2, 0x415951, 0.5)
      .lineBetween(x - 16, y - 144, x + dx, y + dy)
      .lineBetween(x + 16, y - 144, x + dx + 32, y + dy);
    this.liftLamp = s.add
      .circle(x, y - 139, 3, this.progress.lift ? 0xf1c867 : 0x5c725e)
      .setDepth(y);
  }
  private waterwheel(x: number, y: number) {
    const key = `wheel-base:${this.def.id}`,
      source = this.scene.textures
        .get('mechanisms')
        .getSourceImage() as HTMLImageElement;
    const t = this.scene.textures.createCanvas(key, 547, 619)!,
      c = t.context;
    c.beginPath();
    c.rect(0, 0, 547, 619);
    c.arc(303 - 65, 884 - 574, 222, 0, Math.PI * 2);
    c.clip('evenodd');
    c.drawImage(source, -65, -574);
    t.refresh();
    this.scene.add
      .image(x, y + 34, key)
      .setOrigin(251 / 547, 612 / 619)
      .setScale(0.32)
      .setDepth(y + 40);
    this.scene.events.once('shutdown', () => this.scene.textures.remove(key));
    const center = { x: 303, y: 884 };
    const disk = this.clipped(
      'wheel-face',
      Array.from({ length: 64 }, (_, i) => [
        center.x + Math.cos((i * Math.PI) / 32) * 223,
        center.y + Math.sin((i * Math.PI) / 32) * 223,
      ]),
      center.x,
      center.y,
    ).setScale(0.32);
    this.wheel = this.scene.add
      .container(x - 4, y - 63, [disk])
      .setDepth(y + 41);
    this.clipped(
      'wheel-stand',
      [
        [255, 970],
        [346, 970],
        [435, 1190],
        [145, 1190],
      ],
      316,
      1186,
    )
      .setPosition(x, y + 34)
      .setScale(0.32)
      .setDepth(y + 42);
  }
  private picnic(x: number, y: number) {
    const g = this.scene.add
      .graphics()
      .setPosition(x, y - 19)
      .setDepth(y - 8);
    g.fillStyle(0x717966).fillRect(-41, -11, 82, 28);
    g.fillStyle(0xb7bca0).fillRoundedRect(-48, -30, 96, 35, 5);
    g.fillStyle(0xd7d6b5).fillRect(-41, -28, 82, 3);
    for (let i = 0; i < 4; i++)
      g.fillStyle(i % 2 ? 0xe1c482 : 0x738e82).fillRect(
        -24 + (i % 2) * 28,
        -23 + Math.floor(i / 2) * 12,
        18,
        9,
      );
    g.setInteractive(
      new Phaser.Geom.Rectangle(-50, -45, 100, 60),
      Phaser.Geom.Rectangle.Contains,
    ).on('pointerup', () => this.interact('memory-table'));
  }
  private waypost(x: number, y: number, dir: number) {
    const g = this.scene.add
      .graphics()
      .setPosition(x, y)
      .setDepth(y - 5);
    g.fillStyle(0x796c4b).fillRect(-3, -64, 7, 66);
    g.fillStyle(0xc4b58a).fillPoints(
      [
        new Phaser.Math.Vector2(-28, -65),
        new Phaser.Math.Vector2(20, -65),
        new Phaser.Math.Vector2(30, -53),
        new Phaser.Math.Vector2(20, -41),
        new Phaser.Math.Vector2(-28, -41),
      ],
      true,
    );
    g.lineStyle(2, 0x6d775d)
      .lineBetween(-13, -53, 15, -53)
      .lineBetween(dir * 15, -53, dir * 6, -60)
      .lineBetween(dir * 15, -53, dir * 6, -46);
  }
  private ambience() {
    const s = this.scene;
    for (let i = 0; i < 110; i++) {
      const x = (i * 331 + 91) % this.def.width,
        y = (i * 197 + 100) % this.def.height;
      if (canWalk({ x, y }, this.def.terrain!.islands, [])) continue;
      const r = s.add
        .ellipse(x, y, 9 + (i % 19), 2, 0xc1dece, 0.18)
        .setDepth(1);
      this.ripple.push({ sprite: r, x, y, phase: i });
    }
    if (!this.reduced) {
      for (let i = 0; i < 5; i++) {
        const shadow = s.add
          .ellipse(i * 700, 300 + i * 213, 520, 180, 0x355948, 0.06)
          .setAngle(-20)
          .setDepth(2);
        this.wind.push(shadow);
      }
      for (let i = 0; i < 12; i++)
        this.flowers.push(
          s.add
            .circle(
              350 + ((i * 151) % 1700),
              500 + ((i * 113) % 750),
              1.4,
              0xf9e6a7,
              0.65,
            )
            .setDepth(1800),
        );
    }
  }
  discover(id: string) {
    const target = id === 'maintenance-cat' ? this.cat : this.lens;
    if (!target) return;
    if (this.reduced) {
      target.setAlpha(0.75);
      return;
    }
    if (id === 'maintenance-cat')
      this.scene.tweens.add({
        targets: target,
        x: target.x + 7,
        duration: 380,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
      });
    else
      this.scene.tweens.add({
        targets: target,
        scaleY: 0.35,
        duration: 120,
        yoyo: true,
        repeat: 2,
      });
  }
  ride(avatar: Phaser.GameObjects.Sprite, done: () => void) {
    if (this.reduced) {
      done();
      return () => {};
    }
    const x = this.def.id === 'hub' ? 475 : 1090,
      y = this.def.id === 'hub' ? 940 : 890;
    const deck = this.clipped(
      'riding-deck',
      [
        [798, 940],
        [1089, 940],
        [1149, 1107],
        [758, 1107],
      ],
      947,
      1020,
    ).setScale(0.29);
    const carrier = this.scene.add.container(x, y - 23, [deck]).setDepth(2000);
    avatar.setPosition(0, 0);
    carrier.add(avatar);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      done();
    };
    const tween = this.scene.tweens.add({
      targets: carrier,
      x: x + (this.def.id === 'hub' ? 140 : -140),
      y: y - 83,
      alpha: 0.3,
      duration: 1250,
      ease: 'Sine.easeInOut',
      onComplete: finish,
    });
    return () => {
      tween.stop();
      finish();
    };
  }
  setProgress(progress: ExplorationState, animate = true) {
    const changed = !this.progress.bridge && progress.bridge;
    this.progress = { ...progress };
    this.drawGaugeIfPresent();
    this.liftLamp?.setFillStyle(progress.lift ? 0xf1c867 : 0x5c725e);
    for (const v of this.valves) {
      const value =
        v.id === 'sluice-intake' ? progress.intake : progress.outlet;
      this.scene.tweens.add({
        targets: v.rotor,
        angle: value * 120,
        duration: this.reduced || !animate ? 0 : 340,
        ease: 'Sine.easeInOut',
      });
    }
    if (changed && this.bridge) {
      const b = this.def.terrain!.bridges[0];
      this.scene.tweens.add({
        targets: this.bridge,
        y: b.y,
        alpha: 1,
        duration: this.reduced || !animate ? 0 : 1250,
        ease: 'Sine.easeInOut',
      });
      const front = this.bridge.getData('front');
      this.scene.tweens.add({
        targets: front,
        y: b.y + b.height / 2,
        alpha: 1,
        duration: this.reduced || !animate ? 0 : 1250,
        ease: 'Sine.easeInOut',
      });
    }
  }
  private drawGaugeIfPresent() {
    if (this.gauge) this.drawGauge();
  }
  update(time: number, delta: number) {
    if (this.reduced) return;
    for (const r of this.ripple)
      r.sprite
        .setX(r.x + Math.sin(time / 3400 + r.phase) * 9)
        .setAlpha(0.1 + (Math.sin(time / 1700 + r.phase) + 1) * 0.08);
    for (let i = 0; i < this.wind.length; i++)
      this.wind[i].x =
        ((time * 0.009 + i * 670) % (this.def.width + 650)) - 325;
    for (let i = 0; i < this.flowers.length; i++) {
      this.flowers[i].x += Math.sin(time / 2200 + i) * delta * 0.003;
      this.flowers[i].y -= delta * 0.002;
      if (this.flowers[i].y < 400) this.flowers[i].y = 1150;
    }
    if (this.progress.lift && this.wheel) this.wheel.angle += delta * 0.015;
  }
}
