import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(root, option('--out', '.orchestrator/runs/2026-10-20-category-ui-crud-formal/latest'));
const graphSelection = option('--graph', 'all');
const invariantSelection = option('--invariant', null);
if (invariantSelection && !args.includes('--scratch-mutation')) throw new Error('Selecting one invariant requires --scratch-mutation');
if (!['all', 'account', 'crud'].includes(graphSelection)) throw new Error('Expected --graph all|account|crud');
if (process.env.CATEGORY_UI_MUTATION_FLAG && !args.includes('--scratch-mutation')) throw new Error('Mutation witness mode requires --scratch-mutation');
const accountEnabled = graphSelection !== 'crud';
const crudEnabled = graphSelection !== 'account';
const jar = resolve(root, option('--jar', '.orchestrator/tools/tla/v1.7.4/tla2tools.jar'));
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({ status: 'RUNNING', at: new Date().toISOString() }, null, 2));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jarSha256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
if (!existsSync(jar) || sha(readFileSync(jar)) !== jarSha256) throw new Error('Use the pinned TLA+ v1.7.4 jar documented in SKILL.md');
const run = (command, argv, extra = {}) => spawnSync(command, argv, { cwd: root, encoding: 'utf8', maxBuffer: 30_000_000, ...extra });
const git = (argv) => {
  const result = run('git', argv, { cwd: process.env.CATEGORY_UI_GIT_ROOT ?? root }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout.trim();
};
const sync = JSON.parse(readFileSync(resolve(root, 'formal/category-ui/source-sync.json'), 'utf8'));
const coverage = Object.keys(sync.sha256);
const hashes = Object.fromEntries(coverage.map(path => [path, sha(readFileSync(resolve(root, path)))]));
const snapshot = sync.sourceSnapshot;
const changed = coverage.filter(path => sync.sha256[path] !== hashes[path]);
const sourceReceipt = { at: new Date().toISOString(), rootHead: git(['rev-parse', 'HEAD']), snapshot,
  snapshotTree: git(['rev-parse', `${snapshot}^{tree}`]), sha256: hashes, syncChangedPaths: changed,
  sourceSync: changed.length === 0 ? 'MATCH' : 'REVIEW_REQUIRED', inputSourceRef: process.env.CATEGORY_UI_SOURCE_REF ?? null,
  runtimeAcceptance: 'No provider or device calls; existing sealed native receipt is separate evidence' };
writeFileSync(resolve(out, 'source.json'), JSON.stringify(sourceReceipt, null, 2));
if (changed.length && !args.includes('--scratch-mutation')) {
  writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({ status: 'SOURCE_REVIEW_REQUIRED', changedPaths: changed, source: sourceReceipt }, null, 2));
  console.error(`Source sync needs review: ${changed.join(', ')}. Follow .agents/skills/verify-category-ui/SKILL.md.`);
  process.exit(3);
}
function assertSourceUnchanged(stage) {
  const drift = coverage.filter(path => !existsSync(resolve(root, path)) || sha(readFileSync(resolve(root, path))) !== hashes[path]);
  if (drift.length) {
    writeFileSync(resolve(out, 'source-drift.json'), JSON.stringify({ stage, changedPaths: drift, status: 'SOURCE_REVIEW_REQUIRED' }, null, 2));
    writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({ status: 'SOURCE_REVIEW_REQUIRED', stage, changedPaths: drift }, null, 2));
    console.error(`Covered source changed during ${stage}; no verification acceptance. Read ${resolve(out, 'source-drift.json')}`);
    process.exit(3);
  }
}
const verifierFiles = ['formal/category-ui/check.mjs', 'formal/category-ui/challenge.mjs', 'formal/category-ui/reproduce.mjs',
  'formal/category-ui/CategoryUI.tla', 'formal/category-ui/CategoryUI.cfg', 'formal/category-ui/CategoryCRUD.tla', 'formal/category-ui/source-sync.json',
  'formal/category-ui/vitest.config.ts', 'apps/mobile/src/category-ui-formal/extract.formal.ts', 'apps/mobile/src/category-ui-formal/crud.formal.ts'];
writeFileSync(resolve(out, 'verifier-source.json'), JSON.stringify(Object.fromEntries(verifierFiles.map(path => [path, sha(readFileSync(resolve(root, path)))])), null, 2));
const versions = { node: process.version, pnpm: run('pnpm', ['--version']).stdout.trim(),
  java: run('java', ['-version']).stderr.trim(), vitest: JSON.parse(readFileSync(resolve(root, 'node_modules/vitest/package.json'), 'utf8')).version,
  react: JSON.parse(readFileSync(resolve(root, 'apps/mobile/node_modules/react/package.json'), 'utf8')).version,
  reactTestRenderer: JSON.parse(readFileSync(resolve(root, 'apps/mobile/node_modules/react-test-renderer/package.json'), 'utf8')).version,
  tlaRelease: 'v1.7.4', jarSha256 };
if (versions.vitest !== '3.2.7' || versions.react !== '19.2.3' || versions.reactTestRenderer !== '19.2.3') throw new Error('Dependency versions differ from the checked toolchain');
writeFileSync(resolve(out, 'versions.json'), JSON.stringify(versions, null, 2));
const extractionArgs = ['exec', 'vitest', 'run', '--config', 'formal/category-ui/vitest.config.ts'];
if (graphSelection !== 'all') extractionArgs.push('--testNamePattern', graphSelection === 'crud' ? 'management CRUD' : 'category/account-door');
const extraction = run('pnpm', extractionArgs,
  { env: { ...process.env, CATEGORY_UI_FORMAL_OUT: out } });
writeFileSync(resolve(out, 'extract.log'), extraction.stdout + extraction.stderr);
if (extraction.status !== 0) { console.error(`Extraction failed. Read ${resolve(out, 'extract.log')}`); process.exit(1); }
assertSourceUnchanged('extraction');
for (const name of ['CategoryUI.tla', 'CategoryUI.cfg', 'CategoryCRUD.tla']) copyFileSync(resolve(root, 'formal/category-ui', name), resolve(out, name));
const invariants = [
  ...(accountEnabled ? ['OriginalComposerPreserved', 'IndependentSetup', 'FrozenSetupRetry', 'SeparatePairConfirmation', 'NativeDismissAcknowledged'].map(name => ({ name, model: 'CategoryUI.tla' })) : []),
  ...(crudEnabled ? ['CRUDRequestIntegrity', 'CRUDDeleteConfirmation', 'CRUDFrozenEditor', 'CRUDRetryRetention', 'CRUDDismissal', 'CRUDAccountHandoff', 'DeletedSelectionRecoverable', 'CRUDFieldIntent'].map(name => ({ name, model: 'CategoryCRUD.tla' })) : []),
];
if (invariantSelection && !invariants.some(item => item.name === invariantSelection)) throw new Error('Selected invariant is not in this graph');
const results = [];
for (const { name: invariant, model } of invariants.filter(item => !invariantSelection || item.name === invariantSelection)) {
  const config = `SPECIFICATION Spec\nINVARIANTS TypeOK ${invariant}\nCHECK_DEADLOCK FALSE\n`;
  writeFileSync(resolve(out, `${invariant}.cfg`), config);
  const result = run('java', ['-XX:+UseParallelGC', '-Xmx2g', '-Dtlc2.tool.fp.FPSet.impl=tlc2.tool.fp.MemFPSet', '-cp', jar, 'tlc2.TLC', '-workers', '1',
    '-seed', '1', '-fp', '0', '-fpbits', '8', '-metadir', resolve(out, `states-${invariant}`), '-config', `${invariant}.cfg`, model], { cwd: out });
  const log = result.stdout + result.stderr;
  writeFileSync(resolve(out, `tlc-${invariant}.log`), log);
  const violated = log.includes(`Invariant ${invariant} is violated`);
  if (result.status !== 0 && !violated || /ArithmeticException|FPSet.*error|fingerprint.*error/i.test(log)) throw new Error(`TLC tool error for ${invariant}: ${log.slice(-3000)}`);
  const counts = log.match(/(\d+) states generated, (\d+) distinct states found, (\d+) states left on queue/);
  if (!violated && (!log.includes('Model checking completed. No error has been found.') || !counts || Number(counts[3]) !== 0))
    throw new Error(`Incomplete TLC success for ${invariant}`);
  results.push({ invariant, status: violated ? 'FINDING' : 'PASS', exitCode: result.status,
    tlcStatesGenerated: counts ? Number(counts[1]) : null, tlcDistinctStates: counts ? Number(counts[2]) : null });
}
assertSourceUnchanged('TLC');
if (accountEnabled) {
const graph = JSON.parse(readFileSync(resolve(out, 'graph.json'), 'utf8'));
const pairWitness = direction => graph.nodes.find(node => node.trace.at(-1) === 'PostOriginal' && node.trace.includes(direction) &&
  node.monitor.reviewed !== `${node.observation.profileId}->${node.observation.destinationId}` &&
  node.observation.commands.some(command => command.kind === 'transfer'));
writeFileSync(resolve(out, 'finding.json'), JSON.stringify({ id: 'CATEGORY-UI-001',
  property: 'The original transfer is saved only after separate confirmation of its exact From/To pair',
  harm: 'The original amount can be saved between accounts the user did not confirm',
  sourceSnapshot: snapshot, localEvidenceOnly: true, providerCalls: false,
  rootCause: 'setProfileId/setDestinationId do not invalidate transferReviewRequired',
  witnesses: { changedTo: pairWitness('ChangeTo'), changedFrom: pairWitness('ChangeFrom') } }, null, 2));
}
const summary = accountEnabled ? JSON.parse(readFileSync(resolve(out, 'extraction-summary.json'), 'utf8')) : {};
const crudSummary = crudEnabled ? JSON.parse(readFileSync(resolve(out, 'crud-summary.json'), 'utf8')) : {};
if (summary.depthFrontier || crudSummary.depthFrontier) throw new Error('Finite event policy reached the depth frontier; review bounds before accepting');
const receipt = { at: new Date().toISOString(), status: results.some(r => r.status === 'FINDING') ? 'FINDINGS' : 'PASS_BOUNDED',
  ...summary, proofScope: args.includes('--scratch-mutation') ? 'MUTATION_WITNESS_ONLY' : 'COMPLETE_BOUNDED', invariantSelection, graphs: { account: accountEnabled ? summary : null, crud: crudEnabled ? crudSummary : null }, graphSelection, results, sourceSync: sourceReceipt.sourceSync, runtimeAcceptance: sourceReceipt.runtimeAcceptance,
  bounds: { seeds: '2 signed amounts x 2 account answers x 3 event lanes', maxCallbackEventsAfterPreparedCategory: 28,
    maxAccountDoorEntries: 2, maxSetupAttempts: 2, maxLostReplies: 1, maxSwaps: 1, maxPairConfirmations: 2,
    maxFromOrToChangesAfterConfirmation: 1, originalTransfers: 'stop at first save boundary',
    symbols: 'daily, existing, other, created; COP 1000 original minor units; zero opening balance',
    crud: { preparedSeeds: 12, maxCallbackEvents: 24, categoryWriteAttempts: 2, failures: 1, cancellationAndReentry: 1, keepDeleteChoice: 1, appearance: 'one rendered emoji and h30 swatch from initial h270', retainedSelection: 'original; one external fresh identity with same name; one explicit deselection' } } };
writeFileSync(resolve(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.status === 'FINDINGS' ? 2 : 0);
