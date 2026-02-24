import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FileSystem } from "./file-system.js";

const BASE_DIR_PREFIX = "flowrunner-fs-";
const TEXT_FILE = "notes/hello.txt";
const APPEND_TEXT = " world";
const TEXT_CONTENT = "hello";
const JSON_FILE = "data/info.json";
const JSON_CONTENT = { ok: true };
const LIST_DIR = "notes";
const APPENDED_CONTENT = `${TEXT_CONTENT}${APPEND_TEXT}`;
const BAD_JSON_FILE = "data/bad.json";
const BAD_JSON = "{ invalid";
const ENSURE_DIR = "assets";
const SERIALIZE_FILE = "data/circular.json";
const CIRCULAR_JSON_ERROR = "Converting circular structure to JSON";

const createTempDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), BASE_DIR_PREFIX));

const removeTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
};

test("file system read/write/append", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });

  await fs.writeText(TEXT_FILE, TEXT_CONTENT);
  await fs.appendText(TEXT_FILE, APPEND_TEXT);

  const text = await fs.readText(TEXT_FILE);
  expect(text).toBe(APPENDED_CONTENT);

  await removeTempDir(dir);
});

test("file system json helpers", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });

  await fs.writeJson(JSON_FILE, JSON_CONTENT);
  const value = await fs.readJson<typeof JSON_CONTENT>(JSON_FILE);
  expect(value).toEqual(JSON_CONTENT);

  await removeTempDir(dir);
});

test("file system readJson throws on invalid JSON", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });

  await fs.writeText(BAD_JSON_FILE, BAD_JSON);
  await expect(fs.readJson(BAD_JSON_FILE)).rejects.toThrow(
    "Failed to parse JSON",
  );

  await removeTempDir(dir);
});

test("file system writeJson throws on unserializable values", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  await expect(fs.writeJson(SERIALIZE_FILE, circular)).rejects.toThrow(
    CIRCULAR_JSON_ERROR,
  );

  await removeTempDir(dir);
});

test("file system ensureDir creates directory", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });

  await fs.ensureDir(ENSURE_DIR);
  expect(await fs.exists(ENSURE_DIR)).toBe(true);

  await removeTempDir(dir);
});
test("file system exists/list/stat/remove", async () => {
  const dir = await createTempDir();
  const fs = new FileSystem({ baseDir: dir });

  await fs.writeText(TEXT_FILE, TEXT_CONTENT);
  expect(await fs.exists(TEXT_FILE)).toBe(true);
  expect(await fs.exists("missing.txt")).toBe(false);

  const stat = await fs.stat(TEXT_FILE);
  expect(stat.isFile()).toBe(true);

  const list = await fs.listDir(LIST_DIR);
  expect(list).toContain("hello.txt");

  await fs.remove(LIST_DIR);
  expect(await fs.exists(LIST_DIR)).toBe(false);

  await removeTempDir(dir);
});
