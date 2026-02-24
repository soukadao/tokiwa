import { expect, test } from "vitest";
import { generateId } from "./generate-id.js";

const MIN_ID_LENGTH = 10;

test("generateId returns unique strings", () => {
  const first = generateId();
  const second = generateId();

  expect(first).not.toBe(second);
  expect(first.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
  expect(second.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
});
