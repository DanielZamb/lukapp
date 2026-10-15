import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const [iosManifest, androidManifest, receipts] = process.argv.slice(2);
if (!iosManifest || !androidManifest || !receipts) throw new Error("Explicit coordinator manifests and own F03 receipt directory required");
const allowedDirectory = "/Users/zambamon/Work/finance-tracker-v2/.orchestrator/runs/2026-10-13-core/orchestrate/lukapp/receipts/F03";
if (resolve(receipts) !== allowedDirectory) throw new Error("Only own F03 receipts may be written");
const manifests = { ios: resolve(iosManifest), android: resolve(androidManifest) };
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  try {
    const [platform, action, extra] = (request.url ?? "").slice(1).split("/");
    if ((platform !== "ios" && platform !== "android") || extra) throw new Error("route_denied");
    const text = await readFile(manifests[platform], "utf8");
    if (text.length > 1_000_000) throw new Error("manifest_too_large");
    const manifest = JSON.parse(text);
    if (manifest.contract !== "lukapp-live-public-scenario@1" || manifest.platform !== platform || !/^[a-zA-Z0-9_-]{1,100}$/.test(manifest.scenarioId)) throw new Error("manifest_identity_invalid");
    if (action === "manifest" && request.method === "GET") { response.end(text); return; }
    if (action !== "receipt" || request.method !== "POST") throw new Error("method_denied");
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 2_000_000) throw new Error("receipt_too_large"); chunks.push(chunk); }
    const receipt = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (receipt.contract !== manifest.contract || receipt.platform !== platform || receipt.scenarioId !== manifest.scenarioId ||
      receipt.deploymentIndependentlyVerifiedByDriver !== false || receipt.appBuildIndependentlyVerifiedByDriver !== false || JSON.stringify(receipt.coordinatorAssertion) !== JSON.stringify(manifest.coordinatorAssertion)) throw new Error("receipt_identity_invalid");
    const destination = resolve(receipts, platform + "-live-scenario-" + manifest.scenarioId + "-" + Date.now() + ".json");
    if (dirname(destination) !== allowedDirectory) throw new Error("receipt_path_denied");
    await writeFile(destination, JSON.stringify({ evidence: "app-reported-public-runtime-result-requires-independent-source-and-deployment-binding", receipt }, null, 2) + "\n", { flag: "wx" });
    response.end(JSON.stringify({ saved: true }));
  } catch { response.writeHead(400); response.end(JSON.stringify({ errorCode: "scenario_transport_rejected" })); }
});
server.listen(8114, "127.0.0.1", () => process.stdout.write("F03 approved-manifest receipt transport listening on loopback8114; no provider proxy or backend handlers\n"));
