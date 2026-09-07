export type Chapter = 'undergraduate' | 'graduate' | 'life';
export type Point = { x: number; y: number };
export type WorldAction =
  | { type: 'open-content'; contentId: string }
  | { type: 'open-collection'; chapter?: Chapter }
  | { type: 'enter-scene'; sceneId: string; spawnId?: string }
  | { type: 'activate-armor' };
export type InteractionNode = Point & {
  id: string;
  label: string;
  hint: string;
  action: WorldAction;
  radius?: number;
};
export type SceneDefinition = {
  id: string;
  title: string;
  en: string;
  chapter?: Chapter;
  description: string;
  art: string;
  frame?: number;
  spawnPoints: Record<string, Point>;
  walkable: number[][][];
  nodes: InteractionNode[];
  overview: Point;
};
export type WorldSnapshot = {
  sceneId: string;
  position: Point;
  armorOpen: boolean;
  visited: string[];
};
export type GameHandle = {
  destroy(): void;
  pause(paused: boolean): void;
  enter(sceneId: string, spawnId?: string): void;
  interact(): void;
  setDirection(direction: Point): void;
  snapshot(): WorldSnapshot;
  skip(): void;
};
