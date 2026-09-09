// Ports: north=1, east=2, south=4, west=8. The source is left of tile 0.
export const BASE_TILES = [10, 12, 5, 6, 9, 6, 3, 10, 10];
export function rotatePipe(mask: number, turns = 1) {
  for (let i = 0; i < turns; i++) mask = ((mask << 1) & 15) | (mask >> 3);
  return mask;
}
export const initialCircuit = () =>
  BASE_TILES.map((mask, i) => rotatePipe(mask, [1, 1, 2, 2, 3, 1, 0, 1, 1][i]));
export function circuitState(tiles: number[]) {
  const lit = new Set<number>();
  if (!(tiles[0] & 8)) return { lit, solved: false };
  const queue = [0];
  lit.add(0);
  for (let at = 0; at < queue.length; at++) {
    const index = queue[at],
      row = Math.floor(index / 3),
      column = index % 3;
    for (const [dr, dc, port, opposite] of [
      [-1, 0, 1, 4],
      [0, 1, 2, 8],
      [1, 0, 4, 1],
      [0, -1, 8, 2],
    ]) {
      const r = row + dr,
        c = column + dc,
        next = r * 3 + c;
      if (
        r < 0 ||
        r > 2 ||
        c < 0 ||
        c > 2 ||
        !(tiles[index] & port) ||
        !(tiles[next] & opposite) ||
        lit.has(next)
      )
        continue;
      lit.add(next);
      queue.push(next);
    }
  }
  return { lit, solved: lit.has(8) && !!(tiles[8] & 2) };
}
export function shuffledSignals() {
  const cards = [0, 0, 1, 1, 2, 2, 3, 3];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
