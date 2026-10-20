import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sync = JSON.parse(readFileSync(resolve(root, 'formal/category-ui/source-sync.json'), 'utf8'));
const snapshot = sync.sourceSnapshot;
const args = process.argv.slice(2);
const out = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : '.orchestrator/runs/2026-10-20-category-ui-crud-formal/snapshot-reproduction');
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'category-ui-snapshot-'));
let exit = 1;
try {
  const archive = spawnSync('git', ['archive', '--format=tar', snapshot], { cwd: root, maxBuffer: 100_000_000 });
  if (archive.status !== 0) throw new Error('Cannot read the pinned snapshot commit');
  const unpack = spawnSync('tar', ['-xf', '-', '-C', scratch], { input: archive.stdout });
  if (unpack.status !== 0) throw new Error('Cannot unpack the pinned snapshot');
  const listing = spawnSync('git', ['ls-tree', '-r', '-z', snapshot], { cwd: root, encoding: 'utf8' });
  if (listing.status !== 0) throw new Error('Cannot enumerate snapshot source');
  const hashes = {};
  for (const entry of listing.stdout.split('\0').filter(Boolean)) {
    const [metadata, path] = entry.split('\t'); const expected = metadata.split(' ')[2];
    const bytes = readFileSync(resolve(scratch, path));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob !== expected) throw new Error(`Snapshot archive mismatch: ${path}`);
    hashes[path] = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(resolve(out, 'source-archive.json'), JSON.stringify({ snapshot, tree: sync.tree,
    files: Object.keys(hashes).length, allGitBlobsMatched: true, sha256: hashes }, null, 2));
  cpSync(resolve(root, 'formal/category-ui'), resolve(scratch, 'formal/category-ui'), { recursive: true });
  cpSync(resolve(root, 'apps/mobile/src/category-ui-formal'), resolve(scratch, 'apps/mobile/src/category-ui-formal'), { recursive: true });
  symlinkSync(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), 'dir');
  symlinkSync(resolve(root, 'apps/mobile/node_modules'), resolve(scratch, 'apps/mobile/node_modules'), 'dir');
  const tools = resolve(scratch, '.orchestrator/tools/tla/v1.7.4');
  mkdirSync(tools, { recursive: true });
  symlinkSync(resolve(root, '.orchestrator/tools/tla/v1.7.4/tla2tools.jar'), resolve(tools, 'tla2tools.jar'));
  const invoke = (script, directory) => {
    const result = spawnSync(process.execPath, [resolve(scratch, 'formal/category-ui', script), '--out', resolve(out, directory)],
      { cwd: scratch, encoding: 'utf8', maxBuffer: 30_000_000, env: { ...process.env, CATEGORY_UI_GIT_ROOT: root, CATEGORY_UI_SOURCE_REF: snapshot } });
    writeFileSync(resolve(out, `${directory}-command.log`), result.stdout + result.stderr);
    return result.status;
  };
  const baseline = invoke('check.mjs', 'baseline');
  if (baseline !== 2) throw new Error(`Pinned baseline changed or failed: exit ${baseline}`);
  if (args.includes('--prove-checks')) {
    if (invoke('challenge.mjs', 'challenges') !== 0) throw new Error('Pinned-source mutation challenge failed');
  }
  const restored = invoke('check.mjs', 'restored');
  if (restored !== baseline) throw new Error('Restored snapshot result differs from baseline');
  const before = JSON.parse(readFileSync(resolve(out, 'baseline/receipt.json'), 'utf8'));
  const after = JSON.parse(readFileSync(resolve(out, 'restored/receipt.json'), 'utf8'));
  const outcome = receipt => ({ graphs: receipt.graphs,
    results: receipt.results.map(result => [result.invariant, result.status]) });
  if (JSON.stringify(outcome(before)) !== JSON.stringify(outcome(after))) throw new Error('Restored invariant results/graph differ from baseline');
  writeFileSync(resolve(out, 'reproduction.json'), JSON.stringify({ snapshot, baselineExit: baseline, restoredExit: restored,
    challengeRun: args.includes('--prove-checks'), sharedProductWritten: false, scratchDropped: true }, null, 2));
  console.log(`Pinned snapshot reproduced; baseline/restored exit ${restored}. Read ${out}`);
  exit = restored;
} finally { rmSync(scratch, { recursive: true, force: true }); }
process.exit(exit);
