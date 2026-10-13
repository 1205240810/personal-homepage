/** Assets a scene's preload() requests; warming them hides the door transition. */
export const sceneAssets = (scene: { id: string; art: string }) => [
  scene.art,
  `/maps/${scene.id}.json`,
];
/**
 * Fire-and-forget HTTP warm-up for the room behind a door the player is
 * approaching. Successful URLs are warmed once per world instance. Failed
 * requests wait before another attempt so the per-frame caller cannot flood
 * the network while offline. Phaser still loads and reports errors on entry.
 */
export function createScenePrefetcher(
  load: (url: string) => Promise<unknown> = async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok)
      throw new Error(`Asset prefetch failed: ${response.status}`);
    // Wait for the whole response, including failures while reading its body.
    await response.arrayBuffer();
  },
  now: () => number = () => performance.now(),
) {
  const nextAttemptAt = new Map<string, number>();
  return (scene: { id: string; art: string }) => {
    for (const url of sceneAssets(scene)) {
      if (now() < (nextAttemptAt.get(url) ?? -Infinity)) continue;
      nextAttemptAt.set(url, Infinity);
      load(url).catch(() => nextAttemptAt.set(url, now() + 5_000));
    }
  };
}
