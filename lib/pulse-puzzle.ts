export const PULSE_MASKS = Array.from({ length: 16 }, (_, i) => {
  const row = Math.floor(i / 4),
    col = i % 4;
  return [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(([r, c]) => r >= 0 && r < 4 && c >= 0 && c < 4)
    .reduce((mask, [r, c]) => mask | (1 << (r * 4 + c)), 0);
});
export const PULSE_LEVELS = [
  { name: '两点之间', board: 0x4c32, par: 2 },
  { name: '交错回路', board: 0x0ae7, par: 4 },
  { name: '最后的脉冲', board: 0xb5ad, par: 6 },
] as const;

export function pressPulse(board: number, cell: number) {
  return Number.isInteger(cell) && cell >= 0 && cell < 16
    ? board ^ PULSE_MASKS[cell]
    : board;
}

export function solvePulse(board: number): number | null {
  if (!Number.isInteger(board) || board < 0 || board > 0xffff) return null;
  let effect = 0,
    previous = 0,
    count = 0,
    best: number | null = null,
    bestCount = 17;
  // Gray-code order changes exactly one switch between combinations.
  for (let n = 0; n < 65536; n++) {
    const presses = n ^ (n >>> 1);
    if (n) {
      const changed = presses ^ previous;
      effect ^= PULSE_MASKS[31 - Math.clz32(changed)];
      count += presses & changed ? 1 : -1;
    }
    if (effect === board && count < bestCount) {
      best = presses;
      bestCount = count;
    }
    previous = presses;
  }
  return best;
}
