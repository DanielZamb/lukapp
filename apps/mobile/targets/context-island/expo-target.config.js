/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "ContextIslandWidget",
  displayName: "Lukapp context",
  deploymentTarget: "18.0",
  bundleIdentifier: ".LiveActivity",
  frameworks: ["ActivityKit", "WidgetKit", "SwiftUI"],
  entitlements: {},
};
