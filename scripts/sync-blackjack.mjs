import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The uploaded standalone game remains the maintenance source. Do not copy its
// main.tsx, tests, independent package dependencies or portable React bundle.
const source = new URL('../standalone/blackjack/src/', import.meta.url);
const target = new URL(
  '../components/games/blackjack/generated/',
  import.meta.url,
);
const files = [
  'BlackjackGame.tsx',
  'CoachReview.tsx',
  'PlayingCard.tsx',
  'coachWorkerClient.ts',
  'coachWorkerSource.ts',
  'engine.ts',
  'game.ts',
  'solver.ts',
  'storage.ts',
  'theme.css',
];
const checkOnly = process.argv.includes('--check');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--check');
if (unknownArgs.length)
  throw new Error(`Unknown arguments: ${unknownArgs.join(', ')}`);
if (!checkOnly) await mkdir(target, { recursive: true });
const stale = [];
for (const file of files) {
  const original = await readFile(new URL(file, source), 'utf8');
  const css = file.endsWith('.css');
  const notice = css
    ? '/* Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source. */\n'
    : '// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.\n';
  // Preserve the independently tested state-machine/focus implementation. Its
  // CSS-built cards and scrollable hands intentionally use accessible roles.
  const lintRules = {
    'BlackjackGame.tsx':
      'react/react-compiler, react-hooks/exhaustive-deps, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex',
    'CoachReview.tsx': 'jsx-a11y/prefer-tag-over-role',
    'PlayingCard.tsx': 'jsx-a11y/prefer-tag-over-role',
    'coachWorkerSource.ts': 'import/no-anonymous-default-export',
  };
  const lintNotice = lintRules[file]
    ? `/* oxlint-disable ${lintRules[file]} -- Preserve the standalone game implementation verified by its own state-machine, focus and Worker tests. */\n`
    : '';
  const expected = `${notice}${lintNotice}${original}`;
  const destination = new URL(file, target);
  const current = await readFile(destination, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (current === expected) continue;
  if (checkOnly) stale.push(file);
  else await writeFile(destination, expected);
}
if (stale.length) {
  throw new Error(
    `Blackjack source is out of sync: ${stale.join(', ')}. Run node scripts/sync-blackjack.mjs.`,
  );
}
console.log(
  `${checkOnly ? 'Verified' : 'Synced'} ${files.length} blackjack runtime files at ${fileURLToPath(target)}.`,
);
