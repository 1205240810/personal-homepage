// Exercise the built relay exactly as systemd starts it, including release links.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = await realpath(await mkdtemp(join(tmpdir(), '联机 启动检查-')));

async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function launch(args, input = '') {
  const child = spawn(process.execPath, args, {
    cwd: fixture,
    env: { ...process.env, PLAY_HOST: '127.0.0.1', PLAY_PORT: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end(input);
  let output = '';
  let errors = '';
  let announcePort;
  const port = new Promise((resolve) => {
    announcePort = resolve;
  });
  child.stdout.on('data', (data) => {
    output += data;
    const match = output.match(/play server on 127\.0\.0\.1:(\d+)\/play\/ws/);
    if (match) announcePort(Number(match[1]));
  });
  child.stderr.on('data', (data) => {
    errors += data;
  });
  const done = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return {
    port,
    done,
    output: () => output,
    errors: () => errors,
    async stop() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM');
      try {
        return await deadline(done, 2_000, 'Relay did not stop after SIGTERM');
      } catch {
        child.kill('SIGKILL');
        return await deadline(done, 3_000, 'Relay did not stop after SIGKILL');
      }
    },
  };
}

async function checkStartup(label, entry) {
  const relay = launch([entry]);
  try {
    const port = await deadline(
      Promise.race([
        relay.port,
        relay.done.then((exit) => {
          throw new Error(
            `Relay exited before listening: ${JSON.stringify(exit)} ${relay.errors()}`,
          );
        }),
      ]),
      10_000,
      `Relay never announced a port: ${relay.errors()}`,
    );
    assert.ok(port > 0, 'PLAY_PORT=0 must allocate a real port');
    const response = await fetch(`http://127.0.0.1:${port}/play/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, rooms: 0 });
    assert.equal(relay.errors(), '');
    const exit = await relay.stop();
    assert.equal(
      exit.code,
      0,
      `Relay must shut down cleanly: ${JSON.stringify(exit)}`,
    );
    console.log(`PASS ${label}: health ok; clean shutdown`);
  } finally {
    await relay.stop();
  }
}

try {
  const release = join(fixture, 'releases', '正式 构建');
  await mkdir(release, { recursive: true });
  const bundle = join(release, 'play-server.mjs');
  await copyFile(join(repo, 'dist', 'standalone', 'play-server.mjs'), bundle);
  await symlink(release, join(fixture, 'current'), 'dir');
  await symlink(bundle, join(fixture, 'play-server-link.mjs'), 'file');

  for (const [label, entry] of [
    ['real path with Chinese text and spaces', bundle],
    ['current directory symlink', join(fixture, 'current', 'play-server.mjs')],
    ['file symlink', join(fixture, 'play-server-link.mjs')],
  ]) {
    await checkStartup(label, entry);
  }

  const importer = join(fixture, 'import-only.mjs');
  const importSource = `import ${JSON.stringify(pathToFileURL(bundle).href)};\nconsole.log('import-only');\n`;
  await writeFile(importer, importSource);
  for (const [label, args, input] of [
    ['file import only', [importer]],
    ['stdin import only', ['--input-type=module', '-'], importSource],
  ]) {
    const imported = launch(args, input);
    try {
      const exit = await deadline(
        imported.done,
        5_000,
        'Importing relay started a server',
      );
      assert.equal(exit.code, 0, imported.errors());
      assert.equal(imported.output().trim(), 'import-only');
      assert.equal(imported.errors(), '');
      console.log(`PASS ${label}: no automatic server startup`);
    } finally {
      await imported.stop();
    }
  }
  console.log('Built play entrypoint: 5/5 checks passed');
} finally {
  await rm(fixture, { recursive: true, force: true });
}
