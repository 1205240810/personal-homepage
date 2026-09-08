import Phaser from 'phaser';
import { makePlayerTextures, posePlayer } from './player';
import { SCENES, getScene } from './registry';
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
    onAction(action: WorldAction): void;
    onScene(id: string): void;
    onNear(node: InteractionNode | null): void;
    onState(state: WorldSnapshot): void;
    onReady(): void;
    onError(message: string): void;
    onNotice(message: string): void;
  },
): GameHandle {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches,
    paused = false,
    destroyed = false,
    transitioning = false;
  let inputX = 0,
    active: ArchiveScene | undefined,
    near: InteractionNode | null = null;
  let transitionTimer: ReturnType<typeof setTimeout> | undefined,
    finishTransition: (() => void) | undefined;
  // The legacy exploration field is retained only for old save compatibility. It never gates content or travel.
  let state: WorldSnapshot = {
    exploration: { intake: 0, outlet: 0, bridge: false, lift: false },
    sceneId: 'hub',
    layoutVersion: 20,
    position: { ...getScene('hub').spawnPoints.default },
    armorOpen: false,
    visited: [],
    discoveries: [],
    games: {},
  };
  try {
    const old = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (old && SCENES.some((s) => s.id === old.sceneId)) {
      const def = getScene(old.sceneId),
        nodes = new Set(SCENES.flatMap((s) => s.nodes.map((n) => n.id)));
      state = {
        ...state,
        sceneId: def.id,
        layoutVersion: def.layoutVersion,
        position:
          old.layoutVersion === def.layoutVersion &&
          Number.isFinite(old.position?.x) &&
          old.position.x >= 55 &&
          old.position.x <= def.width - 55
            ? { x: old.position.x, y: def.groundY! }
            : { ...def.spawnPoints.default },
        visited: Array.isArray(old.visited)
          ? old.visited.filter((id: string) => nodes.has(id))
          : [],
        discoveries: Array.isArray(old.discoveries)
          ? old.discoveries.filter((id: string) =>
              ['sleepy-eye', 'maintenance-cat'].includes(id),
            )
          : [],
        games: Object.fromEntries(
          Object.entries(old.games ?? {}).filter(
            ([id, v]) =>
              ['circuit', 'memory'].includes(id) &&
              typeof v === 'number' &&
              v > 0,
          ),
        ),
        armorOpen: old.armorOpen === true,
      };
    }
  } catch {}
  const snapshot = () => ({
    ...state,
    position: { ...state.position },
    visited: [...state.visited],
    games: { ...state.games },
  });
  const save = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {}
    callbacks.onState(snapshot());
  };
  class ArchiveScene extends Phaser.Scene {
    avatar!: Phaser.GameObjects.Sprite;
    shadow!: Phaser.GameObjects.Ellipse;
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    lamps: Phaser.GameObjects.Rectangle[] = [];
    target?: number;
    targetNode?: InteractionNode;
    velocity = 0;
    travelled = 0;
    facing = 2;
    lastSave = 0;
    wasMoving = false;
    failed = false;
    constructor() {
      super('archive');
    }
    preload() {
      this.failed = false;
      if (!this.textures.exists('explorer'))
        this.load.image('explorer', '/art/explorer-walk.png');
      const def = getScene(state.sceneId),
        key = `world:${def.art}`;
      if (!this.textures.exists(key)) this.load.image(key, def.art);
      this.load.tilemapTiledJSON(`map-${def.id}`, `/maps/${def.id}.json`);
      const failure = () => {
        this.failed = true;
        callbacks.onError('机甲画面暂时无法载入，你仍可打开文章和作品。');
      };
      this.load.on('loaderror', failure);
      this.load.once('complete', () => this.load.off('loaderror', failure));
    }
    create() {
      if (this.failed) {
        active = undefined;
        return;
      }
      active = this;
      const def = getScene(state.sceneId),
        key = `world:${def.art}`;
      this.target = undefined;
      this.targetNode = undefined;
      this.velocity = 0;
      this.travelled = 0;
      this.wasMoving = false;
      this.lamps = [];
      const texture = this.textures.get(key),
        source = texture.getSourceImage();
      if (def.frame !== undefined && !texture.has(`cabin-${def.frame}`)) {
        const rowHeight = Math.floor(source.height / 3);
        texture.add(
          `cabin-${def.frame}`,
          0,
          0,
          def.frame * rowHeight,
          source.width,
          rowHeight,
        );
      }
      this.add
        .image(
          0,
          0,
          key,
          def.frame === undefined ? undefined : `cabin-${def.frame}`,
        )
        .setOrigin(0)
        .setDisplaySize(def.width, def.height);
      makePlayerTextures(this);
      this.shadow = this.add
        .ellipse(state.position.x, state.position.y + 1, 34, 9, 0x111d25, 0.4)
        .setDepth(5);
      this.avatar = this.add
        .sprite(state.position.x, state.position.y, 'explorer', 'walk-2-0')
        .setOrigin(0.5, 1)
        .setScale(def.playerScale ?? 0.48)
        .setDepth(10);
      posePlayer(this.avatar, 2, 0);
      def.nodes.forEach((n) => {
        const lamp = this.add
          .rectangle(
            n.x,
            n.y - 4,
            18,
            3,
            state.visited.includes(n.id) ? 0x8acbc1 : 0xf2bb79,
            n.hidden ? 0.2 : 0.72,
          )
          .setDepth(6);
        this.lamps.push(lamp);
        const hotspot = this.add
          .zone(n.x, n.y - 55, n.hidden ? 60 : 100, 120)
          .setInteractive({ useHandCursor: true });
        hotspot.on('pointerup', () => {
          if (!paused && !transitioning) {
            if (this.canInteract(n)) perform(n);
            else this.walk(n.x, n);
          }
        });
        hotspot.on('pointerover', () => lamp.setAlpha(1));
        hotspot.on('pointerout', () => lamp.setAlpha(n.hidden ? 0.2 : 0.72));
      });
      this.keys = this.input.keyboard!.addKeys(
        'A,D,LEFT,RIGHT,E,SPACE,SHIFT',
      ) as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.keyboard!.on('keydown-E', (e: KeyboardEvent) => {
        if (!e.repeat && near) perform(near);
      });
      this.input.keyboard!.on('keydown-SPACE', () => {
        if (transitioning) finishTransition?.();
      });
      this.input.on(
        'pointerdown',
        (p: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
          if (paused || transitioning || objects.length) return;
          const point = this.cameras.main.getWorldPoint(p.x, p.y);
          // A click chooses a position along the actual service deck, never through the hull.
          if (point.y > def.groundY! - 145 && point.y < def.groundY! + 90)
            this.walk(point.x);
        },
      );
      this.configureCamera();
      this.resetInput();
      this.scale.on('resize', this.configureCamera, this);
      this.events.once('shutdown', () => {
        this.scale.off('resize', this.configureCamera, this);
        this.input.keyboard?.removeAllListeners();
        this.cache.tilemap.remove(`map-${def.id}`);
        if (getScene(state.sceneId).art !== def.art) this.textures.remove(key);
        active = undefined;
      });
      callbacks.onScene(def.id);
      callbacks.onNear(null);
      near = null;
      callbacks.onError('');
      callbacks.onReady();
      save();
      if (!reduced) this.cameras.main.fadeIn(420, 20, 27, 32);
      if (paused) this.scene.pause();
    }
    resetInput() {
      this.target = undefined;
      this.targetNode = undefined;
      this.velocity = 0;
      inputX = 0;
      if (this.input.keyboard) {
        this.input.keyboard.resetKeys();
        this.input.keyboard.clearCaptures();
        this.input.keyboard.enabled = !paused;
        if (!paused) this.input.keyboard.addCapture('LEFT,RIGHT,SPACE');
      }
    }
    canInteract(n: InteractionNode) {
      return Math.abs(state.position.x - n.x) < (n.radius ?? 65);
    }
    walk(x: number, node?: InteractionNode) {
      this.resetInput();
      if (paused || transitioning) return;
      this.target = Math.max(
        56,
        Math.min(getScene(state.sceneId).width - 56, x),
      );
      this.targetNode = node;
    }
    configureCamera() {
      const def = getScene(state.sceneId),
        camera = this.cameras.main;
      // Cover every viewport. A narrow screen sees a closer, horizontally tracked slice.
      const zoom = Math.max(
        this.scale.width / def.width,
        this.scale.height / def.height,
      );
      camera
        .setZoom(zoom)
        .setBounds(0, 0, def.width, def.height)
        .setRoundPixels(true)
        .setBackgroundColor('#202e35');
      camera.centerOn(state.position.x, this.cameraFocusY());
    }
    cameraFocusY() {
      const def = getScene(state.sceneId);
      const half = this.scale.height / this.cameras.main.zoom / 2;
      return Phaser.Math.Clamp(
        Math.max(def.height / 2, def.groundY! + 50 - half),
        half,
        def.height - half,
      );
    }
    update(time: number, delta: number) {
      if (this.failed || !this.avatar?.active || paused || transitioning)
        return;
      const def = getScene(state.sceneId),
        dt = Math.min(delta, 40) / 1000;
      let dx =
        inputX +
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      if (dx) {
        this.target = undefined;
        this.targetNode = undefined;
      }
      if (!dx && this.target !== undefined) {
        const gap = this.target - state.position.x;
        if (Math.abs(gap) < 3) {
          state.position.x = this.target;
          this.target = undefined;
          this.velocity = 0;
          const n = this.targetNode;
          this.targetNode = undefined;
          if (n) {
            perform(n);
            return;
          }
        } else dx = Math.sign(gap);
      }
      const speed = this.keys.SHIFT.isDown ? 270 : 180;
      this.velocity +=
        (Math.sign(dx) * speed - this.velocity) *
        (1 - Math.exp(-dt * (dx ? 14 : 22)));
      if (!dx && Math.abs(this.velocity) < 1) this.velocity = 0;
      const previous = state.position.x;
      let step = this.velocity * dt;
      if (
        this.target !== undefined &&
        Math.abs(step) > Math.abs(this.target - previous)
      )
        step = this.target - previous;
      state.position.x = Math.max(
        56,
        Math.min(def.width - 56, previous + step),
      );
      const moved = Math.abs(state.position.x - previous);
      if (moved > 0.03) {
        this.facing = state.position.x > previous ? 2 : 1;
        this.travelled += moved;
      }
      const frame = moved > 0.03 ? Math.floor(this.travelled / 15) % 8 : 0;
      this.avatar.setPosition(
        state.position.x,
        state.position.y -
          (!reduced && moved < 0.03 ? Math.sin(time / 1000) * 0.4 : 0),
      );
      posePlayer(this.avatar, this.facing, frame);
      this.shadow.setX(state.position.x);
      const camera = this.cameras.main;
      const viewWidth = this.scale.width / camera.zoom;
      const targetX = Math.max(
        viewWidth / 2,
        Math.min(
          def.width - viewWidth / 2,
          state.position.x + this.facingVector() * 50,
        ),
      );
      camera.centerOn(
        Phaser.Math.Linear(
          camera.midPoint.x,
          targetX,
          reduced ? 1 : 1 - Math.exp(-dt * 5),
        ),
        this.cameraFocusY(),
      );
      let candidate: InteractionNode | null = null,
        min = Infinity;
      def.nodes.forEach((n, i) => {
        const gap = Math.abs(n.x - state.position.x);
        if (gap < (n.radius ?? 65) && gap < min) {
          candidate = n;
          min = gap;
        }
        this.lamps[i].setAlpha(gap < 90 ? 0.95 : n.hidden ? 0.16 : 0.55);
      });
      if ((candidate as InteractionNode | null)?.id !== near?.id) {
        near = candidate;
        callbacks.onNear(near);
      }
      if (
        (moved > 0.03 && time - this.lastSave > 1000) ||
        (!moved && this.wasMoving)
      ) {
        this.lastSave = time;
        save();
      }
      this.wasMoving = moved > 0;
    }
    facingVector() {
      return this.facing === 2 ? 1 : -1;
    }
  }
  function perform(n: InteractionNode) {
    if (paused || transitioning || !active?.canInteract(n)) return;
    active.resetInput();
    if (!state.visited.includes(n.id)) state.visited.push(n.id);
    const index = getScene(state.sceneId).nodes.findIndex(
      (node) => node.id === n.id,
    );
    active.lamps[index]?.setFillStyle(0x8acbc1);
    save();
    if (n.action.type === 'enter-scene') {
      enter(n.action.sceneId, n.action.spawnId);
      return;
    }
    if (n.action.type === 'inspect') {
      callbacks.onNotice(n.action.text);
      return;
    }
    if (n.action.type === 'discover') {
      if (!state.discoveries.includes(n.action.discovery))
        state.discoveries.push(n.action.discovery);
      save();
      if (!reduced) active.cameras.main.flash(320, 117, 169, 153, false);
      callbacks.onNotice('通讯器传来一声轻响：「收到。今天也辛苦了。」');
      return;
    }
    callbacks.onAction(n.action);
  }
  function enter(id: string, spawnId = 'default') {
    if (destroyed || transitioning || !SCENES.some((s) => s.id === id)) return;
    const def = getScene(id),
      spawn = def.spawnPoints[spawnId];
    if (!spawn) return;
    transitioning = true;
    active?.resetInput();
    callbacks.onNear(null);
    near = null;
    const finish = () => {
      if (destroyed || !transitioning) return;
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = undefined;
      transitioning = false;
      finishTransition = undefined;
      state.sceneId = id;
      state.layoutVersion = def.layoutVersion;
      state.position = { ...spawn };
      save();
      game.scene.start('archive');
    };
    finishTransition = finish;
    if (!reduced && active) {
      active.cameras.main.fadeOut(320, 20, 27, 32);
      transitionTimer = setTimeout(finish, 330);
    } else finish();
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: '#202e35',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArchiveScene],
    audio: { noAudio: true },
    input: { keyboard: true, touch: true },
    fps: { target: 60 },
    banner: false,
  });
  const blur = () => {
    active?.resetInput();
    inputX = 0;
    save();
  };
  const visibility = () => {
    if (document.hidden) blur();
  };
  const changeMotion = () => {
    reduced = motion.matches;
    if (reduced) finishTransition?.();
  };
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', changeMotion);
  return {
    destroy() {
      destroyed = true;
      if (transitionTimer) clearTimeout(transitionTimer);
      save();
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', changeMotion);
      game.destroy(true);
    },
    pause(value) {
      if (paused === value) return;
      paused = value;
      active?.resetInput();
      if (active) {
        if (value) active.scene.pause();
        else active.scene.resume();
      }
      save();
    },
    enter,
    interact() {
      if (near) perform(near);
    },
    setDirection(v: Point) {
      if (!paused && !transitioning) inputX = v.x;
    },
    snapshot,
    skip() {
      finishTransition?.();
    },
    completeGame(id, moves) {
      if (!Number.isFinite(moves) || moves <= 0) return;
      state.games[id] = Math.min(state.games[id] ?? Infinity, moves);
      save();
      callbacks.onNotice('备用回路接通了，工坊又多了一点光。');
    },
    walkTo(id) {
      if (paused || transitioning) return;
      const n = getScene(state.sceneId).nodes.find((n) => n.id === id);
      if (n) active?.walk(n.x, n);
      else callbacks.onNotice('先回到维修通道，就能找到这道舱门。');
    },
  };
}
