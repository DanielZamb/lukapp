// Kept free of native imports so the posting editor can check it without loading SecureStore.

// A row this editor was bound to was posted or removed elsewhere. Creating a fresh row would
// resurrect it, or post the same facts under a new idempotency key.
export class LocalEntryDraftGoneError extends Error {
  constructor(readonly draftId: string) {
    super("This draft was already posted or removed on this device.");
    this.name = "LocalEntryDraftGoneError";
  }
}
