/** Assets a scene's preload() requests; warming them hides the door transition. */
export const sceneAssets = (scene: { id: string; art: string }) => [
  scene.art,
  `/maps/${scene.id}.json`,
];
/**
 * Fire-and-forget HTTP warm-up for the room behind a door the player is
 * approaching. Each URL is requested once per page; failures are ignored
 * because Phaser's own loader will retry and report errors on entry.
 */
export function createScenePrefetcher(
  load: (url: string) => Promise<unknown> = (url) =>
    fetch(url, { credentials: 'same-origin' }),
) {
  const requested = new Set<string>();
  return (scene: { id: string; art: string }) => {
    for (const url of sceneAssets(scene)) {
      if (requested.has(url)) continue;
      requested.add(url);
      load(url).catch(() => requested.delete(url));
    }
  };
}
