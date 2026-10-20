import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const out = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : '.orchestrator/runs/2026-10-20-category-ui-crud-formal/challenges');
mkdirSync(out, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const editor = 'apps/mobile/src/features/posting/usePostingEditor.ts';
const route = 'apps/mobile/app/post.tsx';
const manager = 'apps/mobile/src/features/categories/CategoryManager.tsx';
const picker = 'apps/mobile/src/features/categories/useCategoryPicker.ts';
const originals = Object.fromEntries([editor, route, manager, picker, 'apps/mobile/src/features/categories/CategorySheet.tsx', 'apps/mobile/src/features/posting/AccountSetupForm.tsx'].map(path => [path, sha(readFileSync(resolve(root, path)))]));
const exact = (text, from, to) => {
  if (text.split(from).length !== 2) throw new Error(`Mutation anchor not unique: ${from}`);
  return text.replace(from, to);
};
const mutations = [
  { name: 'crud-native-presentation-not-requested', graph: 'crud', file: manager, invariant: 'CRUDDismissal', flag: 'dismiss',
    mutate: text => exact(text, 'if (open) sheet.current?.present();', 'if (open) {}') },
  { name: 'crud-save-control-disconnected', graph: 'crud', file: manager, invariant: 'CRUDRequestIntegrity', flag: 'request',
    mutate: text => exact(text, 'onConfirm={() => void save()}', 'onConfirm={() => {}}') },
  { name: 'crud-delete-arm-disconnected', graph: 'crud', file: manager, invariant: 'CRUDDeleteConfirmation', flag: 'deletion',
    mutate: text => exact(text, 'if (confirmingDelete) void save(true); else setConfirmingDelete(true);', 'if (confirmingDelete) void save(true); else {}') },
  { name: 'crud-delete-confirm-disconnected', graph: 'crud', file: manager, invariant: 'CRUDRequestIntegrity', flag: 'request',
    mutate: text => exact(text, 'if (confirmingDelete) void save(true); else setConfirmingDelete(true);', 'if (confirmingDelete) {} else setConfirmingDelete(true);') },
  { name: 'crud-keep-control-disconnected', graph: 'crud', file: manager, invariant: 'CRUDDeleteConfirmation', flag: 'deletion',
    mutate: text => exact(text, 'onCancelDelete={() => { interact(); setConfirmingDelete(false); }}', 'onCancelDelete={() => {}}') },
  { name: 'crud-native-dismiss-not-requested', graph: 'crud', file: manager, invariant: 'CRUDAccountHandoff', flag: 'handoff',
    mutate: text => exact(text, 'else if (presented.current) sheet.current?.dismiss();', 'else if (presented.current) {}') },
  { name: 'crud-color-control-corrupted', graph: 'crud', file: 'apps/mobile/src/features/categories/CategorySheet.tsx', invariant: 'CRUDFieldIntent', flag: 'input',
    mutate: text => exact(text, 'props.onStyle({ ...editor.style, color: entry.id })', 'props.onStyle({ ...editor.style, color: "h270" })') },
  { name: 'crud-wrong-api-module', graph: 'crud', file: manager, invariant: 'CRUDRequestIntegrity', flag: 'request',
    mutate: text => 'import { makeFunctionReference } from "convex/server";\n' + exact(text, 'useAction(api.accounting.updateUserCategory)', 'useAction(makeFunctionReference<"action">("incorrectAccounting:updateUserCategory"))') },
  { name: 'crud-update-wrong-identity', graph: 'crud', file: manager, invariant: 'CRUDRequestIntegrity', flag: 'request',
    mutate: text => exact(text, 'await update({ workspaceId, categoryId: editor.category.id, name: editor.name.trim(), style: editor.style });', 'await update({ workspaceId, categoryId: "foreign", name: editor.name.trim(), style: editor.style });') },
  { name: 'crud-delete-without-confirmation', graph: 'crud', file: manager, invariant: 'CRUDDeleteConfirmation', flag: 'deletion',
    mutate: text => exact(text, 'if (confirmingDelete) void save(true); else setConfirmingDelete(true);', 'void save(true);') },
  { name: 'crud-pending-name-unlocked', graph: 'crud', file: manager, invariant: 'CRUDFrozenEditor', flag: 'frozen',
    mutate: text => exact(text, 'onName={(name) => { if (!saving.current)', 'onName={(name) => { if (true)') },
  { name: 'crud-failure-drops-editor', graph: 'crud', file: manager, invariant: 'CRUDRetryRetention', flag: 'retry',
    mutate: text => exact(text, 'if (!reportFailure(failure)) setError(failureMessage(failure));', 'setEditor(null); if (!reportFailure(failure)) setError(failureMessage(failure));') },
  { name: 'crud-dismiss-keeps-editor', graph: 'crud', file: manager, invariant: 'CRUDDismissal', flag: 'dismiss',
    mutate: text => exact(text, 'presented.current = false; setEditor(null); setConfirmingDelete(false); setError("");', 'presented.current = false; setConfirmingDelete(false); setError("");') },
  { name: 'crud-account-handoff-before-dismiss', graph: 'crud', file: manager, invariant: 'CRUDAccountHandoff', flag: 'handoff',
    mutate: text => exact(text, 'queuedAccount.current = { name: editor.name.trim(), style: editor.style, answer };', 'setAccountRequest({ name: editor.name.trim(), style: editor.style, answer });') },
  { name: 'crud-deleted-selection-hidden', graph: 'crud', file: picker, invariant: 'DeletedSelectionRecoverable', flag: 'recovery',
    mutate: text => exact(text, 'mode.value.ids.filter((id) => !categories.some', 'mode.value.ids.filter((id) => false && !categories.some') },
  { name: 'crud-renamed-answer-retained', graph: 'crud', file: manager, invariant: 'CRUDFieldIntent', flag: 'input',
    mutate: text => exact(text, '...(current.kind === "custom" ? { answer: null } : {})', '...(current.kind === "custom" ? {} : {})') },
  { name: 'setup-type-control-disconnected', file: 'apps/mobile/src/features/posting/AccountSetupForm.tsx', invariant: 'IndependentSetup', flag: 'independent',
    mutate: text => exact(text, '                    onPress={() => props.onChange({ ...value, productKind })}', '                    onPress={() => {}}') },
  { name: 'native-cancel-keeps-setup', file: route, invariant: 'NativeDismissAcknowledged', flag: 'native',
    mutate: text => exact(text, '          setupPresented.current = false;\n          editor.setSetup(null);', '          setupPresented.current = false;') },
  { name: 'rendered-category-add-disconnected', file: 'apps/mobile/src/features/categories/CategorySheet.tsx', invariant: 'IndependentSetup', flag: 'independent',
    mutate: text => exact(text, '        onPress={props.onConfirm}', '        onPress={() => {}}') },
  { name: 'composer-overwritten', file: editor, invariant: 'OriginalComposerPreserved', flag: 'composer',
    mutate: text => exact(text, '      setCategories({ ids: [], primaryId: null });\n      setEntryType("transfer");\n      setDestinationId(null);',
      '      setAmount("0");\n      setCategories({ ids: [], primaryId: null });\n      setEntryType("transfer");\n      setDestinationId(null);') },
  { name: 'setup-inherits-transaction-amount', file: editor, invariant: 'IndependentSetup', flag: 'independent',
    mutate: text => exact(text, '        productKind: request.answer === "payDebt" ? null : "bankAccount",\n        amount: "0",',
      '        productKind: request.answer === "payDebt" ? null : "bankAccount",\n        amount,') },
  { name: 'pending-edits-unlocked', file: editor, invariant: 'FrozenSetupRetry', flag: 'frozen',
    mutate: text => exact(text, '    !submitting.current &&\n    !pending &&\n    !loading &&', '    !submitting.current &&\n    !loading &&') },
  { name: 'swap-silently-confirms', file: editor, invariant: 'SeparatePairConfirmation', flag: 'review',
    mutate: text => exact(text, '        setProfileId(destinationId);\n        setDestinationId(profileId);\n        setTransferReviewRequired(true);',
      '        setProfileId(destinationId);\n        setDestinationId(profileId);\n        setTransferReviewRequired(false);'),
    witness: node => node.trace.includes('Swap') && !node.trace.includes('ChangeTo') && !node.trace.includes('ChangeFrom') },
  { name: 'native-dismiss-not-acknowledged', file: route, invariant: 'NativeDismissAcknowledged', flag: 'native',
    mutate: text => exact(text, '          setupPresented.current = false;\n          editor.setSetup(null);', '          editor.setSetup(null);') },
];
const results = [];
for (const mutation of mutations) {
  const scratch = mkdtempSync(join(tmpdir(), 'category-ui-formal-'));
  try {
    for (const path of ['apps/mobile/src', 'apps/mobile/app', 'src', 'convex/_generated', 'formal/category-ui']) {
      mkdirSync(dirname(resolve(scratch, path)), { recursive: true });
      cpSync(resolve(root, path), resolve(scratch, path), { recursive: true });
    }
    for (const path of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'apps/mobile/package.json', 'apps/mobile/vitest.setup.ts'])
      if (existsSync(resolve(root, path))) cpSync(resolve(root, path), resolve(scratch, path));
    symlinkSync(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), 'dir');
    symlinkSync(resolve(root, 'apps/mobile/node_modules'), resolve(scratch, 'apps/mobile/node_modules'), 'dir');
    const file = resolve(scratch, mutation.file);
    const before = readFileSync(file, 'utf8'); const after = mutation.mutate(before);
    writeFileSync(file, after);
    const mutationOut = resolve(out, mutation.name);
    const run = spawnSync(process.execPath, [resolve(scratch, 'formal/category-ui/check.mjs'), '--out', mutationOut,
      '--graph', mutation.graph ?? 'account', '--invariant', mutation.invariant, '--jar', resolve(root, '.orchestrator/tools/tla/v1.7.4/tla2tools.jar'), '--scratch-mutation'],
      { cwd: scratch, encoding: 'utf8', maxBuffer: 20_000_000, env: { ...process.env, CATEGORY_UI_GIT_ROOT: process.env.CATEGORY_UI_GIT_ROOT ?? root,
        CATEGORY_UI_MUTATION_FLAG: mutation.flag, CATEGORY_UI_MUTATION_NAME: mutation.name } });
    mkdirSync(mutationOut, { recursive: true });
    writeFileSync(resolve(mutationOut, 'command.log'), run.stdout + run.stderr);
    if (run.status !== 2) throw new Error(`Mutation ${mutation.name} did not finish as a TLC finding; exit ${run.status}`);
    const receipt = JSON.parse(readFileSync(resolve(mutationOut, 'receipt.json'), 'utf8'));
    const graph = JSON.parse(readFileSync(resolve(mutationOut, mutation.graph === 'crud' ? 'crud-graph.json' : 'graph.json'), 'utf8'));
    const witness = graph.nodes.find(node => !node.monitor[mutation.flag] && (!mutation.witness || mutation.witness(node)));
    if (!receipt.results.some(result => result.invariant === mutation.invariant && result.status === 'FINDING') || !witness)
      throw new Error(`Mutation ${mutation.name} was not killed by its intended invariant`);
    writeFileSync(resolve(mutationOut, 'product-mutation.json'), JSON.stringify({ path: mutation.file, beforeSha256: sha(before), afterSha256: sha(after),
      before, after, scratchOnly: true, sharedProductModified: false, witness }, null, 2));
    results.push({ name: mutation.name, invariant: mutation.invariant, detected: true, witness: witness.trace, scratchDropped: true });
    console.log(`CAUGHT ${mutation.name}: ${mutation.invariant}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
for (const [path, expected] of Object.entries(originals))
  if (sha(readFileSync(resolve(root, path))) !== expected) throw new Error(`Shared product changed: ${path}`);
writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({ status: 'ALL_REAL_PRODUCT_MUTATIONS_CAUGHT', results, sharedProductHashesUnchanged: originals }, null, 2));
