export type CameraCutoutSubscription = { remove(): void };
export type CameraCutoutNativeModule = {
  getSnapshot(): Promise<unknown>;
  addListener(event: "onCutoutChange", listener: (snapshot: unknown) => void): CameraCutoutSubscription;
};

export async function loadCameraCutoutModule(): Promise<CameraCutoutNativeModule | null> {
  try {
    const { requireOptionalNativeModule } = await import("expo");
    return requireOptionalNativeModule<CameraCutoutNativeModule>("CameraCutout");
  } catch {
    return null;
  }
}
