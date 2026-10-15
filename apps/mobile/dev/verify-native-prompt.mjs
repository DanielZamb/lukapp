import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const distributions = join(root, '.native-tools/gradle/wrapper/dists/gradle-9.3.1-bin');
const distribution = readdirSync(distributions).find(name => !name.startsWith('.'));
if (!distribution) throw new Error('Owned Gradle compiler distribution required');
const libraries = join(distributions, distribution, 'gradle-9.3.1/lib');
const jdk = join(root, '.native-tools/gradle/jdks');
const installed = readdirSync(jdk).find(name => name.startsWith('eclipse_adoptium-17-'));
if (!installed) throw new Error('Owned JDK required');
const bundle = readdirSync(join(jdk, installed)).find(name => name.startsWith('jdk-'));
if (!bundle) throw new Error('Owned JDK bundle required');
const java = join(jdk, installed, bundle, 'Contents/Home/bin/java');
const destination = join(root, '.native-tools/prompt-ownership-test');
mkdirSync(destination, { recursive: true });
function run(args) {
  const result = spawnSync(java, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['-cp', libraries + '/*', 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect',
  '-classpath', join(libraries, 'kotlin-stdlib-2.2.21.jar'), '-d', destination,
  join(root, 'apps/mobile/modules/lukapp-custody/android/src/main/java/expo/modules/lukappcustody/PromptKeyOwnership.kt'),
  join(root, 'apps/mobile/dev/prompt-key-ownership.test.kt')]);
run(['-cp', destination + ':' + join(libraries, 'kotlin-stdlib-2.2.21.jar'), 'expo.modules.lukappcustody.Prompt_key_ownership_testKt']);
