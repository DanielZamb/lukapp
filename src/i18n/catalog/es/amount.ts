import type { Messages } from "../../types";
import type { amount as en } from "../en/amount";

export const amount: Messages<typeof en> = {
  decimalCommaA11y: "Escribir coma decimal en {currency}",
  decimalPointA11y: "Escribir punto decimal en {currency}",
  noDecimalsA11y: "Los montos en {currency} no llevan decimales",
  signA11y: "Cambiar el monto entre menos y más",
  signMinus: "menos",
  signPlus: "más",
  markComma: "la coma",
  markPoint: "el punto",
  hintDecimal: "Usa {mark} para los decimales, por ejemplo {example}",
  hintGrouping: "Separa los miles con {mark} cada tres cifras, por ejemplo {example}",
  hintFormat: "Escribe el monto así: {example}",
  hintTooManyDecimals: "Usa máximo {precision} decimales, por ejemplo {example}",
  hintNoDecimals: "Los montos en {currency} no llevan decimales, por ejemplo {example}",
  hintNotNumber: "Escribe solo números y separadores, por ejemplo {example}",
  hintTooLarge: "El monto es demasiado grande.",
  reading: "Se lee como {amount}",
  reviewConverted: "Lo guardaste como {previous}. Ahora aparece como {amount}.",
  reviewPasted: "Pegaste {amount}. Revisa que esté bien antes de seguir.",
  reviewConfirm: "Confirmar {amount}",
  reviewRequired: "Confirma el monto antes de seguir.",
  awaitingPhone: "Un momento: el separador decimal todavía está llegando al campo.",
  noticeReenter: "No pudimos leer el monto guardado antes ({previous}). Escríbelo de nuevo.",
};
