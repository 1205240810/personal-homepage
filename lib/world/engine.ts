import Phaser from 'phaser';
import { SCENES, getScene } from './registry';
import { canWalk, distance } from './geometry';
import type {
  GameHandle,
  InteractionNode,
  Point,
  WorldAction,
  WorldSnapshot,
} from './types';

const SAVE_KEY = 'mecha-archive-world-v1';
export function createWorld(
  parent: HTMLElement,
  callbacks: {
    onAction: (action: WorldAction) => void;
    onScene: (id: string) => void;
    onNear: (node: InteractionNode | null) => void;
    onState: (state: WorldSnapshot) => void;
    onReady: () => void;
    onError: (message: string) => void;
  },
): GameHandle {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state: WorldSnapshot = {
    sceneId: 'hub',
    position: { ...getScene('hub').spawnPoints.default },
    armorOpen: false,
    visited: [],
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
        position:
          saved.position && canWalk(saved.position, definition.walkable)
            ? { ...saved.position }
            : { ...definition.spawnPoints.default },
        armorOpen: saved.armorOpen === true,
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
  function makePlayer(scene: Phaser.Scene) {
    // Original code-native pixel sprite: 4 directions, alternating foot positions.
    for (let d = 0; d < 4; d++)
      for (let f = 0; f < 2; f++) {
        const key = `visitor-${d}-${f}`;
        if (scene.textures.exists(key)) continue;
        const tex = scene.textures.createCanvas(key, 24, 34)!;
        const c = tex.context;
        const rect = (
          x: number,
          y: number,
          w: number,
          h: number,
          color: string,
        ) => {
          c.fillStyle = color;
          c.fillRect(x, y, w, h);
        };
        rect(8, 1, 9, 2, '#1b2730');
        rect(6, 3, 13, 8, '#172029');
        rect(7, 5, 11, 8, '#d9b295');
        rect(6, 2, 13, 5, '#27303a');
        rect(5, 5, 3, 5, '#27303a');
        rect(17, 5, 3, 4, '#27303a');
        if (d === 3) {
          rect(7, 6, 11, 7, '#27303a');
        } else {
          if (d !== 1) rect(15, 8, 2, 2, '#172029');
          if (d !== 2) rect(9, 8, 2, 2, '#172029');
          rect(10, 12, 5, 1, '#b58b76');
        }
        rect(8, 14, 10, 12, '#d6d3c8');
        rect(6, 15, 3, 10, '#bbc3ba');
        rect(17, 15, 3, 10, '#969e96');
        rect(7, 25, 5, 5, '#527a73');
        rect(14, 25, 4, 5, '#3d655f');
        rect(6, 29 + (f ? 1 : 0), 6, 3, '#273a40');
        rect(14, 29 + (f ? 0 : 1), 6, 3, '#273a40');
        rect(9, 24, 8, 2, '#66716e');
        rect(7, 23, 2, 3, '#d9b295');
        rect(18, 23, 2, 3, '#cba78f');
        if (d === 3) {
          rect(8, 15, 10, 10, '#c78f49');
          rect(9, 16, 8, 6, '#edae61');
          rect(9, 23, 8, 2, '#9b6c36');
        } else if (d === 1) {
          rect(16, 16, 4, 9, '#c78f49');
        } else if (d === 2) {
          rect(5, 16, 4, 9, '#c78f49');
        } else {
          rect(15, 15, 2, 8, '#b67f41');
        }
        tex.refresh();
      }
  }
  class ArchiveScene extends Phaser.Scene {
    avatar!: Phaser.GameObjects.Sprite;
    shadow!: Phaser.GameObjects.Ellipse;
    halo!: Phaser.GameObjects.Ellipse;
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    markers: Phaser.GameObjects.Container[] = [];
    panel?: Phaser.GameObjects.Container;
    circuit?: Phaser.GameObjects.Graphics;
    target?: Point;
    nodes: InteractionNode[] = [];
    areas: number[][][] = [];
    facing = 0;
    clock = 0;
    constructor() {
      super('archive');
    }
    preload() {
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
      this.load.tilemapTiledJSON(`map-${def.id}`, `/maps/${def.id}.json`);
      this.load.on('loaderror', () =>
        callbacks.onError('场景资源暂时无法载入，仍可通过目录阅读。'),
      );
    }
    create() {
      active = this;
      this.markers = [];
      this.nodes = [];
      this.areas = [];
      this.panel = undefined;
      this.circuit = undefined;
      near = null;
      this.target = undefined;
      const def = getScene(state.sceneId);
      const image = this.add.image(0, 0, `world:${def.art}`, def.frame);
      image.setOrigin(0).setDisplaySize(1536, 1024).setDepth(0);
      // Load the validated Tiled object layers exported from the scene registry.
      const map = this.make.tilemap({ key: `map-${def.id}` });
      const walkLayer = map.getObjectLayer('walkable');
      this.areas = (walkLayer?.objects ?? []).map((o) =>
        (o.polygon ?? []).map((p) => [(o.x ?? 0) + p.x, (o.y ?? 0) + p.y]),
      );
      if (!this.areas.length) this.areas = def.walkable;
      const objects = map.getObjectLayer('interactions')?.objects ?? [];
      this.nodes = objects
        .map((o) => {
          const n = def.nodes.find((n) => n.id === o.name);
          return n ? { ...n, x: o.x ?? n.x, y: o.y ?? n.y } : null;
        })
        .filter((n): n is InteractionNode => !!n);
      if (!this.nodes.length) this.nodes = def.nodes;
      for (const n of this.nodes) {
        const used = state.visited.includes(n.id);
        const color = used ? 0x7cbaac : 0xedae61;
        const glow = this.add.ellipse(0, 0, 34, 16, color, 0.075);
        const ring = this.add
          .rectangle(0, -3, 9, 9, 0x101923, 0.9)
          .setStrokeStyle(1, color, 0.8)
          .setAngle(45);
        const dot = this.add.rectangle(0, -3, 3, 3, color, 0.8);
        const marker = this.add
          .container(n.x, n.y, [glow, ring, dot])
          .setDepth(11)
          .setSize(46, 46)
          .setInteractive({ useHandCursor: true });
        marker.on('pointerdown', () => {
          if (paused || transitioning) return;
          if (distance(state.position, n) < (n.radius ?? 90)) {
            perform(n);
          } else {
            this.target = { x: n.x, y: n.y };
          }
        });
        this.markers.push(marker);
        if (!reduced)
          this.tweens.add({
            targets: glow,
            alpha: 0.18,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 1800,
            repeat: -1,
            yoyo: true,
            delay: this.markers.length * 170,
          });
      }
      if (def.id === 'hub') this.makeArmor();
      makePlayer(this);
      this.halo = this.add
        .ellipse(state.position.x, state.position.y - 7, 46, 36, 0xedae61, 0.1)
        .setDepth(19);
      this.shadow = this.add
        .ellipse(state.position.x, state.position.y, 28, 10, 0x000000, 0.42)
        .setDepth(20);
      this.avatar = this.add
        .sprite(state.position.x, state.position.y, 'visitor-0-0')
        .setOrigin(0.5, 1)
        .setScale(1.75)
        .setDepth(21);
      this.keys = this.input.keyboard!.addKeys(
        'W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE',
      ) as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.keyboard!.on('keydown-E', () => {
        if (!paused && !transitioning && near) perform(near);
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
            if (canWalk(p, this.areas)) this.target = p;
          }
        },
      );
      this.configureCamera();
      this.scale.on('resize', this.configureCamera, this);
      this.events.once('shutdown', () => {
        this.scale.off('resize', this.configureCamera, this);
        this.input.keyboard?.removeAllListeners();
        this.target = undefined;
        this.cache.tilemap.remove(`map-${def.id}`);
        if (getScene(state.sceneId).art !== def.art)
          this.textures.remove(`world:${def.art}`);
      });
      callbacks.onScene(def.id);
      callbacks.onReady();
      callbacks.onNear(null);
      save();
      if (!reduced) this.cameras.main.fadeIn(550, 7, 19, 25);
    }
    configureCamera() {
      const camera = this.cameras.main;
      const w = this.scale.width,
        h = this.scale.height;
      const zoom =
        w < 700 ? Math.max(w / 1100, h / 1150) : Math.min(w / 1536, h / 1024);
      camera.removeBounds().setZoom(zoom).setRoundPixels(true);
      if (w < 700) camera.setBounds(0, 0, 1536, 1024);
      if (w < 700) camera.centerOn(state.position.x, state.position.y - 140);
      else camera.centerOn(768, 512);
      camera.setBackgroundColor('#07151b');
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
        .container(1105, state.armorOpen ? 386 : 455, [g])
        .setAngle(-68)
        .setScale(0.62)
        .setDepth(8)
        .setAlpha(state.armorOpen ? 0.28 : 0.92);
      if (state.armorOpen) this.drawCircuit(5);
    }
    drawCircuit(v: number) {
      const trace =
        this.circuit ?? (this.circuit = this.add.graphics().setDepth(10));
      const route = [
        { x: 1174, y: 750 },
        { x: 1135, y: 682 },
        { x: 1070, y: 623 },
        { x: 1090, y: 530 },
        { x: 1105, y: 455 },
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
        this.panel?.setY(386).setAlpha(0.28);
        draw(5);
        return;
      }
      transitioning = true;
      const tween = this.tweens.add({
        targets: this.panel,
        y: 386,
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
        this.panel?.setY(386).setAlpha(0.28);
        draw(5);
        transitioning = false;
        transitionFinish = undefined;
      };
    }
    update(_time: number, delta: number) {
      if (!this.avatar) return;
      if (paused || transitioning) {
        this.target = undefined;
        return;
      }
      let dx =
        direction.x +
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      let dy =
        direction.y +
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
        (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
      if (dx || dy) this.target = undefined;
      if (!dx && !dy && this.target) {
        const gap = distance(state.position, this.target);
        if (gap < 5) this.target = undefined;
        else {
          dx = (this.target.x - state.position.x) / gap;
          dy = (this.target.y - state.position.y) / gap;
        }
      }
      const length = Math.hypot(dx, dy);
      const step = (165 * Math.min(delta, 40)) / 1000;
      if (length) {
        dx = (dx / length) * step;
        dy = (dy / length) * step;
        const old = { ...state.position };
        if (
          canWalk({ x: state.position.x + dx, y: state.position.y }, this.areas)
        )
          state.position.x += dx;
        if (
          canWalk({ x: state.position.x, y: state.position.y + dy }, this.areas)
        )
          state.position.y += dy;
        if (distance(old, state.position) < 0.1) this.target = undefined;
        this.facing =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 1) : dy > 0 ? 0 : 3;
        this.clock += delta;
      } else this.clock = 0;
      this.avatar
        .setPosition(state.position.x, state.position.y)
        .setTexture(
          `visitor-${this.facing}-${Math.floor(this.clock / 160) % 2}`,
        );
      this.shadow.setPosition(state.position.x, state.position.y);
      this.halo.setPosition(state.position.x, state.position.y - 15);
      if (this.scale.width < 700)
        this.cameras.main.centerOn(state.position.x, state.position.y - 100);
      let candidate: InteractionNode | null = null,
        min = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i],
          gap = distance(state.position, n);
        if (gap < (n.radius ?? 90) && gap < min) {
          candidate = n;
          min = gap;
        }
        this.markers[i].setAlpha(gap < 90 ? 1 : 0.55);
      }
      if (candidate?.id !== near?.id) {
        near = candidate;
        callbacks.onNear(near);
      }
      if (length && _time - lastPersist > 1000) {
        lastPersist = _time;
        save();
      }
    }
  }
  function perform(node: InteractionNode) {
    if (paused || transitioning) return;
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
    if (node.action.type === 'activate-armor') {
      active?.openArmor();
      callbacks.onState({ ...state });
      return;
    }
    if (node.action.type === 'enter-scene') {
      enter(node.action.sceneId, node.action.spawnId);
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
    const finish = () => {
      if (!transitioning) return;
      transitioning = false;
      transitionFinish = undefined;
      state.sceneId = id;
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
      camera.fadeOut(450, 7, 19, 25);
      active.time.delayedCall(470, finish);
    } else finish();
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#07151b',
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
    direction = { x: 0, y: 0 };
    if (active) {
      active.target = undefined;
      active.input.keyboard?.resetKeys();
    }
    save();
  };
  window.addEventListener('blur', blur);
  return {
    destroy() {
      destroyed = true;
      save();
      window.removeEventListener('blur', blur);
      game.destroy(true);
    },
    pause(value) {
      paused = value;
      save();
      direction = { x: 0, y: 0 };
      if (active) {
        active.target = undefined;
        active.input.keyboard?.resetKeys();
        if (active.input.keyboard) {
          active.input.keyboard.enabled = !value;
          if (value) active.input.keyboard.clearCaptures();
          else active.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
        }
      }
    },
    enter,
    interact() {
      if (near) perform(near);
    },
    setDirection(value) {
      direction = value;
    },
    snapshot() {
      return {
        ...state,
        position: { ...state.position },
        visited: [...state.visited],
      };
    },
    skip() {
      transitionFinish?.();
    },
  };
}
