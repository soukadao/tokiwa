import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RuntimeError } from "../core/index.js";
import { Scheduler, type SchedulerLogger } from "./scheduler.js";

const HALF_MINUTE_MS = 30_000;
const ONE_MINUTE_MS = 60_000;
const SHORT_DELAY_MS = 10;
const PARALLEL_WAIT_MS = 20;
const NUMERIC_INTERVAL_MS = 5_000;
const JOB_ID = "jobA";
const JOB_ID_B = "jobB";
const RUNS_ONCE = 1;
const NO_RUNS = 0;
const ZERO = 0;
const NON_MATCHING_TIME = new Date(2024, 0, 2, 0, 0, 30);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("addJob stores a job and getters reflect it", () => {
  const scheduler = new Scheduler();
  scheduler.addJob(JOB_ID, "* * * * *", () => {});

  const job = scheduler.getJob(JOB_ID);
  expect(job?.id).toBe(JOB_ID);
  expect(job?.name).toBeUndefined();
  expect(scheduler.getAllJobs()).toHaveLength(RUNS_ONCE);
  expect(scheduler.isJobScheduled(JOB_ID)).toBe(true);
});

test("removeJob deletes a job and returns status", () => {
  const scheduler = new Scheduler();
  scheduler.addJob(JOB_ID, "* * * * *", () => {});

  expect(scheduler.removeJob(JOB_ID)).toBe(true);
  expect(scheduler.removeJob(JOB_ID)).toBe(false);
  expect(scheduler.isJobScheduled(JOB_ID)).toBe(false);
});

test("getNextExecutionTime returns null for missing job", () => {
  const scheduler = new Scheduler();

  expect(scheduler.getNextExecutionTime("missing")).toBeNull();
});

test("getNextExecutionTime returns the next execution", () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 2, 30));
  const scheduler = new Scheduler();
  scheduler.addJob(JOB_ID, "*/5 * * * *", () => {});

  const next = scheduler.getNextExecutionTime(JOB_ID);

  expect(next).not.toBeNull();
  expect(next?.getMinutes()).toBe(5);
  expect(next?.getSeconds()).toBe(0);
});

test("start executes a matching job on the next minute", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const scheduler = new Scheduler();
  let runs = 0;

  scheduler.addJob(JOB_ID, "* * * * *", () => {
    runs += 1;
  });

  scheduler.start();
  await vi.advanceTimersByTimeAsync(HALF_MINUTE_MS);

  expect(runs).toBe(RUNS_ONCE);
  await scheduler.stop();
});

test("start is a no-op when already running", async () => {
  const scheduler = new Scheduler();
  const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

  scheduler.start();
  scheduler.start();

  expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  await scheduler.stop();
});

test("stop is a no-op when not running", async () => {
  const scheduler = new Scheduler();
  const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

  await scheduler.stop();

  expect(clearTimeoutSpy).not.toHaveBeenCalled();
});

test("scheduleNextCheck does nothing when stopped", () => {
  const scheduler = new Scheduler();
  const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

  (
    scheduler as unknown as { scheduleNextCheck: () => void }
  ).scheduleNextCheck();

  expect(setTimeoutSpy).not.toHaveBeenCalled();
});

test("handler errors are logged", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const logger: SchedulerLogger = {
    error: vi.fn(),
  };
  const scheduler = new Scheduler({ logger });

  scheduler.addJob("jobA", "* * * * *", () => {
    throw new RuntimeError("boom");
  });

  scheduler.start();
  await vi.advanceTimersByTimeAsync(HALF_MINUTE_MS);

  expect(logger.error).toHaveBeenCalled();
  await scheduler.stop();
});

test("stop cancels the pending check", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const scheduler = new Scheduler();
  let runs = 0;

  scheduler.addJob(JOB_ID, "* * * * *", () => {
    runs += 1;
  });

  scheduler.start();
  await scheduler.stop();
  await vi.advanceTimersByTimeAsync(ONE_MINUTE_MS);

  expect(runs).toBe(NO_RUNS);
});

test("jobs run in parallel within the same tick", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const scheduler = new Scheduler({ checkIntervalMs: ONE_MINUTE_MS });
  let running = 0;
  let maxRunning = 0;

  scheduler.addJob(JOB_ID, "* * * * *", async () => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, SHORT_DELAY_MS));
    running -= 1;
  });

  scheduler.addJob(JOB_ID_B, "* * * * *", async () => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, SHORT_DELAY_MS));
    running -= 1;
  });

  const promise = (
    scheduler as unknown as { checkAndExecuteJobs: () => Promise<void> }
  ).checkAndExecuteJobs();

  expect(maxRunning).toBe(2);
  await vi.advanceTimersByTimeAsync(PARALLEL_WAIT_MS);
  await promise;
});

test("constructor accepts numeric interval", () => {
  const scheduler = new Scheduler(NUMERIC_INTERVAL_MS);
  expect(scheduler.getAllJobs()).toHaveLength(ZERO);
});

test("checkAndExecuteJobs skips non-matching jobs", async () => {
  vi.setSystemTime(NON_MATCHING_TIME);
  const scheduler = new Scheduler({ checkIntervalMs: ONE_MINUTE_MS });
  let runs = 0;

  scheduler.addJob(JOB_ID, "0 0 1 1 *", () => {
    runs += 1;
  });

  const promise = (
    scheduler as unknown as { checkAndExecuteJobs: () => Promise<void> }
  ).checkAndExecuteJobs();

  await promise;
  expect(runs).toBe(NO_RUNS);
});

test("checkAndExecuteJobs avoids duplicate runs within a minute", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const scheduler = new Scheduler({ checkIntervalMs: ONE_MINUTE_MS });
  let runs = 0;

  scheduler.addJob(JOB_ID, "* * * * *", () => {
    runs += 1;
  });

  const schedulerApi = scheduler as unknown as {
    checkAndExecuteJobs: () => Promise<void>;
  };
  await schedulerApi.checkAndExecuteJobs();
  await schedulerApi.checkAndExecuteJobs();

  expect(runs).toBe(RUNS_ONCE);
});

test("stop waits for in-flight jobs", async () => {
  vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
  const scheduler = new Scheduler({ checkIntervalMs: ONE_MINUTE_MS });
  let resolveJob: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    resolveJob = resolve;
  });

  scheduler.addJob(JOB_ID, "* * * * *", async () => {
    await gate;
  });

  scheduler.start();
  const schedulerApi = scheduler as unknown as {
    checkAndExecuteJobs: () => Promise<void>;
  };
  const checkPromise = schedulerApi.checkAndExecuteJobs();

  let stopped = false;
  const stopPromise = scheduler.stop().then(() => {
    stopped = true;
  });

  await Promise.resolve();
  expect(stopped).toBe(false);

  if (resolveJob) {
    resolveJob();
  }

  await checkPromise;
  await stopPromise;
  expect(stopped).toBe(true);
});
