import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { once } from 'node:events';

const cli = resolve('dist/cli.js');
mkdirSync('tmp', { recursive: true });

function fixture(t, files) {
  const root = mkdtempSync(resolve('tmp/e2e-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(...args) {
  return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('CLI explains a real nested repository and redacts export content by default', t => {
  const root = fixture(t, { 'AGENTS.md': 'Root guidance', 'src/AGENTS.override.md': 'Nested guidance', 'src/AGENTS.md': 'Shadowed guidance', 'src/auth.ts': 'export {}' });
  const report = JSON.parse(run('inspect', root, '--file', 'src/auth.ts', '--cwd', 'src', '--format', 'json'));
  assert.deepEqual(report.rules.filter(r => r.status === 'included').map(r => r.path), ['AGENTS.md', 'src/AGENTS.override.md']);
  assert.ok(report.rules.every(r => !r.content));
  assert.equal(report.rules.find(r => r.path === 'src/AGENTS.md').status, 'excluded');
  const full = JSON.parse(run('inspect', root, '--file', 'src/auth.ts', '--format', 'json', '--include-content'));
  assert.equal(full.rules.find(r => r.path === 'AGENTS.md').content, 'Root guidance');
});

test('CLI formats, compares profiles and emits a portable HTML report', t => {
  const root = fixture(t, { 'AGENTS.md': 'Use tests', 'CLAUDE.md': 'Check @docs/style.md', 'docs/style.md': 'Use explicit names', 'src/a.ts': '' });
  assert.match(run('inspect', root, '--file', 'src/a.ts'), /AGENTS.md/);
  assert.match(run('explain', root, '--file', 'src/a.ts', '--format', 'markdown'), /Expected/);
  const comparison = JSON.parse(run('compare', root, '--file', 'src/a.ts', '--profiles', 'codex,claude', '--format', 'json'));
  assert.equal(comparison.reports.length, 2);
  assert.match(run('compare', root, '--file', 'src/a.ts'), /Claude/);
  const output = join(root, 'report.html');
  run('inspect', root, '--file', 'src/a.ts', '--format', 'html', '--output', output);
  assert.match(readFileSync(output, 'utf8'), /<!doctype html>/i);
  assert.ok(!readFileSync(output, 'utf8').includes('Use tests'));
  assert.match(run('profiles'), /2026-10-17/);
  assert.match(run('--help'), /inspect/);
  assert.match(run('--version'), /0.1.0/);
});

test('CLI rejects invalid options, escapes and missing roots', t => {
  const root = fixture(t, { 'AGENTS.md': 'Hello', 'a.ts': '' });
  for (const args of [
    ['inspect', root], ['inspect', root, '--file', '../outside'],
    ['inspect', root, '--file', 'a.ts', '--profile', 'unknown'],
    ['inspect', root, '--file', 'a.ts', '--format', 'xml'],
    ['inspect', root, '--file', 'a.ts', '--wat'],
    ['inspect', root, '--file', 'a.ts', '--max-bytes', '-1'],
    ['compare', root, '--file', 'a.ts', '--profiles', 'codex'],
    ['wat'], ['inspect', join(root, 'absent'), '--file', 'a.ts'],
  ]) assert.throws(() => run(...args));
});

test('scanner honors gitignore and refuses symlinked instruction content', t => {
  const root = fixture(t, { 'AGENTS.md': 'Safe', '.gitignore': 'ignored/\n', 'ignored/AGENTS.md': 'private', 'a.ts': '' });
  execFileSync('git', ['init', '-q', root]);
  symlinkSync(join(root, 'AGENTS.md'), join(root, 'CLAUDE.md'));
  const result = JSON.parse(run('inspect', root, '--file', 'a.ts', '--format', 'json'));
  assert.ok(!result.rules.some(r => r.path.startsWith('ignored/')));
  assert.ok(result.diagnostics.some(d => /symlink/i.test(d.message)));
});

test('local viewer serves a token-protected snapshot and rejects hostile requests', async t => {
  const root = fixture(t, { 'AGENTS.md': '<script>bad()</script>', 'src/a.ts': '' });
  const child = spawn(process.execPath, [cli, 'inspect', root, '--file', 'src/a.ts', '--web', '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let output = '';
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No server URL: ${output}`)), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+/);
      if (match) { clearTimeout(timeout); resolveUrl(new URL(match[0])); }
    });
    child.on('error', reject);
  });
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(new URL('/api/snapshot', url))).status, 403);
  const snapshotUrl = new URL(`/api/snapshot${url.search}`, url);
  const snapshot = await (await fetch(snapshotUrl)).json();
  assert.equal(snapshot.file, 'src/a.ts');
  assert.equal(snapshot.files.find(f => f.path === 'AGENTS.md').content, '<script>bad()</script>');
  assert.equal((await fetch(snapshotUrl, { method: 'POST' })).status, 405);
  assert.equal((await fetch(snapshotUrl, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(new URL('/missing.js', url))).status, 404);
  assert.equal((await fetch(new URL('/%2e%2e%2fpackage.json', url))).status, 403);
  const stopped = once(child, 'exit');
  child.kill();
  await stopped;
});
