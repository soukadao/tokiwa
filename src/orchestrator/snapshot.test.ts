import { TZDate } from "@date-fns/tz";
import { expect, test } from "vitest";
import { Snapshot } from "./snapshot.js";

const PUBLISHED = 1;
const PROCESSED = 2;
const DISPATCH_ERRORS = 0;
const WORKFLOW_RUNS = 3;
const WORKFLOW_ERRORS = 1;
const METRICS = {
  published: PUBLISHED,
  processed: PROCESSED,
  dispatchErrors: DISPATCH_ERRORS,
  workflowRuns: WORKFLOW_RUNS,
  workflowErrors: WORKFLOW_ERRORS,
};

const NOW = new TZDate("2024-01-01T00:00:00.000Z");

const QUEUE_SIZE = 4;
const EMPTY_QUEUE = 0;

test("snapshot defaults", () => {
  const snapshot = new Snapshot({
    isRunning: true,
    queueSize: QUEUE_SIZE,
    metrics: METRICS,
  });

  expect(snapshot.mode).toBe("all");
  expect(snapshot.queueSize).toBe(QUEUE_SIZE);
  expect(snapshot.metrics).toEqual(METRICS);
  expect(snapshot.timestamp).toBeInstanceOf(TZDate);
});

test("snapshot accepts overrides", () => {
  const snapshot = new Snapshot({
    isRunning: false,
    queueSize: EMPTY_QUEUE,
    metrics: METRICS,
    mode: "worker",
    timestamp: NOW,
  });

  expect(snapshot.mode).toBe("worker");
  expect(snapshot.timestamp).toBe(NOW);
});
