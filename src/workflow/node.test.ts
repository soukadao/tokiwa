import { expect, test } from "vitest";
import { InvalidArgumentError } from "../core/errors.js";
import { Node } from "./node.js";

const MIN_ID_LENGTH = 1;
const MAX_ATTEMPTS = 2;
const INITIAL_DELAY = 0;
const BACKOFF = 1;
const MAX_DELAY = 1;
const JITTER = 0;

const handler = (): void => {};

test("node captures dependencies and addDependency", () => {
  const depA = new Node({ handler });
  const depB = new Node({ handler });
  const node = new Node({ handler, dependsOn: [depA.id] });
  node.addDependency(depB.id);
  expect(node.dependsOn.sort()).toEqual([depA.id, depB.id].sort());
});

test("node generates id", () => {
  const node = new Node({ handler });
  expect(node.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
});

test("node accepts retry policy", () => {
  const node = new Node({
    handler,
    retry: {
      maxAttempts: MAX_ATTEMPTS,
      initialDelayMs: INITIAL_DELAY,
      backoffMultiplier: BACKOFF,
      maxDelayMs: MAX_DELAY,
      jitterMs: JITTER,
    },
  });

  expect(node.retry?.maxAttempts).toBe(MAX_ATTEMPTS);
});

test("node rejects invalid retry policy", () => {
  expect(
    () =>
      new Node({
        handler,
        retry: { maxAttempts: 0 },
      }),
  ).toThrow(InvalidArgumentError);
});
