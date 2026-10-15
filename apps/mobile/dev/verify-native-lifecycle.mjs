import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = join(root, '.native-tools/lifecycle-tests'); mkdirSync(output, { recursive: true });
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const swift = join(root, 'apps/mobile/modules/lukapp-custody/ios/LifecycleRecords.swift');
run('xcrun', ['swiftc', '-module-cache-path', join(output, 'swift-cache'), swift, join(root, 'apps/mobile/dev/lifecycle-records.test.swift'), '-o', join(output, 'swift-test')]);
run(join(output, 'swift-test'), [join(output, 'swift-records')]);
const distributions = join(root, '.native-tools/gradle/wrapper/dists/gradle-9.3.1-bin');
const distribution = readdirSync(distributions).find(name => !name.startsWith('.')); if (!distribution) throw new Error('Owned Gradle required');
const libraries = join(distributions, distribution, 'gradle-9.3.1/lib');
const jdks = join(root, '.native-tools/gradle/jdks'); const installed = readdirSync(jdks).find(name => name.startsWith('eclipse_adoptium-17-')); if (!installed) throw new Error('Owned JDK required');
const bundle = readdirSync(join(jdks, installed)).find(name => name.startsWith('jdk-')); if (!bundle) throw new Error('Owned JDK bundle required');
const java = join(jdks, installed, bundle, 'Contents/Home/bin/java');
const jsonRoot = join(root, '.native-tools/gradle/caches/modules-2/files-2.1/org.json/json/20180813');
const jsonHash = readdirSync(jsonRoot).find(name => readdirSync(join(jsonRoot, name)).includes('json-20180813.jar')); if (!jsonHash) throw new Error('Installed JSON test runtime required');
const classpath = [join(libraries, 'kotlin-stdlib-2.2.21.jar'), join(jsonRoot, jsonHash, 'json-20180813.jar')].join(':');
run(java, ['-cp', libraries + '/*', 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', classpath, '-d', join(output, 'kotlin'),
  join(root, 'apps/mobile/modules/lukapp-custody/android/src/main/java/expo/modules/lukappcustody/LifecycleRecords.kt'), join(root, 'apps/mobile/dev/lifecycle-records.test.kt')]);
run(java, ['-cp', join(output, 'kotlin') + ':' + classpath, 'expo.modules.lukappcustody.Lifecycle_records_testKt', join(output, 'kotlin-records')]);
