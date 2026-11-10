import type { Messages } from "../../types";
import type { settings as en } from "../en/settings";

export const settings: Messages<typeof en> = {
  eyebrow: "USUARIO Y ESPACIO",
  fallbackName: "Tú",
  appearance: "Apariencia",
  light: "Claro",
  dark: "Oscuro",
  language: "Idioma",
  languageSystem: "Del celular",
  languageSystemA11y: "Usar el idioma del celular",
  workspacePersonal: "Personal",
  myFinances: "Mis finanzas",
  myMoney: "Mi plata",
  places_one: "{count} lugar",
  places_other: "{count} lugares",
  categories: "Categorías",
  noCategories: "Todavía no tienes categorías",
  intake: "Lectura de notificaciones",
  intakeDetail: "Acceso del celular, apps de origen, lugares y movimientos por revisar",
  signOut: "Cerrar sesión",
};
