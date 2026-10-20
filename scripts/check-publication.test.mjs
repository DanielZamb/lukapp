import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./check-publication.mjs', import.meta.url));
function repository(t, files) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lukapp-publication-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd });
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(cwd, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  execFileSync('git', ['add', '--force', '.'], { cwd });
  return cwd;
}
function check(cwd, ...args) {
  return spawnSync(process.execPath, [checker, ...args], { cwd, encoding: 'utf8' });
}

test('allows AGENTS, ignore rules, and source environment references', t => {
  const cwd = repository(t, {
    'AGENTS.md': 'Use real providers.\n',
    '.gitignore': '.env*\n',
    'src/config.js': 'export const url = process.env.CONVEX_URL;\n',
  });
  assert.equal(check(cwd, '--staged').status, 0);
  execFileSync('git', ['-c', 'user.name=Publication test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd });
  assert.equal(check(cwd, '--ref', 'HEAD').status, 0);
});

test('rejects excluded files even when they have been force-added', t => {
  const files = [
    '.orchestrator/state.json', 'src/.cache/state.json', 'docs/notes.md',
    'src/docs/notes.md', 'exports/data.csv', 'scratch/notes.txt', '.env',
    'src/.env.example', 'local.env', 'signing/debug.keystore', 'private.pem',
    'CONTEXT.md', 'src/CONTEXT-MAP.md', 'MIGRATION.md', 'error.log',
    'skills-lock.json', 'node_modules/package/index.js', 'release.apk',
    'sen-6-mobile-workflow-prototype/app/index.tsx',
  ];
  const cwd = repository(t, Object.fromEntries(files.map(name => [name, 'fixture\n'])));
  const result = check(cwd, '--staged');
  assert.equal(result.status, 1);
  for (const file of files) assert.ok(result.stderr.includes(file), file);
});

test('rejects secret-bearing source without displaying the matched value', t => {
  const credential = 'sk_' + 'test_' + 'Z'.repeat(32);
  const cwd = repository(t, { 'src/config.js': `export const value = '${credential}';\n` });
  const result = check(cwd, '--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clerk-secret: src\/config.js/);
  assert.ok(!result.stderr.includes(credential));
});

test('prototype scope permits only the standalone folder', t => {
  const cwd = repository(t, { 'sen-6-mobile-workflow-prototype/app/index.tsx': 'export default function App() {}\n' });
  assert.equal(check(cwd, '--staged', '--prototype').status, 0);
  writeFileSync(path.join(cwd, 'package.json'), '{}\n');
  execFileSync('git', ['add', 'package.json'], { cwd });
  const result = check(cwd, '--staged', '--prototype');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside-prototype-folder: package.json/);
});
