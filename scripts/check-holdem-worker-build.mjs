import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const buildOrigin = 'https://worker-build-check.invalid';
const digest = (source) => createHash('sha256').update(source).digest('hex');

/** Read bindings from the emitted JS; never evaluate the application bundle. */
function workerUrls(chunkPath) {
  const program = ts.createProgram([chunkPath], {
    allowJs: true,
    noResolve: true,
    noLib: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  });
  const source = program.getSourceFile(chunkPath);
  assert(source, `Cannot read emitted chunk: ${chunkPath}`);
  const checker = program.getTypeChecker();
  function staticString(expression, depth = 0) {
    assert(expression && depth < 12, 'Worker URL binding is missing or cyclic');
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isParenthesizedExpression(expression))
      return staticString(expression.expression, depth + 1);
    if (ts.isIdentifier(expression)) {
      const binding = checker
        .getSymbolAtLocation(expression)
        ?.declarations?.find((declaration) =>
          ts.isVariableDeclaration(declaration),
        );
      assert(
        binding?.initializer,
        `Worker URL is not a static binding: ${expression.text}`,
      );
      return staticString(binding.initializer, depth + 1);
    }
    if (
      ts.isNewExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'URL'
    ) {
      const [relative, base] = expression.arguments ?? [];
      return new URL(
        staticString(relative, depth + 1),
        base ? staticString(base, depth + 1) : buildOrigin,
      ).href;
    }
    throw new Error(
      `Worker URL cannot be checked statically: ${expression.getText(source)}`,
    );
  }
  const urls = [];
  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Worker'
    )
      urls.push(staticString(node.arguments?.[0]));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(
    urls.length,
    1,
    'Expected exactly one strategy Worker in the holdem-lab chunk',
  );
  return urls;
}

export function checkHoldemWorkerBuild(distDirectory) {
  const clientDirectory = join(distDirectory, 'client');
  const standaloneClient = join(distDirectory, 'standalone', 'dist', 'client');
  const chunks = readdirSync(
    join(clientDirectory, '_next', 'static', 'chunks'),
  ).filter((name) => /^holdem-lab-[\w-]+\.js$/.test(name));
  assert.equal(
    chunks.length,
    1,
    'Expected one fresh production holdem-lab chunk',
  );
  const name = chunks[0];
  const chunkPath = join(clientDirectory, '_next', 'static', 'chunks', name);
  const standaloneChunk = join(
    standaloneClient,
    '_next',
    'static',
    'chunks',
    name,
  );
  assert.equal(
    digest(readFileSync(chunkPath)),
    digest(readFileSync(standaloneChunk)),
    'Standalone holdem-lab chunk differs from the client build',
  );
  for (const value of workerUrls(chunkPath)) {
    const url = new URL(value, buildOrigin);
    assert.equal(
      url.protocol,
      'https:',
      `Worker URL uses an invalid protocol: ${url.href}`,
    );
    assert.equal(
      url.origin,
      buildOrigin,
      `Worker must resolve to this site's public assets: ${url.href}`,
    );
    assert.match(
      url.pathname,
      /^\/_next\/static\/(?:[\w-]+\/)*holdem-worker-[\w-]+\.js$/,
      `Worker URL points outside the compiled strategy assets: ${url.href}`,
    );
    assert(
      !url.search && !url.hash,
      'Worker asset URL must not include a query or fragment',
    );
    const relative = url.pathname.slice(1);
    const worker = readFileSync(join(clientDirectory, relative));
    assert(worker.length > 0, 'Compiled strategy Worker is empty');
    assert.equal(
      digest(worker),
      digest(readFileSync(join(standaloneClient, relative))),
      'Standalone strategy Worker differs from the client build',
    );
    console.log(
      `✓ Strategy Worker: ${url.pathname} (${worker.length} bytes), standalone copy matches`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    checkHoldemWorkerBuild(
      process.argv[2]
        ? resolve(process.argv[2])
        : fileURLToPath(new URL('../dist', import.meta.url)),
    );
  } catch (error) {
    console.error(
      `Worker build check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
