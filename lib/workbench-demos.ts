const DAY_MS = 86_400_000;
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) &&
    new Date(stamp).toISOString().slice(0, 10) === value
    ? stamp
    : null;
}

// The source project counts both purchase day and settlement day.
export function assetDailyCost(amount: number, start: string, end: string) {
  const from = dateValue(start),
    to = dateValue(end);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    from === null ||
    to === null ||
    to < from
  )
    return null;
  const days = Math.floor((to - from) / DAY_MS) + 1;
  return {
    days,
    daily: Math.round((amount / days + Number.EPSILON) * 100) / 100,
  };
}

export const DELIVERY_NODES = [
  { name: '餐厅', x: 48, y: 105 },
  { name: '图书馆', x: 170, y: 40 },
  { name: '教学楼', x: 170, y: 170 },
  { name: '东宿舍', x: 318, y: 40 },
  { name: '西宿舍', x: 318, y: 170 },
  { name: '运动场', x: 435, y: 105 },
] as const;
// Synthetic distances in metres; this is a teaching sample, not the source campus.
export const DELIVERY_EDGES = [
  [0, 1, 180],
  [0, 2, 120],
  [1, 2, 90],
  [1, 3, 220],
  [2, 4, 160],
  [3, 4, 80],
  [3, 5, 140],
  [4, 5, 210],
] as const;

export function deliveryRoute(destination: number) {
  if (
    !Number.isInteger(destination) ||
    destination < 0 ||
    destination >= DELIVERY_NODES.length
  )
    return null;
  const distances = DELIVERY_NODES.map(() => Infinity);
  const previous = DELIVERY_NODES.map(() => -1);
  const visited = new Set<number>();
  distances[0] = 0;
  while (visited.size < DELIVERY_NODES.length) {
    let node = -1;
    for (let i = 0; i < distances.length; i++) {
      if (!visited.has(i) && (node === -1 || distances[i] < distances[node]))
        node = i;
    }
    if (node === -1 || !Number.isFinite(distances[node])) break;
    visited.add(node);
    for (const [a, b, weight] of DELIVERY_EDGES) {
      const next = a === node ? b : b === node ? a : -1;
      if (next !== -1 && distances[node] + weight < distances[next]) {
        distances[next] = distances[node] + weight;
        previous[next] = node;
      }
    }
  }
  const path: number[] = [];
  for (let n = destination; n !== -1; n = previous[n]) path.unshift(n);
  return { path, distance: distances[destination] };
}
