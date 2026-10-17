const {
  withMainActivity,
  withAndroidManifest,
} = require("expo/config-plugins");

module.exports = function withEntryPrivacy(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error("Missing Android application");
    application.$["android:allowBackup"] = "false";
    return mod;
  });
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kt")
      throw new Error("Entry privacy requires the generated Kotlin activity");
    let source = mod.modResults.contents;
    if (source.includes("// lukapp-entry-privacy")) return mod;
    const creation = "override fun onCreate(savedInstanceState: Bundle?) {";
    if (!source.includes(creation) || source.includes("override fun onPause()"))
      throw new Error(
        "Unexpected MainActivity lifecycle; review privacy integration",
      );
    source = source.replace(
      creation,
      `${creation}\n    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)`,
    );
    const end = source.lastIndexOf("}");
    source =
      source.slice(0, end) +
      `
  // lukapp-entry-privacy: protect snapshots before the JS lifecycle event.
  override fun onPause() {
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    super.onPause()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    if (!hasFocus) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    super.onWindowFocusChanged(hasFocus)
  }
` +
      source.slice(end);
    mod.modResults.contents = source;
    return mod;
  });
};
