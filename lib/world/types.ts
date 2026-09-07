import type { SceneryLayer, DoorDefinition } from './scenery';
export type Chapter = 'undergraduate' | 'graduate' | 'life';
export type Point = { x: number; y: number };
export type MiniGameId = 'circuit' | 'memory';
export type DiscoveryId = 'sleepy-eye' | 'maintenance-cat';
export type WorldAction =
  | { type: 'open-content'; contentId: string }
  | { type: 'open-collection'; chapter?: Chapter }
  | { type: 'enter-scene'; sceneId: string; spawnId?: string }
  | { type: 'open-projects' }
  | { type: 'open-game'; game: MiniGameId }
  | { type: 'discover'; discovery: DiscoveryId }
  | { type: 'activate-armor' }
  | { type: 'adjust-sluice'; valve: 'intake' | 'outlet' }
  | { type: 'inspect'; text: string }
  | { type: 'use-lift' };
export type InteractionNode = Point & {
  id: string;
  label: string;
  hint: string;
  action: WorldAction;
  radius?: number;
  sign?: string;
  category?: 'blog' | 'profile' | 'projects' | 'play' | 'exit';
  hidden?: boolean;
  requires?: 'bridge' | 'lift';
  automatic?: boolean;
};
export type SceneDefinition = {
  id: string;
  title: string;
  en: string;
  chapter?: Chapter;
  description: string;
  art: string;
  width: number;
  height: number;
  outdoor?: boolean;
  terrain?: TerrainDefinition;
  frame?: number;
  layers?: SceneryLayer[];
  doors?: DoorDefinition[];
  spawnPoints: Record<string, Point>;
  walkable: number[][][];
  obstacles?: number[][][];
  layoutVersion?: number;
  nodes: InteractionNode[];
  overview: Point;
};
export type TerrainDefinition = {
  islands: number[][][];
  paths: { points: number[][]; width: number }[];
  bridges: {
    x: number;
    y: number;
    width: number;
    height: number;
    gated?: boolean;
  }[];
};
export type ExplorationState = {
  intake: number;
  outlet: number;
  bridge: boolean;
  lift: boolean;
};
export type WorldSnapshot = {
  exploration: ExplorationState;
  layoutVersion?: number;
  sceneId: string;
  position: Point;
  armorOpen: boolean;
  visited: string[];
  discoveries: DiscoveryId[];
  games: Partial<Record<MiniGameId, number>>;
};
export type GameHandle = {
  destroy(): void;
  pause(paused: boolean): void;
  enter(sceneId: string, spawnId?: string): void;
  interact(): void;
  setDirection(direction: Point): void;
  snapshot(): WorldSnapshot;
  skip(): void;
  completeGame(game: MiniGameId, moves: number): void;
  walkTo(nodeId: string): void;
};
