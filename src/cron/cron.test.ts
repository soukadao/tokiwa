import { TZDate } from "@date-fns/tz";
import { expect, test } from "vitest";
import { Cron } from "./cron.js";

const INVALID_RANGE = "a-1 * * * *";
const OUT_OF_BOUNDS_RANGE = "0-99 * * * *";
const RANGE_OUT_OF_ORDER = "5-1 * * * *";
const INVALID_STEP = "*/0 * * * *";
const INVALID_FIELD = "a * * * *";
const INVALID_RANGE_STEP = "1-0 * * * *";
const INVALID_FULL = "* * * *";
const FIVE_MINUTES = "*/5 * * * *";
const JAN_1ST = "0 0 1 1 *";
const DAY_15 = "0 0 15 * *";
const HOUR_5_OR_6 = "0 5,6 * * *";
const MINUTE_ZERO = 0;

test("constructor parses fields and sorts values", () => {
  const cron = new Cron("5,1,3 0 1-3 */2 6");
  const fields = cron.getFields();

  expect(fields.minute).toEqual([1, 3, 5]);
  expect(fields.hour).toEqual([0]);
  expect(fields.dayOfMonth).toEqual([1, 2, 3]);
  expect(fields.month).toEqual([1, 3, 5, 7, 9, 11]);
  expect(fields.dayOfWeek).toEqual([6]);
});

test("parses step ranges", () => {
  const cron = new Cron("1-10/3 * * * *");

  expect(cron.getFields().minute).toEqual([1, 4, 7, 10]);
});

test("parses step ranges with a single start", () => {
  const cron = new Cron("5/10 * * * *");

  expect(cron.getFields().minute).toEqual([5, 15, 25, 35, 45, 55]);
});

test("matches evaluates date fields", () => {
  const date = new TZDate(2024, 0, 2, 3, 4, 5);
  const expression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} ${date.getDay()}`;
  const cron = new Cron(expression);

  expect(cron.matches(date)).toBe(true);
  expect(cron.matches(new TZDate(date.getTime() + 60_000))).toBe(false);
});

test("getNextExecution returns the next matching minute", () => {
  const cron = new Cron(FIVE_MINUTES);
  const after = new TZDate(2024, 0, 1, 0, 2, 30, 500);
  const next = cron.getNextExecution(after);
  const expected = new TZDate(2024, 0, 1, 0, 5, 0, 0);

  expect(next.getTime()).toBe(expected.getTime());
});

test("getNextExecution rolls to next year when month is not allowed", () => {
  const cron = new Cron(JAN_1ST);
  const after = new TZDate(2024, 0, 2, 0, 0, 0, 0);
  const next = cron.getNextExecution(after);

  expect(next.getFullYear()).toBe(2025);
  expect(next.getMonth()).toBe(0);
  expect(next.getDate()).toBe(1);
  expect(next.getHours()).toBe(0);
  expect(next.getMinutes()).toBe(0);
});

test("getNextExecution skips to the next matching day", () => {
  const cron = new Cron(DAY_15);
  const after = new TZDate(2024, 0, 1, 0, 0, 0, 0);
  const next = cron.getNextExecution(after);

  expect(next.getDate()).toBe(15);
  expect(next.getHours()).toBe(0);
  expect(next.getMinutes()).toBe(MINUTE_ZERO);
});

test("getNextExecution carries when minute rolls", () => {
  const cron = new Cron(HOUR_5_OR_6);
  const after = new TZDate(2024, 0, 1, 5, 30, 0, 0);
  const next = cron.getNextExecution(after);

  expect(next.getHours()).toBe(6);
  expect(next.getMinutes()).toBe(0);
});

test("getNextExecution throws when no match is found within the limit", () => {
  const cron = new Cron("0 0 31 2 *");
  const cronConstructor = Cron as unknown as { MAX_ITERATIONS: number };
  const previousLimit = cronConstructor.MAX_ITERATIONS;

  cronConstructor.MAX_ITERATIONS = 1;

  try {
    expect(() =>
      cron.getNextExecution(new TZDate(2024, 0, 1, 0, 0, 0)),
    ).toThrow("Could not find next execution time within 4 years");
  } finally {
    cronConstructor.MAX_ITERATIONS = previousLimit;
  }
});

test("constructor throws on invalid expressions", () => {
  expect(() => new Cron(INVALID_FULL)).toThrow();
  expect(() => new Cron(INVALID_STEP)).toThrow();
  expect(() => new Cron("60 * * * *")).toThrow();
  expect(() => new Cron(INVALID_RANGE_STEP)).toThrow();
  expect(() => new Cron(INVALID_RANGE)).toThrow();
  expect(() => new Cron(INVALID_FIELD)).toThrow();
  expect(() => new Cron(OUT_OF_BOUNDS_RANGE)).toThrow();
  expect(() => new Cron(RANGE_OUT_OF_ORDER)).toThrow();
});
