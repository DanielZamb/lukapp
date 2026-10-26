export type ContextIslandPayload = {
  scope: string;
  name: string;
  emoji: string;
  progress: number | null;
  figures: Array<{ label: string; value: string }>;
  tone: "default" | "positive" | "warning";
};

export type ContextIslandSubscription = { remove(): void };

export type ContextIslandNativeModule = {
  getCapability(): Promise<unknown>;
  setAdmission(admitted: boolean): Promise<void>;
  request(payload: ContextIslandPayload): Promise<unknown>;
  update(payload: ContextIslandPayload): Promise<void>;
  end(scope: string): Promise<void>;
  endAll(): Promise<void>;
  addListener(event: "onActivityState", listener: (event: unknown) => void): ContextIslandSubscription;
};

export async function loadContextIslandModule(): Promise<ContextIslandNativeModule | null> {
  try {
    const { requireOptionalNativeModule } = await import("expo");
    return requireOptionalNativeModule<ContextIslandNativeModule>("ContextIsland");
  } catch {
    return null;
  }
}
