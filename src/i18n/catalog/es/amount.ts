import type { Messages } from "../../types";
import type { amount as en } from "../en/amount";

export const amount: Messages<typeof en> = {
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
  readingChanged: "Ahora se lee como {amount}",
  reviewConverted: "Lo guardaste como {previous}. Ahora aparece como {amount}.",
  reviewPasted: "Pegaste {amount}. Revisa que esté bien antes de seguir.",
  reviewConfirm: "Confirmar {amount}",
  reviewRequired: "Confirma el monto antes de seguir.",
  currencyChanged: "La moneda cambió mientras escribías. Revisa el monto e inténtalo de nuevo.",
  noticeReenter: "No pudimos leer el monto guardado antes ({previous}). Escríbelo de nuevo.",
};
