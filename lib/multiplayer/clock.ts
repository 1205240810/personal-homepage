/** A server clock sample anchored to this client's monotonic clock. */
export type PlayClock = { serverNow: number; receivedAt: number };

/** Never compare a remote Unix timestamp with the user's local wall clock. */
export function countdownSeconds(
  deadline: number | null,
  clock: PlayClock | null,
  now: number,
): number | null {
  if (deadline === null || clock === null) return null;
  const elapsed = Math.max(0, now - clock.receivedAt);
  return Math.max(0, Math.ceil((deadline - clock.serverNow - elapsed) / 1000));
}
