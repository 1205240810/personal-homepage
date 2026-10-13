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
const boxes = new WeakMap<number[][], [number, number, number, number]>();
/** Cached [left, top, right, bottom]; polygons are static scene data. */
export function bounds(polygon: number[][]) {
  let box = boxes.get(polygon);
  if (!box) {
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    boxes.set(polygon, box);
  }
  return box;
}
const inside = (p: Point, polygon: number[][]) => {
  const [left, top, right, bottom] = bounds(polygon);
  return (
    p.x >= left &&
    p.x <= right &&
    p.y >= top &&
    p.y <= bottom &&
    insidePolygon(p, polygon)
  );
};
export const canWalk = (
  p: Point,
  areas: number[][][],
  obstacles: number[][][] = [],
) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  areas.some((a) => inside(p, a)) &&
  !obstacles.some((a) => inside(p, a));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
