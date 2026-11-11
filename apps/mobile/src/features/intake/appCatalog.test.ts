import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";

const { t } = createTranslator("en");
import { appInitial, likelyBankApp, orderSources, productKindLabel, timeZoneCity } from "./appCatalog";

test("bank-like names and packages are likely bank apps; whole words only", () => {
  expect(likelyBankApp({ label: "Nu", packageName: "com.nu.production" })).toBe(true);
  expect(likelyBankApp({ label: "Bancolombia", packageName: "com.todo1.mobile" })).toBe(true);
  expect(likelyBankApp({ label: "Crédito Fácil", packageName: "co.example.app" })).toBe(true);
  expect(likelyBankApp({ label: "Nutrition", packageName: "com.menu.nutrition" })).toBe(false);
  expect(likelyBankApp({ label: "WhatsApp", packageName: "com.whatsapp" })).toBe(false);
});

test("likely bank apps sort first, then by name", () => {
  const sorted = orderSources([
    { label: "Maps", packageName: "com.maps" }, { label: "Nequi", packageName: "com.nequi.app" },
    { label: "Camera", packageName: "com.camera" }, { label: "Davivienda", packageName: "com.davivienda.app" },
  ]);
  expect(sorted.map((source) => source.label)).toEqual(["Davivienda", "Nequi", "Camera", "Maps"]);
});

test("labels are human readable", () => {
  expect(appInitial(" águila")).toBe("Á"); expect(appInitial("")).toBe("?");
  expect(productKindLabel(t, "savingsAccount")).toBe("Savings account"); expect(productKindLabel(t, "other")).toBe("Account");
  expect(productKindLabel(createTranslator("es").t, "savingsAccount")).toBe("Cuenta de ahorro");
  expect(timeZoneCity("America/Bogota")).toBe("Bogota"); expect(timeZoneCity("America/New_York")).toBe("New York");
});
