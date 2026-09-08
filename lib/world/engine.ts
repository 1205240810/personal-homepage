import Phaser from 'phaser';
import { makePlayerTextures, posePlayer } from './player';
import { SCENES, getScene, ARCHIVE_GANTRY } from './registry';
import { traversable, clearSegment, findRoute } from './navigation';
import { distance } from './geometry';
import { getDiscovery } from './discoveries';
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
    onLoading(sceneId: string): void;
    onError(message: string): void;
    onNotice(message: string): void;
  },
): GameHandle {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches,
    paused = false,
    destroyed = false,
    transitioning = false;
  let input = { x: 0, y: 0 },
    active: ArchiveScene | undefined,
    near: InteractionNode | null = null;
  let transitionTimer: ReturnType<typeof setTimeout> | undefined,
    finishTransition: (() => void) | undefined;
  // The legacy exploration field is retained only for old save compatibility. It never gates content or travel.
  let state: WorldSnapshot = {
    exploration: { intake: 0, outlet: 0, bridge: false, lift: false },
    sceneId: 'hub',
    layoutVersion: getScene('hub').layoutVersion,
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
          old.position &&
          traversable(old.position, def.walkable, def.obstacles)
            ? { ...old.position }
            : { ...def.spawnPoints.default },
        visited: Array.isArray(old.visited)
          ? old.visited.filter((id: string) => nodes.has(id))
          : [],
        discoveries: Array.isArray(old.discoveries)
          ? old.discoveries.filter(
              (id: string) => !!getDiscovery(id) || id === 'maintenance-cat',
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
  if (state.sceneId === 'vault') {
    state.sceneId = 'undergraduate';
    state.position = {
      ...getScene('undergraduate').spawnPoints['private-door'],
    };
  }
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
    lamps: Phaser.GameObjects.Image[] = [];
    roomLights: { image: Phaser.GameObjects.Image; strength: number }[] = [];
    hoveredNodeId: string | null = null;
    destination?: Phaser.GameObjects.Ellipse;
    route: Point[] = [];
    targetNode?: InteractionNode;
    velocity = { x: 0, y: 0 };
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
      const def = getScene(state.sceneId),
        key = `world:${def.art}`;
      if (!this.textures.exists(key)) this.load.image(key, def.art);
      this.load.tilemapTiledJSON(`map-${def.id}`, `/maps/${def.id}.json`);
      const failure = () => {
        this.failed = true;
        transitioning = false;
        finishTransition = undefined;
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
      this.route = [];
      this.targetNode = undefined;
      this.velocity = { x: 0, y: 0 };
      this.travelled = 0;
      this.wasMoving = false;
      this.lamps = [];
      this.roomLights = [];
      this.hoveredNodeId = null;
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
        .setDisplaySize(def.width, def.height)
        .setDepth(0);
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.createLightTexture();
      for (const light of def.lighting ?? []) {
        const image = this.add
          .image(light.x, light.y, 'archive-light')
          .setDisplaySize(light.radius * 2, light.radius * 2)
          .setTint(light.color)
          .setAlpha(light.strength)
          .setDepth(1)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.roomLights.push({ image, strength: light.strength });
      }
      this.createSpatialLayers(key, def.frame);
      makePlayerTextures(this);
      this.shadow = this.add
        .ellipse(state.position.x, state.position.y + 1, 27, 8, 0x070e12, 0.55)
        .setScale((def.playerScale ?? 0.43) / 0.43)
        .setDepth(state.position.y - 1);
      this.avatar = this.add
        .sprite(state.position.x, state.position.y, 'explorer', 'idle-2')
        .setOrigin(0.5, 1)
        .setScale(def.playerScale ?? 0.48)
        .setDepth(state.position.y);
      posePlayer(this.avatar, this.facing, -1);
      this.destination = this.add
        .ellipse(0, 0, 24, 10)
        .setStrokeStyle(1, 0xedc78e, 0.75)
        .setDepth(2)
        .setVisible(false);
      def.nodes.forEach((n) => {
        const point = n.effectPoint ?? { x: n.x, y: n.y - 4 };
        const lamp = this.add
          .image(point.x, point.y, 'archive-light')
          .setDisplaySize(n.effectPoint ? 58 : 34, n.effectPoint ? 42 : 12)
          .setTint(state.visited.includes(n.id) ? 0x8acbc1 : 0xf2bb79)
          .setAlpha(n.hidden ? 0 : 0.18)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(n.effectPoint ? 799 : 2);
        this.lamps.push(lamp);
        if (
          n.action.type === 'discover' &&
          state.discoveries.includes(n.action.discovery)
        )
          this.discoveryFeedback(n, false);
        const hotspot = this.add
          .zone(
            n.effectPoint?.x ?? n.x,
            n.effectPoint?.y ?? n.y - 55,
            n.effectPoint ? 54 : n.hidden ? 60 : 100,
            n.effectPoint ? 42 : n.hidden ? 65 : 120,
          )
          .setInteractive({ useHandCursor: true });
        hotspot.on('pointerup', () => {
          if (!paused && !transitioning) {
            if (this.canInteract(n)) perform(n);
            else this.walk(n, n);
          }
        });
        hotspot.on('pointerover', () => {
          this.hoveredNodeId = n.id;
        });
        hotspot.on('pointerout', () => {
          if (this.hoveredNodeId === n.id) this.hoveredNodeId = null;
        });
      });
      this.keys = this.input.keyboard!.addKeys(
        'W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,SHIFT',
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
          this.walk(point);
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
      save();
      transitioning = true;
      let arrived = false;
      const arrive = () => {
        if (arrived || destroyed) return;
        arrived = true;
        transitioning = false;
        finishTransition = undefined;
        this.resetInput();
        callbacks.onReady();
        if (paused) this.scene.pause();
      };
      if (!reduced) {
        this.cameras.main.once('camerafadeincomplete', arrive);
        finishTransition = () => {
          this.cameras.main.resetFX();
          arrive();
        };
        this.cameras.main.fadeIn(420, 20, 27, 32);
      } else arrive();
    }
    createLightTexture() {
      if (this.textures.exists('archive-light')) return;
      const texture = this.textures.createCanvas('archive-light', 128, 128)!;
      const ctx = texture.context,
        gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
      gradient.addColorStop(0.2, 'rgba(255,255,255,0.35)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      texture.refresh();
    }
    discoveryFeedback(node: InteractionNode, animate: boolean) {
      if (node.action.type !== 'discover') return;
      const discovery = getDiscovery(node.action.discovery);
      if (!discovery) return;
      const point = node.effectPoint ?? { x: node.x, y: node.y - 45 };
      const name = `discovery:${node.id}`;
      if (!this.children.getByName(name))
        this.add
          .circle(point.x, point.y, 2.5, discovery.color, 0.8)
          .setName(name)
          .setDepth(800);
      if (!animate || reduced) return;
      for (let i = 0; i < 2; i++) {
        const ring = this.add
          .circle(point.x, point.y, 5)
          .setStrokeStyle(1, discovery.color, 0.8)
          .setDepth(800);
        this.tweens.add({
          targets: ring,
          scale: 5,
          alpha: 0,
          duration: 1200,
          delay: i * 280,
          ease: 'Sine.easeOut',
          onComplete: () => ring.destroy(),
        });
      }
    }
    resetInput() {
      this.route = [];
      this.targetNode = undefined;
      this.velocity = { x: 0, y: 0 };
      input = { x: 0, y: 0 };
      this.destination?.setVisible(false);
      if (this.avatar?.active) posePlayer(this.avatar, this.facing, -1);
      if (this.input.keyboard) {
        this.input.keyboard.resetKeys();
        this.input.keyboard.clearCaptures();
        this.input.keyboard.enabled = !paused;
        if (!paused) this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
      }
    }
    createSpatialLayers(key: string, frame?: number) {
      const def = getScene(state.sceneId);
      // Occlusion uses the same unmodified artwork; its furniture is redrawn over a passerby.
      (def.foreground ?? []).forEach((layer, index) => {
        const x = Math.floor(Math.min(...layer.outline.map((p) => p[0]))),
          y = Math.floor(Math.min(...layer.outline.map((p) => p[1])));
        const w = Math.ceil(Math.max(...layer.outline.map((p) => p[0]))) - x,
          h = Math.ceil(Math.max(...layer.outline.map((p) => p[1]))) - y;
        const source = this.textures
          .get(key)
          .getSourceImage() as HTMLImageElement;
        const frameHeight =
          frame === undefined ? source.height : Math.floor(source.height / 3);
        const sx = source.width / def.width,
          sy = frameHeight / def.height;
        const textureKey = `foreground:${def.id}:${index}`,
          cut = this.textures.createCanvas(
            textureKey,
            Math.ceil(w * sx),
            Math.ceil(h * sy),
          )!;
        const ctx = cut.context;
        ctx.save();
        ctx.scale(sx, sy);
        ctx.beginPath();
        layer.outline.forEach(([px, py], i) =>
          i ? ctx.lineTo(px - x, py - y) : ctx.moveTo(px - x, py - y),
        );
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          source,
          x * sx,
          y * sy + (frame ?? 0) * frameHeight,
          w * sx,
          h * sy,
          0,
          0,
          w,
          h,
        );
        ctx.restore();
        cut.refresh();
        this.add
          .image(x, y, textureKey)
          .setOrigin(0)
          .setDisplaySize(w, h)
          .setDepth(layer.depth);
        this.events.once('shutdown', () => this.textures.remove(textureKey));
      });
      if (def.id !== 'hub') return;
      // A raised service gantry bridges the right arm, so the chest door has a visible physical route.
      const g = this.add.graphics().setDepth(2),
        points = ARCHIVE_GANTRY.map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.lineStyle(53, 0x070f14, 0.65).strokePoints(
        points.map((p) => new Phaser.Math.Vector2(p.x, p.y + 7)),
        false,
      );
      g.lineStyle(48, 0x182528).strokePoints(points, false);
      g.lineStyle(44, 0x806f4b).strokePoints(points, false);
      g.lineStyle(40, 0x394345).strokePoints(points, false);
      const deck = this.textures.createCanvas('gantry-deck', 400, 135)!,
        ctx = deck.context;
      const paving = document.createElement('canvas');
      paving.width = 32;
      paving.height = 16;
      paving
        .getContext('2d')!
        .drawImage(
          this.textures.get(key).getSourceImage() as HTMLImageElement,
          610,
          910,
          32,
          16,
          0,
          0,
          32,
          16,
        );
      ctx.save();
      ctx.translate(-970, -323);
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.lineWidth = 39;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ctx.createPattern(paving, 'repeat')!;
      ctx.stroke();
      ctx.restore();
      deck.refresh();
      this.add.image(970, 323, 'gantry-deck').setOrigin(0).setDepth(2.1);
      this.events.once('shutdown', () => this.textures.remove('gantry-deck'));
      for (let j = 1; j < points.length; j++) {
        const a = points[j - 1],
          b = points[j],
          length = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y),
          nx = -(b.y - a.y) / length,
          ny = (b.x - a.x) / length;
        for (let t = 0; t < length; t += 10) {
          const x = a.x + ((b.x - a.x) * t) / length,
            y = a.y + ((b.y - a.y) * t) / length;
          g.lineStyle(1, 0x152325, 0.8).lineBetween(
            x + nx * 19,
            y + ny * 19,
            x - nx * 19,
            y - ny * 19,
          );
          g.lineStyle(1, 0x8a8468, 0.25).lineBetween(
            x + nx * 19,
            y + ny * 19 + 1,
            x - nx * 19,
            y - ny * 19 + 1,
          );
        }
        for (const side of [-1, 1]) {
          g.lineStyle(1.5, 0xb6a275, 0.85).lineBetween(
            a.x + nx * 23 * side,
            a.y + ny * 23 * side - 9,
            b.x + nx * 23 * side,
            b.y + ny * 23 * side - 9,
          );
          for (let t = 10; t < length; t += 37) {
            const x = a.x + ((b.x - a.x) * t) / length + nx * 23 * side,
              y = a.y + ((b.y - a.y) * t) / length + ny * 23 * side;
            g.lineStyle(2, 0x776947).lineBetween(x, y, x, y - 10);
            g.fillStyle(0xe7b66b, 0.85).fillCircle(x, y - 10, 1.5);
          }
        }
      }
    }
    canInteract(n: InteractionNode) {
      const def = getScene(state.sceneId);
      return (
        distance(state.position, n) < (n.radius ?? 45) &&
        clearSegment(state.position, n, def.walkable, def.obstacles)
      );
    }
    walk(point: Point, node?: InteractionNode) {
      this.resetInput();
      if (paused || transitioning) return;
      const def = getScene(state.sceneId),
        route = findRoute(state.position, point, def.walkable, def.obstacles);
      if (!route) return;
      this.route = route;
      this.targetNode = node;
      this.destination?.setPosition(point.x, point.y).setVisible(true);
    }
    configureCamera() {
      const def = getScene(state.sceneId),
        camera = this.cameras.main;
      // Cover the viewport, with two-axis tracking on narrow displays. Avoid pixelated magnification.
      const inset = def.outdoor ? 0 : 30;
      const zoom = Math.max(
        this.scale.width / (def.width - inset * 2),
        this.scale.height / (def.height - inset * 2),
      );
      camera
        .setZoom(zoom)
        .setBounds(inset, inset, def.width - inset * 2, def.height - inset * 2)
        .setRoundPixels(false)
        .setBackgroundColor('#0c1820');
      const target = this.cameraTarget();
      camera.centerOn(target.x, target.y);
    }
    cameraTarget() {
      const def = getScene(state.sceneId),
        camera = this.cameras.main,
        halfW = this.scale.width / camera.zoom / 2,
        halfH = this.scale.height / camera.zoom / 2,
        inset = def.outdoor ? 0 : 30;
      return {
        x: Phaser.Math.Clamp(
          state.position.x,
          halfW + inset,
          def.width - halfW - inset,
        ),
        y: Phaser.Math.Clamp(
          state.position.y - 42,
          halfH + inset,
          def.height - halfH - inset,
        ),
      };
    }
    update(time: number, delta: number) {
      if (this.failed || !this.avatar?.active || paused || transitioning)
        return;
      const def = getScene(state.sceneId),
        dt = Math.min(delta, 40) / 1000,
        previous = { ...state.position };
      let dx =
        input.x +
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      let dy =
        input.y +
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
        (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
      if (dx || dy) {
        this.route = [];
        this.targetNode = undefined;
        this.destination?.setVisible(false);
      }
      if (this.targetNode && this.canInteract(this.targetNode)) {
        const n = this.targetNode;
        this.resetInput();
        perform(n);
        return;
      }
      let target = this.route[0];
      if (!dx && !dy && target) {
        let gap = distance(state.position, target);
        if (gap < 2) {
          state.position = { ...target };
          this.route.shift();
          target = this.route[0];
          if (!target) {
            this.velocity = { x: 0, y: 0 };
            this.destination?.setVisible(false);
          }
          gap = target ? distance(state.position, target) : 0;
        }
        if (target && gap) {
          dx = (target.x - state.position.x) / gap;
          dy = (target.y - state.position.y) / gap;
        }
      }
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) {
        dx /= magnitude;
        dy /= magnitude;
      }
      const speed =
          (this.keys.SHIFT.isDown ? 250 : 170) * (def.playerScale ?? 0.43),
        accel = 1 - Math.exp(-dt * (magnitude ? 15 : 24));
      this.velocity.x += (dx * speed - this.velocity.x) * accel;
      this.velocity.y += (dy * speed - this.velocity.y) * accel;
      if (!magnitude && Math.hypot(this.velocity.x, this.velocity.y) < 1)
        this.velocity = { x: 0, y: 0 };
      let sx = this.velocity.x * dt,
        sy = this.velocity.y * dt;
      if (target && Math.hypot(sx, sy) > distance(state.position, target)) {
        sx = target.x - state.position.x;
        sy = target.y - state.position.y;
      }
      const next = { x: state.position.x + sx, y: state.position.y + sy };
      if (clearSegment(previous, next, def.walkable, def.obstacles))
        state.position = next;
      else {
        const horizontal = { x: previous.x + sx, y: previous.y },
          vertical = { x: previous.x, y: previous.y + sy };
        if (clearSegment(previous, horizontal, def.walkable, def.obstacles))
          state.position = horizontal;
        else if (clearSegment(previous, vertical, def.walkable, def.obstacles))
          state.position = vertical;
        else this.velocity = { x: 0, y: 0 };
      }
      const moved = distance(previous, state.position),
        walking = moved > 0.015;
      if (walking) {
        const vx = state.position.x - previous.x,
          vy = state.position.y - previous.y;
        this.facing =
          Math.abs(vx) > Math.abs(vy) * 1.15
            ? vx > 0
              ? 2
              : 1
            : vy > 0
              ? 0
              : 3;
        this.travelled += moved;
      }
      // Distance drives the complete stride, so fast walking and blocked feet do not slide.
      const phase =
        (this.travelled / (128 * (def.playerScale ?? 0.43))) * Math.PI * 2;
      posePlayer(
        this.avatar,
        this.facing,
        walking ? Math.floor(((phase / (Math.PI * 2)) % 1) * 16) : -1,
      );
      this.avatar
        .setPosition(state.position.x, state.position.y)
        .setDepth(state.position.y);
      this.shadow
        .setPosition(state.position.x, state.position.y + 1)
        .setDepth(state.position.y - 1);
      const camera = this.cameras.main,
        targetCamera = this.cameraTarget(),
        ease = reduced ? 1 : 1 - Math.exp(-dt * 5);
      camera.centerOn(
        Phaser.Math.Linear(camera.midPoint.x, targetCamera.x, ease),
        Phaser.Math.Linear(camera.midPoint.y, targetCamera.y, ease),
      );
      let candidate: InteractionNode | null = null,
        min = Infinity;
      def.nodes.forEach((n, i) => {
        const gap = distance(n, state.position);
        if (gap < min && this.canInteract(n)) {
          candidate = n;
          min = gap;
        }
        const focused =
          this.hoveredNodeId === n.id || this.targetNode?.id === n.id;
        const alpha = focused
          ? 0.8
          : gap < (n.radius ?? 45)
            ? 0.55
            : n.hidden
              ? 0
              : 0.16;
        this.lamps[i].setAlpha(
          Phaser.Math.Linear(
            this.lamps[i].alpha,
            alpha,
            reduced ? 1 : 1 - Math.exp(-dt * 9),
          ),
        );
      });
      this.roomLights.forEach(({ image, strength }, i) =>
        image.setAlpha(
          strength *
            (reduced ? 1 : 1 + Math.sin(time / 1900 + i * 2) * 0.08) *
            (def.id === 'graduate' && state.games.circuit ? 1.35 : 1),
        ),
      );
      if ((candidate as InteractionNode | null)?.id !== near?.id) {
        near = candidate;
        callbacks.onNear(near);
      }
      if (
        (walking && time - this.lastSave > 1000) ||
        (!moved && this.wasMoving)
      ) {
        this.lastSave = time;
        save();
      }
      this.wasMoving = moved > 0;
    }
  }

  function perform(n: InteractionNode) {
    if (paused || transitioning || !active?.canInteract(n)) return;
    active.resetInput();
    if (n.effectPoint) {
      const dx = n.effectPoint.x - state.position.x,
        dy = n.effectPoint.y - state.position.y;
      active.facing =
        Math.abs(dx) > Math.abs(dy) * 1.15 ? (dx > 0 ? 2 : 1) : dy > 0 ? 0 : 3;
      posePlayer(active.avatar, active.facing, -1);
    }
    if (!state.visited.includes(n.id)) state.visited.push(n.id);
    const index = getScene(state.sceneId).nodes.findIndex(
      (node) => node.id === n.id,
    );
    active.lamps[index]?.setTint(0x8acbc1);
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
      const first = !state.discoveries.includes(n.action.discovery);
      if (first) state.discoveries.push(n.action.discovery);
      save();
      active.discoveryFeedback(n, first);
      const discovery = getDiscovery(n.action.discovery);
      if (discovery)
        callbacks.onNotice(first ? discovery.text : discovery.again);
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
    callbacks.onLoading(id);
    active?.resetInput();
    callbacks.onNear(null);
    near = null;
    const finish = () => {
      if (destroyed || !transitioning) return;
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = undefined;
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
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArchiveScene],
    audio: { noAudio: true },
    input: { keyboard: true, touch: true },
    fps: { target: 60 },
    banner: false,
  });
  const blur = () => {
    active?.resetInput();
    input = { x: 0, y: 0 };
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
      if (active && !transitioning) {
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
      if (!paused && !transitioning) input = { x: v.x, y: v.y };
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
      if (n) active?.walk(n, n);
      else callbacks.onNotice('先回到维修通道，就能找到这道舱门。');
    },
  };
}
