import Phaser from 'phaser';
import { CourtyardScenery } from './scenery';
import { makePlayerTextures } from './player';
import { SCENES, getScene } from './registry';
import { distance } from './geometry';
import { traversable, clearSegment, findRoute } from './navigation';
import type {
  GameHandle,
  InteractionNode,
  Point,
  WorldAction,
  WorldSnapshot,
  MiniGameId,
  DiscoveryId,
} from './types';

const SAVE_KEY = 'forest-courtyard-example-world-v1';
export function createWorld(
  parent: HTMLElement,
  callbacks: {
    onAction: (action: WorldAction) => void;
    onScene: (id: string) => void;
    onNear: (node: InteractionNode | null) => void;
    onState: (state: WorldSnapshot) => void;
    onReady: () => void;
    onError: (message: string) => void;
    onNotice: (message: string) => void;
  },
): GameHandle {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state: WorldSnapshot = {
    sceneId: 'hub',
    layoutVersion: getScene('hub').layoutVersion,
    position: { ...getScene('hub').spawnPoints.default },
    armorOpen: false,
    visited: [],
    discoveries: [],
    games: {},
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && SCENES.some((s) => s.id === saved.sceneId)) {
      const definition = getScene(saved.sceneId);
      const validNodes = new Set(
        SCENES.flatMap((scene) => scene.nodes.map((n) => n.id)),
      );
      state = {
        sceneId: saved.sceneId,
        layoutVersion: definition.layoutVersion,
        position:
          saved.layoutVersion === definition.layoutVersion &&
          saved.position &&
          traversable(saved.position, definition.walkable, definition.obstacles)
            ? { ...saved.position }
            : { ...definition.spawnPoints.default },
        armorOpen: saved.armorOpen === true,
        discoveries: Array.isArray(saved.discoveries)
          ? saved.discoveries.filter((v: string) =>
              ['sleepy-eye', 'maintenance-cat'].includes(v),
            )
          : [],
        games: Object.fromEntries(
          Object.entries(saved.games ?? {}).filter(
            ([id, moves]) =>
              ['circuit', 'memory'].includes(id) &&
              typeof moves === 'number' &&
              moves > 0,
          ),
        ),
        visited: Array.isArray(saved.visited)
          ? saved.visited.filter(
              (id: unknown) => typeof id === 'string' && validNodes.has(id),
            )
          : [],
      };
    }
  } catch {}
  let paused = false,
    direction: Point = { x: 0, y: 0 },
    active: ArchiveScene | undefined,
    near: InteractionNode | null = null,
    transitioning = false,
    destroyed = false,
    transitionFinish: (() => void) | undefined;
  const save = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {}
    callbacks.onState({ ...state, position: { ...state.position } });
  };
  let lastPersist = 0;
  let pendingWalk: string | undefined;
  class ArchiveScene extends Phaser.Scene {
    avatar!: Phaser.GameObjects.Sprite;
    scenery?: CourtyardScenery;
    routeLine?: Phaser.GameObjects.Graphics;
    shadow!: Phaser.GameObjects.Ellipse;
    halo!: Phaser.GameObjects.Ellipse;
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    markers: Phaser.GameObjects.Container[] = [];
    panel?: Phaser.GameObjects.Container;
    circuit?: Phaser.GameObjects.Graphics;
    target?: Point;
    waypoints: Point[] = [];
    obstacles: number[][][] = [];
    failed = false;
    targetNode?: InteractionNode;
    velocity: Point = { x: 0, y: 0 };
    travel = 0;
    sinceFootstep = 0;
    destination?: Phaser.GameObjects.Ellipse;
    fireflies: Phaser.GameObjects.Arc[] = [];
    nodes: InteractionNode[] = [];
    areas: number[][][] = [];
    facing = 0;
    clock = 0;
    constructor() {
      super('archive');
    }
    preload() {
      this.failed = false;
      const def = getScene(state.sceneId);
      const key = `world:${def.art}`;
      if (!this.textures.exists(key)) {
        if (def.frame === undefined) this.load.image(key, def.art);
        else
          this.load.spritesheet(key, def.art, {
            frameWidth: 887,
            frameHeight: 591,
          });
      }
      for (const art of new Set((def.layers ?? []).map((layer) => layer.art)))
        if (!this.textures.exists(`layer:${art}`))
          this.load.image(`layer:${art}`, art);
      this.load.tilemapTiledJSON(`map-${def.id}`, `/maps/${def.id}.json`);
      const failure = () => {
        this.failed = true;
        callbacks.onError('场景暂时无法载入，仍可通过目录阅读。');
      };
      this.load.on('loaderror', failure);
      this.load.once('complete', () => this.load.off('loaderror', failure));
    }

    create() {
      active = this;
      if (this.failed) {
        pendingWalk = undefined;
        active = undefined;
        return;
      }
      this.markers = [];
      this.nodes = [];
      this.areas = [];
      this.panel = undefined;
      this.circuit = undefined;
      near = null;
      this.target = undefined;
      this.targetNode = undefined;
      this.velocity = { x: 0, y: 0 };
      this.travel = 0;
      this.sinceFootstep = 0;
      this.fireflies = [];
      const def = getScene(state.sceneId);
      const image = this.add.image(0, 0, `world:${def.art}`, def.frame);
      image.setOrigin(0).setDisplaySize(1536, 1024).setDepth(0);
      // The registry is the canonical collision model; its Tiled export is validated at build time.
      this.areas = def.walkable;
      this.obstacles = def.obstacles ?? [];
      this.nodes = def.nodes.map((n) => ({ ...n }));
      this.waypoints = [];
      this.scenery = def.layers
        ? new CourtyardScenery(
            this,
            def,
            reduced,
            (id) => {
              if (paused || transitioning) return;
              const n = this.nodes.find((node) => node.id === id);
              if (!n) return;
              if (this.canInteract(n)) perform(n);
              else this.moveTo(n, n);
            },
            callbacks.onNotice,
          )
        : undefined;
      this.routeLine = this.add.graphics().setDepth(3);
      for (const n of this.nodes) {
        const glint = this.add.ellipse(0, 0, 16, 7, 0xe9d9a6, 0.15);
        const ring = this.add
          .rectangle(0, -2, 5, 5, 0xe4d3a1, 0.35)
          .setAngle(45);
        const dot = this.add.rectangle(0, -2, 2, 2, 0xfff5ce, 0.5);
        if (def.layers || n.hidden) {
          glint.setVisible(false);
          ring.setVisible(false);
          dot.setVisible(false);
        }
        const marker = this.add
          .container(n.x, n.y, [glint, ring, dot])
          .setDepth(8)
          .setSize(52, 56)
          .setInteractive({ useHandCursor: true });
        marker.on('pointerup', () => {
          if (paused || transitioning) return;
          if (this.canInteract(n)) perform(n);
          else this.moveTo(n, n);
        });
        this.markers.push(marker);
      }
      if (def.id === 'graduate') this.makeArmor();
      makePlayerTextures(this);
      this.halo = this.add
        .ellipse(state.position.x, state.position.y - 7, 46, 36, 0x8c9c66, 0.08)
        .setDepth(4);
      this.shadow = this.add
        .ellipse(state.position.x, state.position.y, 28, 10, 0x42543d, 0.24)
        .setDepth(5);
      this.avatar = this.add
        .sprite(state.position.x, state.position.y, 'walker-0-0')
        .setOrigin(0.5, 1)
        .setAlpha(1)
        .setScale(2)
        .setDepth(state.position.y);
      this.keys = this.input.keyboard!.addKeys(
        'W,A,S,D,UP,DOWN,LEFT,RIGHT,E,F,SPACE,SHIFT',
      ) as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.keyboard!.on('keydown-E', (event: KeyboardEvent) => {
        if (event.repeat) return;
        if (!paused && !transitioning && near) perform(near);
      });
      this.input.keyboard!.on('keydown-F', (event: KeyboardEvent) => {
        if (event.repeat || paused || transitioning) return;
        this.scenery?.kick(state.position, this.facingVector());
      });
      this.input.keyboard!.on('keydown-SPACE', () => {
        if (transitioning) transitionFinish?.();
      });
      this.input.on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          objects: Phaser.GameObjects.GameObject[],
        ) => {
          if (!paused && !transitioning && objects.length === 0) {
            const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            if (traversable(p, this.areas, this.obstacles)) this.moveTo(p);
          }
        },
      );
      this.destination = this.add
        .ellipse(0, 0, 22, 12)
        .setStrokeStyle(1, 0x4a6743, 0.8)
        .setDepth(12)
        .setVisible(false);
      this.configureCamera();
      this.applyPause();
      this.scale.on('resize', this.configureCamera, this);
      this.events.once('shutdown', () => {
        this.scale.off('resize', this.configureCamera, this);
        this.input.keyboard?.removeAllListeners();
        this.target = undefined;
        this.cache.tilemap.remove(`map-${def.id}`);
        if (getScene(state.sceneId).art !== def.art) {
          this.textures.remove(`world:${def.art}`);
          for (const art of new Set(
            (def.layers ?? []).map((layer) => layer.art),
          ))
            this.textures.remove(`layer:${art}`);
        }
      });
      callbacks.onScene(def.id);
      callbacks.onReady();
      if (pendingWalk && state.sceneId === 'hub') {
        const n = this.nodes.find((n) => n.id === pendingWalk);
        pendingWalk = undefined;
        if (n) this.moveTo(n, n);
      }
      callbacks.onNear(null);
      save();
      if (paused) this.scene.pause();
      if (!reduced) this.cameras.main.fadeIn(320, 242, 245, 230);
      if (def.id === 'hub' && !reduced) {
        for (let i = 0; i < 12; i++) {
          const mote = this.add
            .circle(
              90 + ((i * 137) % 1400),
              130 + ((i * 179) % 800),
              1.3,
              0xc2c38b,
              0.2,
            )
            .setDepth(16);
          this.fireflies.push(mote);
          this.tweens.add({
            targets: mote,
            y: mote.y - 24,
            alpha: 0.65,
            duration: 2300 + i * 170,
            yoyo: true,
            repeat: -1,
            delay: i * 160,
          });
        }
      }
    }
    applyPause() {
      this.target = undefined;
      this.targetNode = undefined;
      this.waypoints = [];
      this.routeLine?.clear();
      this.velocity = { x: 0, y: 0 };
      direction = { x: 0, y: 0 };
      this.destination?.setVisible(false);
      if (this.input.keyboard) {
        this.input.keyboard.resetKeys();
        this.input.keyboard.enabled = !paused;
        this.input.keyboard.clearCaptures();
        if (!paused) this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
      }
    }
    facingVector() {
      return this.facing === 1
        ? { x: -1, y: 0 }
        : this.facing === 2
          ? { x: 1, y: 0 }
          : this.facing === 3
            ? { x: 0, y: -1 }
            : { x: 0, y: 1 };
    }
    canInteract(node: InteractionNode) {
      return (
        distance(state.position, node) < (node.radius ?? 65) &&
        clearSegment(state.position, node, this.areas, this.obstacles)
      );
    }
    moveTo(point: Point, node?: InteractionNode) {
      this.applyPause();
      if (paused || transitioning) return;
      const route = findRoute(
        state.position,
        point,
        this.areas,
        this.obstacles,
      );
      if (!route) {
        callbacks.onNotice('这里没有连通的小路，试试门前的落脚点。');
        return;
      }
      this.waypoints = route;
      this.target = this.waypoints.shift();
      this.targetNode = node;
      this.showDestination(point);
      this.routeLine?.clear().lineStyle(1.5, 0xfff8db, 0.6);
      let prev = state.position;
      for (const p of [this.target, ...this.waypoints])
        if (p) {
          this.routeLine?.lineBetween(prev.x, prev.y, p.x, p.y);
          prev = p;
        }
    }
    showDestination(p: Point) {
      this.destination?.setPosition(p.x, p.y).setVisible(true);
    }
    footstep() {
      if (reduced) return;
      const dust = this.add
        .ellipse(
          state.position.x +
            (this.facing === 1 ? 9 : this.facing === 2 ? -9 : 0),
          state.position.y,
          8,
          3,
          0xb9bf99,
          0.22,
        )
        .setDepth(18);
      this.tweens.add({
        targets: dust,
        alpha: 0,
        scale: 2,
        duration: 420,
        onComplete: () => dust.destroy(),
      });
    }
    configureCamera() {
      const camera = this.cameras.main;
      const w = this.scale.width,
        h = this.scale.height;
      const zoom = Math.max(w / 1536, h / 1024);
      camera.removeBounds().setZoom(zoom).setRoundPixels(true);
      camera.setBounds(0, 0, 1536, 1024);
      if (w < 700 || w / h > 2.05)
        camera.centerOn(state.position.x, state.position.y - 140);
      else camera.centerOn(768, 515);
      camera.setBackgroundColor('#e3ead6');
    }
    makeArmor() {
      const g = this.add.graphics();
      g.fillStyle(0x566458, 1);
      g.fillRoundedRect(-95, -40, 190, 80, 5);
      g.lineStyle(2, 0xa3aa8d, 0.65);
      g.strokeRoundedRect(-95, -40, 190, 80, 5);
      g.lineStyle(6, 0x25333b);
      g.lineBetween(-78, -24, 78, -24);
      g.lineBetween(-78, 23, 78, 23);
      g.lineStyle(1, 0x4f625e, 0.75);
      for (let x = -70; x < 80; x += 28) g.lineBetween(x, -35, x, 35);
      g.fillStyle(0x273942);
      for (const x of [-84, 84])
        for (const y of [-28, 28]) g.fillCircle(x, y, 3);
      g.fillStyle(0xedae61, 0.8);
      g.fillRect(-27, -2, 54, 3);
      this.panel = this.add
        .container(217, state.armorOpen ? 421 : 444, [g])
        .setAngle(0)
        .setScale(0.14)
        .setDepth(8)
        .setAlpha(state.armorOpen ? 0.28 : 0.92);
      if (state.armorOpen) this.drawCircuit(5);
    }
    drawCircuit(v: number) {
      const trace =
        this.circuit ?? (this.circuit = this.add.graphics().setDepth(10));
      const route = [
        { x: 291, y: 468 },
        { x: 283, y: 488 },
        { x: 247, y: 487 },
        { x: 224, y: 460 },
        { x: 217, y: 444 },
      ];

      trace.clear();
      trace.lineStyle(3, 0xedae61, 0.85);
      trace.beginPath();
      trace.moveTo(route[0].x, route[0].y);
      for (let i = 1; i < Math.min(route.length, Math.floor(v) + 1); i++)
        trace.lineTo(route[i].x, route[i].y);
      trace.strokePath();
    }
    openArmor() {
      if (state.armorOpen) return;
      state.armorOpen = true;
      save();
      const draw = (value: number) => this.drawCircuit(value);
      if (reduced) {
        this.panel?.setY(421).setAlpha(0.28);
        draw(5);
        return;
      }
      transitioning = true;
      const tween = this.tweens.add({
        targets: this.panel,
        y: 421,
        alpha: 0.28,
        duration: 1600,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          transitioning = false;
          transitionFinish = undefined;
        },
      });
      this.tweens.addCounter({
        from: 0,
        to: 5,
        duration: 1500,
        onUpdate: (t) => draw(t.getValue() ?? 0),
      });
      transitionFinish = () => {
        tween.complete();
        this.panel?.setY(421).setAlpha(0.28);
        draw(5);
        transitioning = false;
        transitionFinish = undefined;
      };
    }
    update(_time: number, delta: number) {
      if (this.failed || !this.avatar?.active) return;
      if (paused || transitioning) {
        this.target = undefined;
        this.targetNode = undefined;
        this.waypoints = [];
        this.velocity = { x: 0, y: 0 };
        this.destination?.setVisible(false);
        return;
      }
      const dt = Math.min(delta, 40) / 1000;
      let dx =
        direction.x +
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      let dy =
        direction.y +
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
        (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
      if (dx || dy) {
        pendingWalk = undefined;
        this.waypoints = [];
        this.routeLine?.clear();
        this.target = undefined;
        this.targetNode = undefined;
        this.destination?.setVisible(false);
      }
      if (!dx && !dy && this.target) {
        let gap = distance(state.position, this.target);
        if (gap < 5) {
          state.position = { x: this.target.x, y: this.target.y };
          this.velocity = { x: 0, y: 0 };
          this.target = this.waypoints.shift();
          if (!this.target) {
            this.routeLine?.clear();
            this.destination?.setVisible(false);
            const node = this.targetNode;
            this.targetNode = undefined;
            if (node && this.canInteract(node)) {
              perform(node);
              return;
            }
          }
          gap = this.target ? distance(state.position, this.target) : 0;
        }
        if (this.target && gap) {
          dx = (this.target.x - state.position.x) / gap;
          dy = (this.target.y - state.position.y) / gap;
        }
      }
      const length = Math.hypot(dx, dy),
        speed = this.keys.SHIFT.isDown ? 325 : 220;
      const easing = 1 - Math.exp(-(length ? 22 : 42) * dt);
      this.velocity.x +=
        ((length ? (dx / length) * speed : 0) - this.velocity.x) * easing;
      this.velocity.y +=
        ((length ? (dy / length) * speed : 0) - this.velocity.y) * easing;
      if (!length && Math.hypot(this.velocity.x, this.velocity.y) < 3)
        this.velocity = { x: 0, y: 0 };
      const old = { ...state.position };
      if (this.target) {
        // Follow the verified segment itself. Axis sliding can leave a narrow planned turn.
        const gap = distance(old, this.target);
        const step = Math.min(
          gap,
          Math.hypot(this.velocity.x, this.velocity.y) * dt,
        );
        const next = gap
          ? {
              x: old.x + ((this.target.x - old.x) / gap) * step,
              y: old.y + ((this.target.y - old.y) / gap) * step,
            }
          : old;
        if (clearSegment(old, next, this.areas, this.obstacles))
          state.position = next;
        else {
          this.applyPause();
          callbacks.onNotice('前方暂时走不通，换一处落脚点试试。');
        }
      } else {
        const xStep = this.velocity.x * dt,
          yStep = this.velocity.y * dt;
        if (
          clearSegment(
            old,
            { x: old.x + xStep, y: old.y },
            this.areas,
            this.obstacles,
          )
        )
          state.position.x += xStep;
        else this.velocity.x = 0;
        if (
          clearSegment(
            state.position,
            { x: state.position.x, y: old.y + yStep },
            this.areas,
            this.obstacles,
          )
        )
          state.position.y += yStep;
        else this.velocity.y = 0;
      }
      const moved = distance(old, state.position);
      if (moved > 0.05) {
        this.travel += moved;
        this.sinceFootstep += moved;
        if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y) * 1.15)
          this.facing = this.velocity.x > 0 ? 2 : 1;
        else if (Math.abs(this.velocity.y) > Math.abs(this.velocity.x) * 1.15)
          this.facing = this.velocity.y > 0 ? 0 : 3;
        if (this.sinceFootstep > 48) {
          this.sinceFootstep = 0;
          this.footstep();
        }
      }
      const frame = moved > 0.05 ? Math.floor(this.travel / 12) % 8 : 0;
      const breath =
        !reduced && moved < 0.05 ? Math.sin(_time / 850) * 0.55 : 0;
      const inShade = this.scenery?.update(state.position, delta, _time);
      const ball = this.nodes.find((n) => n.id === 'courtyard-ball');
      if (ball && this.scenery) {
        ball.x = this.scenery.ballPosition.x;
        ball.y = this.scenery.ballPosition.y;
        this.markers[this.nodes.indexOf(ball)]?.setPosition(ball.x, ball.y);
      }
      this.avatar
        .setDepth(state.position.y)
        .setTint(inShade ? 0xd5dfd0 : 0xffffff);
      this.avatar
        .setPosition(state.position.x, state.position.y - breath)
        .setTexture(`walker-${this.facing}-${frame}`);
      this.shadow
        .setPosition(state.position.x, state.position.y)
        .setScale(1, 1 - (frame % 4 === 2 ? 0.1 : 0));
      this.halo.setPosition(state.position.x, state.position.y - 16);
      if (
        this.scale.width < 700 ||
        this.scale.width / this.scale.height > 2.05
      ) {
        const camera = this.cameras.main;
        const nextX = state.position.x,
          nextY = state.position.y - 100;
        const lerp = reduced ? 1 : 1 - Math.exp(-dt * 12);
        camera.centerOn(
          camera.midPoint.x + (nextX - camera.midPoint.x) * lerp,
          camera.midPoint.y + (nextY - camera.midPoint.y) * lerp,
        );
      }
      let candidate: InteractionNode | null = null,
        min = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i],
          gap = distance(state.position, n),
          radius = n.radius ?? 80;
        if (gap < radius && gap < min && this.canInteract(n)) {
          candidate = n;
          min = gap;
        }
        this.markers[i].setAlpha(
          n.hidden
            ? gap < radius
              ? 1
              : state.visited.includes(n.id)
                ? 0.5
                : 0.18
            : gap < radius
              ? 1
              : 0.82,
        );
      }
      if (candidate?.id !== near?.id) {
        near = candidate;
        callbacks.onNear(near);
      }
      if (moved && _time - lastPersist > 500) {
        lastPersist = _time;
        save();
      }
    }
    discover(id: DiscoveryId) {
      if (id === 'sleepy-eye') {
        const eyes = this.add
          .container(0, 0, [
            this.add.ellipse(212, 414, 4, 2, 0xedbd72, 0.95),
            this.add.ellipse(220, 414, 4, 2, 0xedbd72, 0.95),
          ])
          .setDepth(15);
        if (!reduced)
          this.tweens.add({
            targets: eyes,
            alpha: 0.15,
            duration: 450,
            yoyo: true,
            repeat: 3,
            onComplete: () => eyes.destroy(),
          });
        else this.time.delayedCall(1400, () => eyes.destroy());
      } else {
        const cat = this.add.graphics().setDepth(22);
        cat.fillStyle(0x9cafae);
        cat.fillRect(-9, -13, 18, 10);
        cat.fillRect(7, -18, 9, 10);
        cat.fillRect(7, -22, 3, 5);
        cat.fillRect(13, -22, 3, 5);
        cat.fillRect(-10, -4, 4, 6);
        cat.fillRect(3, -4, 4, 6);
        cat.lineStyle(3, 0x9cafae);
        cat.lineBetween(-8, -10, -17, -16);
        cat.fillStyle(0xeec575);
        cat.fillRect(13, -15, 2, 2);
        cat.setPosition(375, 755).setScale(1.7);
        this.tweens.add({
          targets: cat,
          x: reduced ? 375 : 500,
          y: reduced ? 755 : 816,
          alpha: 0,
          duration: reduced ? 1800 : 2400,
          ease: 'Sine.easeIn',
          onComplete: () => cat.destroy(),
        });
      }
    }
  }

  function perform(node: InteractionNode) {
    if (paused || transitioning || !active?.canInteract(node)) return;
    active.applyPause();
    if (!state.visited.includes(node.id)) {
      state.visited.push(node.id);
      save();
      const marker =
        active?.markers[active.nodes.findIndex((n) => n.id === node.id)];
      if (marker) {
        (marker.getAt(1) as Phaser.GameObjects.Rectangle).setStrokeStyle(
          1,
          0x7cbaac,
          0.9,
        );
        (marker.getAt(2) as Phaser.GameObjects.Rectangle).setFillStyle(
          0x7cbaac,
        );
      }
    }
    if (node.action.type === 'kick-ball') {
      active.scenery?.kick(state.position, active.facingVector());
      return;
    }
    if (node.action.type === 'discover') {
      const id = node.action.discovery;
      if (!state.discoveries.includes(id)) state.discoveries.push(id);
      active?.discover(id);
      save();
      callbacks.onAction(node.action);
      return;
    }
    if (node.action.type === 'activate-armor') {
      active?.openArmor();
      callbacks.onAction(node.action);
      callbacks.onState({ ...state });
      return;
    }
    if (node.action.type === 'enter-scene') {
      const action = node.action;
      if (active.scenery?.hasDoor(node.id)) {
        transitioning = true;
        transitionFinish = active.scenery.openDoor(node.id, () => {
          const scene = active!;
          scene.tweens.add({
            targets: scene.avatar,
            y: scene.avatar.y - 40,
            alpha: 0,
            duration: reduced ? 0 : 420,
            ease: 'Sine.easeIn',
            onUpdate: () => scene.avatar.setDepth(scene.avatar.y),
            onComplete: () => {
              transitioning = false;
              enter(action.sceneId, action.spawnId);
            },
          });
        });
      } else enter(action.sceneId, action.spawnId);
      return;
    }
    if (active.scenery?.hasDoor(node.id)) {
      transitioning = true;
      transitionFinish = active.scenery.openDoor(node.id, () => {
        transitioning = false;
        transitionFinish = undefined;
        callbacks.onAction(node.action);
      });
      return;
    }
    active!.target = undefined;
    callbacks.onAction(node.action);
  }
  function enter(id: string, spawnId = 'default') {
    if (destroyed || transitioning || !SCENES.some((s) => s.id === id)) return;
    const next = getScene(id);
    if (!next.spawnPoints[spawnId]) return;
    transitioning = true;
    direction = { x: 0, y: 0 };
    active?.applyPause();
    const finish = () => {
      if (!transitioning) return;
      transitioning = false;
      transitionFinish = undefined;
      state.sceneId = id;
      state.layoutVersion = next.layoutVersion;
      state.position = { ...next.spawnPoints[spawnId] };
      save();
      game.scene.start('archive');
    };
    transitionFinish = finish;
    if (active && !reduced) {
      const camera = active.cameras.main;
      camera.pan(
        state.position.x,
        state.position.y - 100,
        450,
        'Sine.easeInOut',
      );
      camera.zoomTo(camera.zoom * 1.1, 450);
      camera.fadeOut(450, 242, 245, 230);
      active.time.delayedCall(470, finish);
    } else finish();
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#e3ead6',
    width: parent.clientWidth,
    height: parent.clientHeight,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArchiveScene],
    input: { keyboard: true, touch: true },
    audio: { noAudio: true },
    fps: { target: 60, forceSetTimeOut: false },
    banner: false,
  });
  const blur = () => {
    pendingWalk = undefined;
    direction = { x: 0, y: 0 };
    if (active) {
      active.applyPause();
    }
    save();
  };
  const visibility = () => {
    if (document.hidden) blur();
  };
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  return {
    destroy() {
      destroyed = true;
      save();
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      game.destroy(true);
    },
    pause(value) {
      if (value) pendingWalk = undefined;
      if (paused === value) return;
      paused = value;
      direction = { x: 0, y: 0 };
      active?.applyPause();
      if (active) {
        if (value) {
          if (!transitioning) active.cameras.main.fadeEffect.reset();
          active.scene.pause();
        } else active.scene.resume();
      }
      save();
    },
    completeGame(id: MiniGameId, moves: number) {
      const best = state.games[id];
      state.games[id] = best ? Math.min(best, moves) : moves;
      if (id === 'circuit' && !state.armorOpen) {
        state.armorOpen = true;
        if (state.sceneId === 'graduate') {
          active?.panel?.setY(421).setAlpha(0.28);
          active?.drawCircuit(5);
        }
      }
      save();
    },
    walkTo(nodeId: string) {
      if (paused || transitioning) return;
      if (state.sceneId !== 'hub') {
        pendingWalk = nodeId;
        enter('hub');
        return;
      }
      const n = active?.nodes.find((n) => n.id === nodeId);
      if (n) active?.moveTo(n, n);
    },
    enter,
    interact() {
      if (near) perform(near);
    },
    setDirection(value) {
      if (!paused && !transitioning) direction = value;
    },
    snapshot() {
      return {
        ...state,
        position: { ...state.position },
        visited: [...state.visited],
      };
    },
    skip() {
      if (!paused) transitionFinish?.();
    },
  };
}
