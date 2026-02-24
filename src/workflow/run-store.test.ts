import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { RuntimeError } from "../core/errors.js";
import { FileSystem } from "../core/file-system.js";
import {
  FileRunStore,
  InMemoryRunStore,
  toRunRecord,
  type WorkflowRunRecord,
} from "./index.js";
import type { WorkflowRunResult } from "./runner.js";

const BASE_DIR_PREFIX = "flowrunner-runstore-";
const RUNS_DIR = "runs";
const RUN_ID = "run-1";
const RUN_ID_2 = "run-2";
const WORKFLOW_ID = "wf";
const OTHER_WORKFLOW_ID = "wf-2";
const STATUS = "succeeded";
const STARTED_AT = "2024-01-01T00:00:00.000Z";
const FINISHED_AT = "2024-01-01T00:00:01.000Z";
const DURATION_MS = 1000;
const NODE_ID = "node";
const RESULT_KEY = NODE_ID;
const RESULT_VALUE = { ok: true };
const EMPTY_RECORDS = 0;
const LIMIT = 1;
const ERROR_MESSAGE = "boom";
const CAUSE_MESSAGE = "cause";
const TIMELINE_TIME = new Date("2024-01-01T00:00:02.000Z");
const OTHER_FILE = `${RUNS_DIR}/skip.txt`;
const FIRST_ATTEMPT = 1;
const NEXT_DELAY_MS = 0;
const TIMELINE_ENTRIES = 3;
const OBJECT_STRING = "[object Object]";
const RUN_COMPLETE_TIME = new Date("2024-01-01T00:00:03.000Z");
const NODE_START_TIME = new Date("2024-01-01T00:00:04.000Z");
const NODE_COMPLETE_TIME = new Date("2024-01-01T00:00:05.000Z");
const NODE_DURATION_MS = 50;
const FULL_TIMELINE_ENTRIES = 4;

const createTempDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), BASE_DIR_PREFIX));

const removeTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
};

const createRecord = (runId: string): WorkflowRunRecord => ({
  runId,
  workflowId: WORKFLOW_ID,
  status: STATUS,
  startedAt: STARTED_AT,
  finishedAt: FINISHED_AT,
  durationMs: DURATION_MS,
  results: { [RESULT_KEY]: RESULT_VALUE },
  errors: {},
  attempts: {},
  timeline: [],
});

test("in-memory run store saves records", async () => {
  const store = new InMemoryRunStore();
  const record = createRecord(RUN_ID);

  await store.save(record);
  const loaded = await store.get(RUN_ID);

  expect(loaded).toEqual(record);
});

test("file run store saves and lists records", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new FileRunStore({ directory: RUNS_DIR, fileSystem: fs });

  const record = createRecord(RUN_ID);
  await store.save(record);
  await fs.writeText(OTHER_FILE, "skip");

  const loaded = await store.get(RUN_ID);
  expect(loaded).toEqual(record);

  const records = await store.list({ workflowId: WORKFLOW_ID });
  expect(records).toHaveLength(1);

  const skipped = await store.list({ workflowId: OTHER_WORKFLOW_ID });
  expect(skipped).toHaveLength(EMPTY_RECORDS);

  const limited = await store.list({ limit: LIMIT });
  expect(limited).toHaveLength(LIMIT);

  await removeTempDir(dir);
});

test("file run store returns empty list for missing directory", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new FileRunStore({ directory: RUNS_DIR, fileSystem: fs });

  const records = await store.list();
  expect(records).toHaveLength(EMPTY_RECORDS);

  await removeTempDir(dir);
});

test("file run store get returns undefined when missing", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new FileRunStore({ directory: RUNS_DIR, fileSystem: fs });

  const record = await store.get(RUN_ID_2);
  expect(record).toBeUndefined();

  await removeTempDir(dir);
});

test("toRunRecord serializes errors and timeline", () => {
  const cause = new RuntimeError(CAUSE_MESSAGE);
  const error = new RuntimeError(ERROR_MESSAGE, { cause });
  const result: WorkflowRunResult = {
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    status: STATUS,
    startedAt: new Date(STARTED_AT),
    finishedAt: new Date(FINISHED_AT),
    durationMs: DURATION_MS,
    results: { [RESULT_KEY]: RESULT_VALUE },
    errors: { node: error },
    attempts: { node: FIRST_ATTEMPT },
    timeline: [
      { type: "run_start", timestamp: TIMELINE_TIME },
      {
        type: "node_retry",
        nodeId: "node",
        timestamp: TIMELINE_TIME,
        attempt: FIRST_ATTEMPT,
        nextDelayMs: NEXT_DELAY_MS,
        error,
      },
      {
        type: "node_error",
        nodeId: "node",
        timestamp: TIMELINE_TIME,
        attempt: FIRST_ATTEMPT,
        error,
      },
    ],
  };

  const record = toRunRecord(result);
  expect(record.runId).toBe(RUN_ID);
  expect(record.errors.node.name).toBe("RuntimeError");
  expect(record.errors.node.cause).toBeDefined();
  expect(record.timeline).toHaveLength(TIMELINE_ENTRIES);
});

test("toRunRecord stringifies non-error causes", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const error = new RuntimeError(ERROR_MESSAGE, { cause: circular });
  const result: WorkflowRunResult = {
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    status: STATUS,
    startedAt: new Date(STARTED_AT),
    finishedAt: new Date(FINISHED_AT),
    durationMs: DURATION_MS,
    results: {},
    errors: { [NODE_ID]: error },
    attempts: {},
    timeline: [{ type: "run_start", timestamp: TIMELINE_TIME }],
  };

  const record = toRunRecord(result);
  expect(record.errors[NODE_ID].cause).toBe(OBJECT_STRING);
});

test("toRunRecord serializes all timeline entry types", () => {
  const result: WorkflowRunResult = {
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    status: STATUS,
    startedAt: new Date(STARTED_AT),
    finishedAt: new Date(FINISHED_AT),
    durationMs: DURATION_MS,
    results: {},
    errors: {},
    attempts: { [NODE_ID]: FIRST_ATTEMPT },
    timeline: [
      { type: "run_start", timestamp: TIMELINE_TIME },
      {
        type: "node_start",
        nodeId: NODE_ID,
        timestamp: NODE_START_TIME,
        attempt: FIRST_ATTEMPT,
      },
      {
        type: "node_complete",
        nodeId: NODE_ID,
        timestamp: NODE_COMPLETE_TIME,
        durationMs: NODE_DURATION_MS,
        attempt: FIRST_ATTEMPT,
      },
      {
        type: "run_complete",
        timestamp: RUN_COMPLETE_TIME,
        status: STATUS,
        durationMs: DURATION_MS,
      },
    ],
  };

  const record = toRunRecord(result);
  expect(record.timeline).toHaveLength(FULL_TIMELINE_ENTRIES);
  expect(record.timeline[1]?.type).toBe("node_start");
  expect(record.timeline[2]?.type).toBe("node_complete");
  expect(record.timeline[3]?.type).toBe("run_complete");
});
