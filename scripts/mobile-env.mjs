import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/mobile-env.mjs /absolute/path/to/.env.local');
const env = parseEnv(await readFile(source, 'utf8'));
const key = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!key?.startsWith('pk_test_')) throw new Error('A development Clerk publishable key is required');
const target = new URL('../apps/mobile/.env.local', import.meta.url);
await writeFile(target, `EXPO_PUBLIC_CONVEX_URL=https://compassionate-opossum-63.convex.cloud\nEXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${key}\n`, { mode: 0o600 });
process.stdout.write('Wrote only the public mobile development configuration. No owner or server credentials copied.\n');
