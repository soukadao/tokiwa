import { expect, test } from "vitest";
import { measurePerformance, runPerformance } from "./performance.js";

const RESULT_VALUE = "ok";
const MEASUREMENT_TIMES = 3;
const MIN_TIME_MS = 0;

test("runPerformance returns result and time", () => {
  const { result, time } = runPerformance(() => RESULT_VALUE);
  expect(result).toBe(RESULT_VALUE);
  expect(Number.isFinite(time)).toBe(true);
  expect(time).toBeGreaterThanOrEqual(MIN_TIME_MS);
});

test("measurePerformance returns times array", () => {
  const { times } = measurePerformance(() => RESULT_VALUE, MEASUREMENT_TIMES);
  expect(times).toHaveLength(MEASUREMENT_TIMES);
  expect(times.every((value) => Number.isFinite(value))).toBe(true);
});
