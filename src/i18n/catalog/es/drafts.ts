import type { Messages } from "../../types";
import type { drafts as en } from "../en/drafts";

export const drafts: Messages<typeof en> = {
  discardCandidateA11y: "Descartar {title}",
  discardDraftA11y: "Descartar borrador {title}",
  discardCandidateTitle: "¿Descartar este movimiento por revisar?",
  discardCandidateBody: "Se borra de este celular junto con el texto de la notificación. No cambia ningún movimiento registrado y esa misma notificación no vuelve a aparecer.",
  discardDraftTitle: "¿Descartar este borrador?",
  discardDraftBody: "Solo se borra de este celular. No cambia ningún movimiento registrado.",
  discardThisCandidate: "Descartar sin registrar",
  discardDraft: "Descartar borrador",
  candidateChanged: "Este movimiento por revisar cambió desde que lo abriste. Revísalo y vuelve a intentarlo.",
  candidateFrozen: "Su confirmación ya se envió, así que no se puede descartar. Ábrelo para reintentar.",
  draftFrozen: "Este borrador se está registrando, así que no se puede descartar. Reintenta el registro para terminarlo.",
  discardFailed: "No se pudo descartar. Vuelve a intentarlo.",
  incompleteDraft: "Borrador incompleto",
  unnamedCandidate: "Movimiento por revisar sin descripción",
  keepDraft: "Guardar borrador",
  saveChanges: "Guardar cambios",
  unsavedLabel: "Movimiento sin guardar",
  leaveNewTitle: "¿Guardar este movimiento como borrador?",
  leaveNewBody: "Puedes terminarlo después desde Borradores. Se queda solo en este celular hasta por 15 días.",
  leaveDraftTitle: "¿Guardar los cambios de este borrador?",
  leaveDraftBody: "Si no los guardas, el borrador se queda como estaba.",
  discardChanges: "Descartar cambios",
  continueEditing: "Seguir editando",
  keepFailed: "No se pudo guardar el borrador en este celular. Vuelve a intentarlo.",
};
