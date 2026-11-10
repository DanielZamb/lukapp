import { expect, test } from "vitest";
import { createShakeDetector, createShakeWatch, type Acceleration, type MotionSample } from "./shake";

const interval = 40;

function trace(from: number, readings: Acceleration[]): MotionSample[] {
  return readings.map((reading, index) => ({ ...reading, at: from + index * interval }));
}

/** Two steps a second: a heel strike near 1.6 g, a rebound, then ordinary sway. */
function walking(seconds: number): Acceleration[] {
  const stride = [1.6, 1.35, 1.05, 0.9, 0.95, 1.0, 1.05, 1.0, 0.95, 1.0, 1.02, 0.98];
  return Array.from({ length: (seconds * 1000) / interval }, (_, index) => ({
    x: 0.1,
    y: stride[index % stride.length],
    z: 0.1,
  }));
}

/** Setting the phone on a table: one hard spike and a short ring. */
const setDown: Acceleration[] = [
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: 3.2 },
  { x: 0, y: 0, z: 1.4 },
  { x: 0, y: 0, z: 0.8 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: 1 },
];

/** A deliberate side-to-side shake, about 2.2 g each way. */
function shaking(ms: number): Acceleration[] {
  return Array.from({ length: ms / interval }, (_, index) => ({ x: index % 2 ? -2 : 2, y: 0, z: 1 }));
}

const still = (ms: number): Acceleration[] => Array.from({ length: ms / interval }, () => ({ x: 0, y: 0, z: 1 }));

function fires(samples: MotionSample[]) {
  const detector = createShakeDetector();
  return samples.filter((sample) => detector.push(sample)).map((sample) => sample.at);
}

test("ten seconds of walking never opens a report", () => {
  expect(fires(trace(0, walking(10)))).toEqual([]);
});

test("setting the phone down never opens a report", () => {
  expect(fires(trace(0, [...still(400), ...setDown, ...still(400)]))).toEqual([]);
});

test("one deliberate shake from rest fires exactly once, about a third of a second in", () => {
  expect(fires(trace(0, [...still(400), ...shaking(1200)]))).toEqual([760]);
});

test("a double shake inside the quiet period counts as the same gesture", () => {
  const samples = trace(0, [...still(400), ...shaking(600), ...still(200), ...shaking(600)]);
  expect(fires(samples)).toEqual([760]);
});

test("a second shake after the quiet period fires again", () => {
  const samples = trace(0, [...still(400), ...shaking(600), ...still(2000), ...shaking(600)]);
  expect(fires(samples)).toEqual([760, 3360]);
});

test("the sensor is read only while listening; late readings after backgrounding are ignored", () => {
  const listeners = new Set<(reading: Acceleration) => void>();
  const retained: ((reading: Acceleration) => void)[] = [];
  const source = {
    subscribe(listener: (reading: Acceleration) => void) {
      listeners.add(listener);
      retained.push(listener);
      return () => listeners.delete(listener);
    },
  };
  let now = 0;
  const shakes: number[] = [];
  const watch = createShakeWatch({ source, now: () => now, onShake: () => shakes.push(now) });
  expect(listeners.size).toBe(0);
  watch.listen(true);
  expect(listeners.size).toBe(1);
  watch.listen(false);
  expect(listeners.size).toBe(0);
  for (const reading of shaking(1200)) {
    now += interval;
    retained[0](reading);
  }
  expect(shakes).toEqual([]);
  watch.listen(true);
  for (const reading of shaking(600)) {
    now += interval;
    for (const listener of listeners) listener(reading);
  }
  expect(shakes).toEqual([1520]);
  watch.dispose();
  expect(listeners.size).toBe(0);
});
