import * as SecureStore from "expo-secure-store";
import { runLocalInputWrite, type LocalInputLease } from "../../local-auth/localInput";
import { intakeStorageKey, parseIntakeDocument, readIntakeRaw, type IntakeDocument, type IntakeCandidate, type IntakeCandidateId } from "./candidates";

export function writeIntakeDocument(subject: string, document: IntakeDocument) {
  return SecureStore.setItemAsync(
    intakeStorageKey(subject),
    JSON.stringify(document),
  );
}

export function acceptIn(
  document: IntakeDocument,
  candidate: IntakeCandidate,
  now: number,
): IntakeDocument {
  const candidates = document.candidates.filter((row) => row.expiresAt > now);
  return {
    v: 1,
    candidates: [...candidates.filter((row) => row.id !== candidate.id), candidate],
  };
}

export function consumeIn(document: IntakeDocument, id: IntakeCandidateId): IntakeDocument {
  return {
    v: 1,
    candidates: document.candidates.filter((row) => row.id !== id),
  };
}

export function failIn(
  document: IntakeDocument,
  id: IntakeCandidateId,
  error: string,
): IntakeDocument {
  return {
    v: 1,
    candidates: document.candidates.map((row) =>
      row.id === id ? { ...row, error } : row,
    ),
  };
}

export async function mutateIntakeDocument<T>(
  lease: LocalInputLease,
  subject: string,
  mutate: (
    document: IntakeDocument,
    now: number,
    dirty: boolean,
  ) => { document: IntakeDocument; result: T; write: boolean },
): Promise<T> {
  let completed = false;
  let result!: T;
  await runLocalInputWrite(lease, async () => {
    const now = Date.now();
    const parsed = parseIntakeDocument(await readIntakeRaw(subject), now);
    const next = mutate(parsed.document, now, parsed.dirty);
    if (next.write) await writeIntakeDocument(subject, next.document);
    result = next.result;
    completed = true;
  });
  if (!completed) throw new Error("Intake mutation did not complete");
  return result;
}
