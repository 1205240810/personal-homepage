import type { Point } from './types';
/**
 * Map a finger offset from the stick centre to a movement vector.
 * Inside the dead zone the stick is idle; beyond it speed ramps linearly to 1
 * at `radius`, and the knob is clamped to the rim so it never leaves the base.
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = 0.15,
): { direction: Point; knob: Point } {
  const length = Math.hypot(dx, dy);
  if (!(radius > 0) || !Number.isFinite(length) || length === 0)
    return { direction: { x: 0, y: 0 }, knob: { x: 0, y: 0 } };
  const reach = Math.min(1, length / radius),
    ux = dx / length,
    uy = dy / length,
    knob = { x: ux * reach * radius, y: uy * reach * radius };
  if (reach <= deadZone) return { direction: { x: 0, y: 0 }, knob };
  const strength = (reach - deadZone) / (1 - deadZone);
  return { direction: { x: ux * strength, y: uy * strength }, knob };
}
