import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { RuntimeError } from "../core/errors.js";
import { FileSystem } from "../core/file-system.js";
import {
  applyMemoryDiff,
  DeltaConversationStore,
  diffMemory,
  InMemoryConversationStore,
} from "./index.js";

const BASE_DIR_PREFIX = "flowrunner-";
const CONVERSATION_ID = "conv";
const DIRECTORY = "conversations";
const COMPACT_AFTER_PATCHES = 2;
const BASE_FILE = `${DIRECTORY}/${CONVERSATION_ID}/base.json`;
const DELTA_FILE = `${DIRECTORY}/${CONVERSATION_ID}/deltas.jsonl`;
const EMPTY_TEXT = "";
const DELTA_CONTENT = '{"diff":{}}\\n';
const VALUE_ONE = 1;
const VALUE_TWO = 2;
const VALUE_THREE = 3;
const VALUE_FOUR = 4;
const DELTA_TIMESTAMP = "2024-01-01T00:00:00.000Z";
const BASE_MEMORY = { a: VALUE_ONE };
const MEMORY_WITH_B = { a: VALUE_ONE, b: VALUE_TWO };
const MEMORY_WITH_UPDATED_A = { a: VALUE_THREE, b: VALUE_TWO };

const createTempDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), BASE_DIR_PREFIX));

const removeTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
};

test("diffMemory computes and applies patches", () => {
  const prev = { a: VALUE_ONE, b: VALUE_TWO };
  const next = { a: VALUE_ONE, c: VALUE_THREE };
  const diff = diffMemory(prev, next);

  expect(diff.set).toEqual({ c: VALUE_THREE });
  expect(diff.remove).toEqual(["b"]);
  expect(applyMemoryDiff(prev, diff)).toEqual(next);
});

test("in-memory conversation store stores and clones", async () => {
  const store = new InMemoryConversationStore();
  await store.set(CONVERSATION_ID, { count: VALUE_ONE });

  const memory = await store.get(CONVERSATION_ID);
  expect(memory).toEqual({ count: VALUE_ONE });

  if (memory) {
    memory.count = VALUE_TWO;
  }

  const stored = await store.get(CONVERSATION_ID);
  expect(stored).toEqual({ count: VALUE_ONE });

  await store.delete(CONVERSATION_ID);
  const deleted = await store.get(CONVERSATION_ID);
  expect(deleted).toBeUndefined();
});

test("delta conversation store compacts after patches", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new DeltaConversationStore({
    directory: DIRECTORY,
    fileSystem: fs,
    compactAfterPatches: COMPACT_AFTER_PATCHES,
  });

  await store.set(CONVERSATION_ID, { a: VALUE_ONE });
  await store.set(CONVERSATION_ID, { a: VALUE_ONE, b: VALUE_TWO });
  await store.set(CONVERSATION_ID, { a: VALUE_TWO, b: VALUE_TWO });

  const memory = await store.get(CONVERSATION_ID);
  expect(memory).toEqual({ a: VALUE_TWO, b: VALUE_TWO });

  const deltaText = await fs.readText(DELTA_FILE);
  expect(deltaText).toBe("");

  await store.set(CONVERSATION_ID, { a: VALUE_THREE, b: VALUE_FOUR });
  const nextMemory = await store.get(CONVERSATION_ID);
  expect(nextMemory).toEqual({ a: VALUE_THREE, b: VALUE_FOUR });

  await removeTempDir(dir);
});

test("delta store throws when delta exists without base", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new DeltaConversationStore({
    directory: DIRECTORY,
    fileSystem: fs,
  });

  await fs.writeText(DELTA_FILE, DELTA_CONTENT);

  await expect(store.get(CONVERSATION_ID)).rejects.toThrow(RuntimeError);

  await removeTempDir(dir);
});

test("delta store does not append empty diffs", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new DeltaConversationStore({
    directory: DIRECTORY,
    fileSystem: fs,
  });

  await store.set(CONVERSATION_ID, BASE_MEMORY);
  await store.set(CONVERSATION_ID, BASE_MEMORY);

  const deltaText = await fs.readText(DELTA_FILE);
  expect(deltaText).toBe(EMPTY_TEXT);

  await removeTempDir(dir);
});

test("delta store compacts on get when threshold reached", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new DeltaConversationStore({
    directory: DIRECTORY,
    fileSystem: fs,
    compactAfterPatches: COMPACT_AFTER_PATCHES,
  });

  const diff1 = diffMemory(BASE_MEMORY, MEMORY_WITH_B);
  const diff2 = diffMemory(MEMORY_WITH_B, MEMORY_WITH_UPDATED_A);
  const line1 = JSON.stringify({ timestamp: DELTA_TIMESTAMP, diff: diff1 });
  const line2 = JSON.stringify({ timestamp: DELTA_TIMESTAMP, diff: diff2 });

  await fs.writeJson(BASE_FILE, BASE_MEMORY);
  await fs.writeText(DELTA_FILE, EMPTY_TEXT);
  await fs.appendText(DELTA_FILE, `${line1}\n`);
  await fs.appendText(DELTA_FILE, `${line2}\n`);

  const memory = await store.get(CONVERSATION_ID);
  expect(memory).toEqual(MEMORY_WITH_UPDATED_A);

  const deltaText = await fs.readText(DELTA_FILE);
  expect(deltaText).toBe(EMPTY_TEXT);

  await removeTempDir(dir);
});

test("delta store delete removes base and delta files", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const store = new DeltaConversationStore({
    directory: DIRECTORY,
    fileSystem: fs,
  });

  await store.set(CONVERSATION_ID, BASE_MEMORY);

  expect(await fs.exists(BASE_FILE)).toBe(true);
  expect(await fs.exists(DELTA_FILE)).toBe(true);

  await store.delete(CONVERSATION_ID);

  expect(await fs.exists(BASE_FILE)).toBe(false);
  expect(await fs.exists(DELTA_FILE)).toBe(false);

  await removeTempDir(dir);
});
