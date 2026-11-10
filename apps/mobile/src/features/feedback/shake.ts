/** One accelerometer reading in g, with gravity included, as expo-sensors reports it. */
export type Acceleration = { x: number; y: number; z: number };
export type MotionSample = Acceleration & { at: number };

export type ShakeConfig = {
  /** Total acceleration, in g, that counts as a vigorous movement. Resting reads 1 g. */
  threshold: number;
  /** The recent stretch of samples that must be mostly vigorous. */
  windowMs: number;
  /** Share of samples in the window that must be vigorous. */
  vigorousShare: number;
  /** The window must cover at least this much time, so one jolt cannot fire. */
  minSpanMs: number;
  /** Quiet period after a shake fires; a second shake inside it is the same gesture. */
  cooldownMs: number;
};

// Walking peaks briefly near 1.3 g at heel strike and setting the phone down is a
// single spike. A deliberate shake keeps most samples above 1.5 g for half a second.
export const shakeConfig: ShakeConfig = {
  threshold: 1.5,
  windowMs: 500,
  vigorousShare: 0.75,
  minSpanMs: 250,
  cooldownMs: 1500,
};

export const shakeSampleIntervalMs = 40;

export function createShakeDetector(config: ShakeConfig = shakeConfig) {
  let window: { at: number; vigorous: boolean }[] = [];
  let quietUntil = -Infinity;
  return {
    push(sample: MotionSample): boolean {
      if (sample.at < quietUntil) return false;
      const magnitude = Math.hypot(sample.x, sample.y, sample.z);
      window.push({ at: sample.at, vigorous: magnitude >= config.threshold });
      window = window.filter((entry) => sample.at - entry.at <= config.windowMs);
      const span = sample.at - window[0].at;
      const vigorous = window.filter((entry) => entry.vigorous).length;
      if (span < config.minSpanMs || vigorous < window.length * config.vigorousShare)
        return false;
      window = [];
      quietUntil = sample.at + config.cooldownMs;
      return true;
    },
    reset() {
      window = [];
    },
  };
}

export type AccelerometerSource = {
  subscribe(listener: (reading: Acceleration) => void): () => void;
};

/**
 * Owns the accelerometer subscription. The sensor runs only while `listen(true)`
 * holds, so a backgrounded or locked app reads no motion at all.
 */
export function createShakeWatch({
  source,
  now,
  onShake,
  config = shakeConfig,
}: {
  source: AccelerometerSource;
  now: () => number;
  onShake: () => void;
  config?: ShakeConfig;
}) {
  const detector = createShakeDetector(config);
  let unsubscribe: (() => void) | null = null;
  let generation = 0;
  const listen = (listening: boolean) => {
    if (listening === (unsubscribe !== null)) return;
    generation++;
    detector.reset();
    if (!listening) {
      unsubscribe?.();
      unsubscribe = null;
      return;
    }
    const current = generation;
    unsubscribe = source.subscribe((reading) => {
      if (current !== generation) return;
      if (detector.push({ ...reading, at: now() })) onShake();
    });
  };
  return { listen, dispose: () => listen(false) };
}
