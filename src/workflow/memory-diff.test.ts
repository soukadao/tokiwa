import { expect, test } from "vitest";
import { applyMemoryDiff, diffMemory, isEmptyDiff } from "./memory-diff.js";

const BASE_VALUE_A = 1;
const BASE_VALUE_B = 2;
const BASE_VALUE_C = 3;
const BASE = { a: BASE_VALUE_A, b: BASE_VALUE_B };
const NEXT = { a: BASE_VALUE_A, c: BASE_VALUE_C };
const EMPTY = { a: BASE_VALUE_A };

const REMOVED_KEY = "b";
const ADDED_KEY = "c";
const ADDED_VALUE = BASE_VALUE_C;

test("diffMemory detects changes", () => {
  const diff = diffMemory(BASE, NEXT);
  expect(diff.set).toEqual({ [ADDED_KEY]: ADDED_VALUE });
  expect(diff.remove).toEqual([REMOVED_KEY]);
  expect(applyMemoryDiff(BASE, diff)).toEqual(NEXT);
});

test("diffMemory returns empty diff when no changes", () => {
  const diff = diffMemory(EMPTY, EMPTY);
  expect(isEmptyDiff(diff)).toBe(true);
});
