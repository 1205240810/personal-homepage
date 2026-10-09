import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Independent projects own their runtime sources. The host reuses its React;
// entry points, tests, package dependencies and portable bundles stay separate.
const games = {
  sudoku: [
    'SudokuGame.tsx',
    'logic.ts',
    'storage.ts',
    'progress.ts',
    'puzzles.json',
    'audio.ts',
    'sudoku.css',
  ],
  yahtzee: [
    'YahtzeeGame.tsx',
    'logic.ts',
    'ai.ts',
    'worker-source.ts',
    'audio.ts',
    'styles.css',
  ],
  stud: ['StudGame.tsx', 'engine.ts', 'save.ts', 'audio.ts', 'stud.css'],
};
const checkOnly = process.argv.includes('--check');
if (process.argv.slice(2).some((arg) => arg !== '--check')) {
  throw new Error('Use node scripts/sync-standalone-games.mjs [--check]');
}
const stale = [];
let count = 0;
for (const [id, files] of Object.entries(games)) {
  const source = new URL(`../standalone/${id}/src/`, import.meta.url);
  const target = new URL(
    `../components/games/${id}/generated/`,
    import.meta.url,
  );
  if (!checkOnly) await mkdir(target, { recursive: true });
  for (const file of files) {
    const original = await readFile(new URL(file, source), 'utf8');
    const message = `Synced from standalone/${id}/src by scripts/sync-standalone-games.mjs. Edit the standalone source.`;
    const notice = file.endsWith('.json')
      ? ''
      : file.endsWith('.css')
        ? `/* ${message} */\n`
        : `// ${message}\n`;
    const expected = notice + original;
    const destination = new URL(file, target);
    const current = await readFile(destination, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current !== expected) {
      if (checkOnly) stale.push(`${id}/${file}`);
      else await writeFile(destination, expected);
    }
    count += 1;
  }
}
if (stale.length)
  throw new Error(
    `Game sources are out of sync: ${stale.join(', ')}. Run node scripts/sync-standalone-games.mjs.`,
  );
console.log(
  `${checkOnly ? 'Verified' : 'Synced'} ${count} runtime files for Sudoku, Yahtzee and Stud.`,
);
