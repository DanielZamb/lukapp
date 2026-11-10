import type { Messages } from "../../types";
import type { workspace as en } from "../en/workspace";

export const workspace: Messages<typeof en> = {
  settingsRow: "Espacio",
  settingsRowDetail: "Lugar por defecto, zona horaria y moneda",
  eyebrow: "AJUSTES",
  title: "Espacio",
  loading: "Cargando los ajustes del espacio",

  defaultPlace: "Lugar por defecto",
  defaultPlaceHelp: "Solo decide qué lugar aparece ya elegido cuando registras plata.",
  defaultPlaceTitle: "Elige tu lugar por defecto",
  defaultBadge: "Por defecto",
  defaultPlaceA11y: "{name}, lugar por defecto",

  timeZone: "Zona horaria",
  timeZoneA11y: "Zona horaria, {zone}",
  timeZoneTitle: "¿Cambiar la zona horaria a {zone}?",
  timeZoneBody: "Desde ahora, “hoy” y el mes actual siguen la hora de {zone}. Todo lo que ya registraste conserva su fecha, los meses cerrados siguen cerrados y el historial de tu Presupuesto no se mueve.",
  timeZoneToday: "Con esta zona horaria, hoy es {date}.",
  timeZoneConfirm: "Cambiar zona horaria",

  currency: "Moneda",
  currencyA11y: "Moneda, {currency}",
  currencyChangeable: "Puedes cambiarla una vez, antes de tu primer movimiento.",
  currencyTitle: "¿Usar {currency} en este espacio?",
  currencyBody: "Solo puedes cambiar la moneda una vez, y nunca después de registrar tu primer movimiento.",
  currencyDrops_one: "Este celular tiene {count} borrador en {currency} sin registrar. Si cambias la moneda, se borra.",
  currencyDrops_other: "Este celular tiene {count} borradores en {currency} sin registrar. Si cambias la moneda, se borran.",
  currencyDropsUnread: "No pudimos revisar los borradores de este celular. Cierra esto e intenta de nuevo.",
  currencyConfirm: "Usar {currency}",
  currencyHasEntries: "Ya no se puede cambiar porque este espacio ya tiene movimientos.",
  currencyHasRecords: "Ya no se puede cambiar porque ya hay montos guardados en {currency}, como un tope del Presupuesto o un saldo inicial.",
  currencyAlreadyChanged: "Ya no se puede cambiar porque ya la cambiaste una vez.",
  currencyLocked: "Ya no se puede cambiar.",

  saving: "Guardando…",
  retry: "Reintentar el mismo cambio",
  uncertain: "No pudimos confirmar este cambio. Reintenta: revisamos el mismo cambio sin aplicarlo dos veces.",

  defaultPlaceStale: "Tu lugar por defecto se cambió desde otro lado. Ahora es {current}.",
  placeMissing: "Ese lugar ya no está disponible. Elige otro.",
  timeZoneStale: "La zona horaria se cambió desde otro lado. Ahora es {current}.",
  timeZoneInvalid: "Lukapp no reconoce esa zona horaria. Elige otra.",
  currencyStale: "La moneda se cambió desde otro lado. Ahora es {current}.",
  currencyInvalid: "Lukapp no puede usar esa moneda. Elige otra.",
  notReady: "Tu espacio todavía no está listo. Termina la configuración primero.",
  sessionRefused: "No pudimos confirmar tu sesión. Vuelve a iniciar sesión y reintenta.",
  deviceRefused: "No pudimos confirmar el acceso de este celular. Abre Lukapp otra vez y reintenta.",
  accessRefused: "Esta cuenta no puede cambiar los ajustes de este espacio.",
  rejected: "No pudimos guardar este cambio. Intenta de nuevo.",
};
