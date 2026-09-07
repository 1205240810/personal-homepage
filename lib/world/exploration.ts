import type { ExplorationState, SceneDefinition } from './types';
export const INITIAL_EXPLORATION: ExplorationState = {
  intake: 0,
  outlet: 2,
  bridge: false,
  lift: false,
};
export const waterLevel = (state: ExplorationState) =>
  2 + state.intake - state.outlet;
export function restoreExploration(value: unknown): ExplorationState {
  const v = value as Partial<ExplorationState> | undefined;
  const valve = (n: unknown, fallback: number) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 2
      ? Number(n)
      : fallback;
  return {
    intake: valve(v?.intake, 0),
    outlet: valve(v?.outlet, 2),
    bridge: v?.bridge === true,
    lift: v?.bridge === true && v?.lift === true,
  };
}
export function turnValve(
  state: ExplorationState,
  valve: 'intake' | 'outlet',
): ExplorationState {
  if (state.bridge) return state;
  const next = { ...state, [valve]: (state[valve] + 1) % 3 };
  if (waterLevel(next) === 3) next.bridge = true;
  return next;
}
export function collisionFor(
  scene: SceneDefinition,
  progress: ExplorationState,
) {
  const closedBridges = (scene.terrain?.bridges ?? [])
    .filter((b) => b.gated && !progress.bridge)
    .map((b) => [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ]);
  return {
    areas: scene.walkable,
    obstacles: [...(scene.obstacles ?? []), ...closedBridges],
  };
}
export const explorationObjective = (s?: ExplorationState) =>
  !s?.bridge
    ? '循着水声，看看河边的浮桥'
    : !s.lift
      ? '浮桥已接通 · 沿河去水车工坊'
      : '升降捷径已接通 · 余下的路慢慢走';
