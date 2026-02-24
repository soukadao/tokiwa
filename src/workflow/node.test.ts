import { expect, test } from "vitest";
import { InvalidArgumentError } from "../core/errors.js";
import { Node } from "./node.js";

const NODE_ID = "node-1";
const DEP_A = "A";
const DEP_B = "B";
const MAX_ATTEMPTS = 2;
const INITIAL_DELAY = 0;
const BACKOFF = 1;
const MAX_DELAY = 1;
const JITTER = 0;

const handler = (): void => {};

test("node validates id", () => {
  expect(() => new Node({ id: "", handler })).toThrow(InvalidArgumentError);
});

test("node captures dependencies and addDependency", () => {
  const node = new Node({ id: NODE_ID, handler, dependsOn: [DEP_A] });
  node.addDependency(DEP_B);
  expect(node.dependsOn.sort()).toEqual([DEP_A, DEP_B].sort());
});

test("node accepts retry policy", () => {
  const node = new Node({
    id: NODE_ID,
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
        id: NODE_ID,
        handler,
        retry: { maxAttempts: 0 },
      }),
  ).toThrow(InvalidArgumentError);
});
