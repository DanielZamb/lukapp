const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withNotificationIntake(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error("Missing Android application");
    application.$["android:allowBackup"] = "false";
    application.$["android:fullBackupContent"] = "@xml/intake_backup_rules";
    application.$["android:dataExtractionRules"] = "@xml/intake_data_extraction_rules";
    manifest.queries ??= [];
    let queries = manifest.queries[0];
    if (!queries) { queries = {}; manifest.queries.push(queries); }
    queries.intent ??= [];
    if (!queries.intent.some((intent) => intent.action?.some((action) => action.$?.["android:name"] === "android.intent.action.MAIN") && intent.category?.some((category) => category.$?.["android:name"] === "android.intent.category.LAUNCHER"))) {
      queries.intent.push({ action: [{ $: { "android:name": "android.intent.action.MAIN" } }], category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }] });
    }
    return mod;
  });
  return withDangerousMod(config, ["android", async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
    await fs.mkdir(directory, { recursive: true });
    const exclusions = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"]
      .map((domain) => `    <exclude domain="${domain}" path="." />`).join("\n");
    await fs.writeFile(path.join(directory, "intake_backup_rules.xml"), `<full-backup-content>\n${exclusions}\n</full-backup-content>\n`);
    await fs.writeFile(path.join(directory, "intake_data_extraction_rules.xml"), `<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`);
    return mod;
  }]);
};
