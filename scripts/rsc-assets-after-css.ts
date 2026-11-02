import type { Plugin } from 'vite';

/** Work around plugin-rsc 0.5.26 snapshotting CSS-only JS placeholders before
 * Vite 8 removes them. Build preload dependencies from the final bundle, after
 * CSS imports have been transferred to their importing chunks. */
export function rscAssetsAfterCss(): Plugin {
  return {
    name: 'rsc-assets-after-css',
    apply: 'build',
    configResolved(config) {
      const plugin = config.plugins.find(
        (item) => item.name === 'rsc:virtual:vite-rsc/assets-manifest',
      );
      const hook = plugin?.generateBundle;
      if (!plugin || !hook) {
        throw new Error('RSC assets hook changed; recheck the CSS preload workaround');
      }
      plugin.generateBundle = typeof hook === 'function'
        ? { order: 'post', handler: hook }
        : { ...hook, order: 'post' };
    },
  };
}
