import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const prototype = args.includes('--prototype');
const credentialsOnly = args.includes('--credentials-only');
const refIndex = args.indexOf('--ref');
const ref = refIndex < 0 ? 'HEAD' : args[refIndex + 1];
if (!staged && !ref) throw new Error('--ref needs a revision');
const git = (...argv) => execFileSync('git', argv, { maxBuffer: 64 * 1024 * 1024 });
const listing = git(...(staged ? ['ls-files', '-z'] : ['ls-tree', '-r', '--name-only', '-z', ref]));
const files = listing.toString('utf8').split('\0').filter(Boolean);
const problems = [];
const prototypeFolder = 'sen-6-mobile-workflow-prototype';
const secretFile = /(^|\/)(?:\.env[^/]*|[^/]+\.env(?:\.[^/]*)?|\.envrc|google-services\.json|GoogleService-Info\.plist|(?:credentials|service[-_]?account)(?:[._-][^/]*)?\.(?:json|ya?ml))$|\.(?:pem|key|p12|p8|jks|keystore|pfx|mobileprovision)$/i;
const forbiddenFolders = new Set(['docs', 'exports', 'scratch', 'node_modules', 'coverage', 'reports']);
const secrets = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['clerk-secret', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['webhook-secret', /\bwhsec_[A-Za-z0-9+/=]{16,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['google-client-secret', /\bGOCSPX-[A-Za-z0-9_-]{16,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['openai-secret', /\bsk-(?:proj-|svcacct-)[A-Za-z0-9_-]{20,}/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['cursor-secret', /\bcrsr_[a-f0-9]{20,}/],
];
for (const file of files) {
  const parts = file.split('/');
  const name = path.posix.basename(file);
  if (secretFile.test(file)) problems.push({ file, rule: 'credential-file' });
  if (!credentialsOnly) {
    if (parts.slice(0, -1).some(p => p.startsWith('.') || forbiddenFolders.has(p.toLowerCase())))
      problems.push({ file, rule: 'excluded-directory' });
    if (/^(?:CONTEXT|MIGRATION)(?:[.-]|$)/i.test(name) || name === 'skills-lock.json' || /\.log$/i.test(name) || name === '.DS_Store')
      problems.push({ file, rule: 'excluded-local-file' });
    if (!prototype && parts[0] === prototypeFolder) problems.push({ file, rule: 'prototype-on-product-branch' });
    if (prototype && parts[0] !== prototypeFolder) problems.push({ file, rule: 'outside-prototype-folder' });
    if (/\.(?:apk|aab|ipa)$/i.test(name)) problems.push({ file, rule: 'built-artifact' });
  }
  const blob = git('show', staged ? `:${file}` : `${ref}:${file}`);
  if (blob.includes(0)) continue;
  const text = blob.toString('utf8');
  for (const [rule, pattern] of secrets) if (pattern.test(text)) problems.push({ file, rule });
}
if (problems.length) {
  for (const { file, rule } of problems) process.stderr.write(`${rule}: ${file}\n`);
  process.stderr.write(`Publication check failed: ${problems.length} finding(s). Matched values are never displayed.\n`);
  process.exitCode = 1;
} else process.stdout.write(`Publication check passed: ${files.length} tracked files, ${prototype ? 'prototype-only' : credentialsOnly ? 'credential' : 'product'} scope.\n`);
