import type { Point } from './types';
export function insidePolygon(point: Point, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export const canWalk = (
  p: Point,
  areas: number[][][],
  obstacles: number[][][] = [],
) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  areas.some((a) => insidePolygon(p, a)) &&
  !obstacles.some((a) => insidePolygon(p, a));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
