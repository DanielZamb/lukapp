import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = process.env.EVIDENCE_DIR
  ? path.resolve(process.env.EVIDENCE_DIR)
  : path.resolve(__dirname, "../evidence");
const baseUrl = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8082";
const viewport = { width: 390, height: 844 };

async function waitForApp(page) {
  await page.goto(`${baseUrl}/notification-intake/D`, { waitUntil: "networkidle" });
  await page.getByText("ready to add").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  const file = path.join(evidenceDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });

  await waitForApp(page);
  await shot(page, "sen7-variant-d-01-inbox.png");

  await page.getByRole("button", { name: "Open reconciliation warning" }).click();
  await page.getByText("Notifications are a shortcut").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-02-reconciliation-warning.png");

  await page.getByRole("button", { name: "Go back" }).click();
  await page.getByText("ready to add").first().waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-03-inbox-warning-dismissed.png");

  await page.getByRole("button", { name: "Review Transfer received" }).click();
  await page.getByRole("button", { name: /Confirm and add transaction/ }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-04-candidate-edit.png");

  await page.getByRole("button", { name: "Go back" }).click();
  await page.getByText("ready to add").first().waitFor();

  await page.getByRole("button", { name: "Sources" }).click();
  await page.getByText("Your notifications stay on this device").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-05-disclosure.png");

  await page.getByRole("button", { name: "Open Android settings" }).click();
  await page.getByText("Choose allowed sources").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-06-sources-health.png");

  await page.getByRole("button", { name: "Go back" }).click();
  await page.getByText("ready to add").first().waitFor();

  await page.getByRole("button", { name: "Notifications discarded" }).click();
  await page.getByText("Discarded notifications").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-07-discarded-detail.png");

  await page.getByRole("button", { name: "Go back" }).click();
  await page.getByText("ready to add").first().waitFor();

  await page.getByRole("button", { name: "Preview Month Close warning" }).click();
  await page.getByText("local Candidates still need a decision").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sen7-variant-d-08-month-close.png");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
