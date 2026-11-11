import type { Messages } from "../../types";
import type { common as en } from "../en/common";

export const common: Messages<typeof en> = {
  back: "Atrás",
  cancel: "Cancelar",
  close: "Cerrar",
  save: "Guardar",
  delete: "Eliminar",
  discard: "Descartar",
  done: "Listo",
  retry: "Reintentar",
  loading: "Cargando…",
  yourProfile: "Tu perfil",
  pillBackLabel: "Volver al resumen, {name}, {detail}",
  pillShowLabel: "Mostrar el resumen, {name}, {detail}",
  pillAmount: "Monto",
  pillOverLimit: "Por encima del tope",
  pillLeftToSpend: "Te queda para gastar",
  pillSpentOf: "Gastado de {limit}",
  pillOfLimit: "de {limit}",
  pillShow: "Mostrar el resumen",
  pillBack: "Volver al resumen",
  pillHide: "Ocultar hasta que se vea el resumen",
  closeNamed: "Cerrar {name}",
};
