export function intakeConfirmOutcome(error: unknown): "consume" | "fail" | "retry" {
  const data =
    error !== null && typeof error === "object" && "data" in error
      ? error.data
      : null;
  const code =
    data !== null &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "string"
      ? data.code
      : "";
  if (code === "idempotency_key_conflict") return "consume";
  if (
    data !== null &&
    typeof data === "object" &&
    "kind" in data &&
    (data.kind === "accounting" || data.kind === "intake")
  )
    return "fail";
  return "retry";
}

export function intakeErrorMessage(error: unknown, fallback: string) {
  const data =
    error !== null && typeof error === "object" && "data" in error
      ? error.data
      : null;
  if (
    data !== null &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  )
    return data.message;
  return error instanceof Error ? error.message : fallback;
}
