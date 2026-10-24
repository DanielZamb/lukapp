import { useEffect, useState } from "react";
import { loadCameraCutoutModule, type CameraCutoutSubscription } from "../../modules/camera-cutout";
import {
  classifyAndroidCutout,
  classifyCameraCutoutFacts,
  cutoutSnapshotSchema,
  NO_CAMERA_CUTOUT,
  type CameraCutout,
  type CutoutRect,
} from "../../modules/camera-cutout/src/facts";

export type { CameraCutout, CutoutRect };

export function classifyCutout(input: { rects: CutoutRect[]; windowWidth: number }): CameraCutout {
  return classifyAndroidCutout(input);
}

export function useCameraCutout(): CameraCutout {
  const [cutout, setCutout] = useState<CameraCutout>(NO_CAMERA_CUTOUT);
  useEffect(() => {
    let active = true;
    let revision = -1;
    let subscription: CameraCutoutSubscription | undefined;
    const accept = (raw: unknown) => {
      if (!active) return;
      const result = cutoutSnapshotSchema.safeParse(raw);
      if (!result.success) {
        setCutout(NO_CAMERA_CUTOUT);
        return;
      }
      if (result.data.revision <= revision) return;
      revision = result.data.revision;
      setCutout(classifyCameraCutoutFacts(result.data.facts));
    };
    void (async () => {
      try {
        const native = await loadCameraCutoutModule();
        if (!active || !native) return;
        subscription = native.addListener("onCutoutChange", accept);
        const readRevision = revision;
        try {
          accept(await native.getSnapshot());
        } catch {
          if (active && revision === readRevision) setCutout(NO_CAMERA_CUTOUT);
        }
      } catch {
        if (active) setCutout(NO_CAMERA_CUTOUT);
      }
    })();
    return () => {
      active = false;
      try {
        subscription?.remove();
      } catch {}
    };
  }, []);
  return cutout;
}
