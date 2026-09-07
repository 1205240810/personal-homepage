import { canWalk, distance } from './geometry.ts';
import type { Point } from './types';
export function corridor(points: number[][], width: number) {
  const regions: number[][][] = [];
  const r = width / 2;
  for (const [x, y] of points)
    regions.push(
      Array.from({ length: 12 }, (_, i) => [
        x + Math.cos((i * Math.PI) / 6) * r,
        y + Math.sin((i * Math.PI) / 6) * r,
      ]),
    );
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1],
      [bx, by] = points[i],
      len = Math.hypot(bx - ax, by - ay),
      nx = (-(by - ay) / len) * r,
      ny = ((bx - ax) / len) * r;
    regions.push([
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ]);
  }
  return regions;
}
export function traversable(
  point: Point,
  areas: number[][][],
  obstacles: number[][][] = [],
  radius = 9,
) {
  if (
    point.x < radius ||
    point.y < radius ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    return false;
  return [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ].every(([x, y]) =>
    canWalk({ x: point.x + x, y: point.y + y }, areas, obstacles),
  );
}
/** Check every interval cut by a polygon edge; long paths cannot skip a narrow gap. */
export function clearSegment(
  a: Point,
  b: Point,
  areas: number[][][],
  obstacles: number[][][] = [],
) {
  if (!traversable(a, areas, obstacles) || !traversable(b, areas, obstacles))
    return false;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-8) return true;
  for (const [ox, oy] of [
    [0, 0],
    [9, 0],
    [-9, 0],
    [0, 9],
    [0, -9],
  ]) {
    const x = a.x + ox,
      y = a.y + oy,
      cuts = [0, 1];
    for (const polygon of [...areas, ...obstacles])
      for (let i = 0; i < polygon.length; i++) {
        const [px, py] = polygon[i],
          [qx, qy] = polygon[(i + 1) % polygon.length],
          ex = qx - px,
          ey = qy - py;
        const cross = dx * ey - dy * ex;
        if (Math.abs(cross) < 1e-9) continue;
        const t = ((px - x) * ey - (py - y) * ex) / cross,
          u = ((px - x) * dy - (py - y) * dx) / cross;
        if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
      }
    cuts.sort((u, v) => u - v);
    for (const t of cuts)
      if (!canWalk({ x: x + dx * t, y: y + dy * t }, areas, obstacles))
        return false;
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < 1e-9) continue;
      const t = (cuts[i] + cuts[i - 1]) / 2;
      if (!canWalk({ x: x + dx * t, y: y + dy * t }, areas, obstacles))
        return false;
    }
  }
  return true;
}
/** Small bounded grid search. Both planning and movement use the same floor/obstacle test. */
export function findRoute(
  start: Point,
  goal: Point,
  areas: number[][][],
  obstacles: number[][][] = [],
): Point[] | null {
  if (
    !traversable(start, areas, obstacles) ||
    !traversable(goal, areas, obstacles)
  )
    return null;
  if (clearSegment(start, goal, areas, obstacles)) return [goal];
  const size = 16,
    cols = Math.ceil(Math.max(...areas.flat().map((p) => p[0])) / size) + 1,
    rows = Math.ceil(Math.max(...areas.flat().map((p) => p[1])) / size) + 1;
  const point = (id: number) => ({
    x: (id % cols) * size,
    y: Math.floor(id / cols) * size,
  });
  const allowed = new Map<number, boolean>();
  const valid = (id: number) => {
    if (id < 0 || id >= cols * rows) return false;
    if (!allowed.has(id))
      allowed.set(id, traversable(point(id), areas, obstacles));
    return allowed.get(id)!;
  };
  const nearCell = (p: Point) => {
    const cx = Math.round(p.x / size),
      cy = Math.round(p.y / size),
      candidates: number[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx,
          y = cy + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const id = y * cols + x;
          if (valid(id) && clearSegment(p, point(id), areas, obstacles))
            candidates.push(id);
        }
      }
    return candidates.sort(
      (a, b) => distance(p, point(a)) - distance(p, point(b)),
    )[0];
  };
  const from = nearCell(start),
    to = nearCell(goal);
  if (from === undefined || to === undefined) return null;
  const open = new Set([from]),
    previous = new Map<number, number>(),
    cost = new Map([[from, 0]]),
    f = new Map([[from, distance(point(from), point(to))]]);
  while (open.size) {
    let current = -1,
      best = Infinity;
    for (const id of open) {
      const score = f.get(id) ?? Infinity;
      if (score < best) {
        current = id;
        best = score;
      }
    }
    if (current === to) {
      const ids = [to];
      while (ids[0] !== from) ids.unshift(previous.get(ids[0])!);
      const raw = [start, ...ids.map(point), goal],
        smooth: Point[] = [];
      let at = 0;
      while (at < raw.length - 1) {
        let next = raw.length - 1;
        while (
          next > at + 1 &&
          !clearSegment(raw[at], raw[next], areas, obstacles)
        )
          next--;
        smooth.push(raw[next]);
        at = next;
      }
      return smooth;
    }
    open.delete(current);
    const x = current % cols,
      y = Math.floor(current / cols);
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const id = ny * cols + nx;
      if (!valid(id)) continue;
      if (dx && dy && (!valid(y * cols + nx) || !valid(ny * cols + x)))
        continue;
      if (!clearSegment(point(current), point(id), areas, obstacles)) continue;
      const next = (cost.get(current) ?? Infinity) + Math.hypot(dx, dy) * size;
      if (next < (cost.get(id) ?? Infinity)) {
        previous.set(id, current);
        cost.set(id, next);
        f.set(id, next + distance(point(id), point(to)));
        open.add(id);
      }
    }
  }
  return null;
}
