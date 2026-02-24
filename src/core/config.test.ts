import { expect, test } from "vitest";
import { Config } from "./config.js";
import { InvalidArgumentError } from "./errors.js";

const PREFIX = "TESTCFG_";
const NUMBER_KEY = `${PREFIX}NUMBER`;
const BOOLEAN_KEY = `${PREFIX}BOOLEAN`;
const STRING_KEY = `${PREFIX}STRING`;
const INVALID_KEY = "INVALID";
const NUMBER_VALUE = "123";
const NUMBER_VALUE_PARSED = 123;
const BOOLEAN_VALUE = "true";
const STRING_VALUE = "hello";
const CUSTOM_VALUE = "custom";
const NUMBER_INPUT = 100;
const BOOL_TRUE_KEY = "BOOL_TRUE";
const BOOL_FALSE_KEY = "BOOL_FALSE";
const BOOL_TRUE_VALUE = "yes";
const BOOL_FALSE_VALUE = "0";
const REMOVE_KEY = "REMOVE";
const REMOVE_VALUE = "value";
const HAS_KEY = "HAS";

const setEnv = (key: string, value: string): void => {
  process.env[key] = value;
};

const deleteEnv = (key: string): void => {
  delete process.env[key];
};

test("loadFromEnv parses default types", () => {
  setEnv(NUMBER_KEY, NUMBER_VALUE);
  setEnv(BOOLEAN_KEY, BOOLEAN_VALUE);
  setEnv(STRING_KEY, STRING_VALUE);

  const config = new Config();
  config.loadFromEnv({ prefix: PREFIX });

  expect(config.get<unknown>("NUMBER")).toBe(NUMBER_VALUE_PARSED);
  expect(config.get<unknown>("BOOLEAN")).toBe(true);
  expect(config.get<unknown>("STRING")).toBe(STRING_VALUE);

  deleteEnv(NUMBER_KEY);
  deleteEnv(BOOLEAN_KEY);
  deleteEnv(STRING_KEY);
});

test("loadFromEnv respects parse flags", () => {
  setEnv(NUMBER_KEY, NUMBER_VALUE);

  const config = new Config();
  config.loadFromEnv({ prefix: PREFIX, parseNumbers: false });

  expect(config.get<unknown>("NUMBER")).toBe(NUMBER_VALUE);

  deleteEnv(NUMBER_KEY);
});

test("getString/Number/Boolean validate types", () => {
  const config = new Config();
  config.set("NUMBER", NUMBER_INPUT);
  config.set("BOOLEAN", true);

  expect(() => config.getString("NUMBER")).toThrow(InvalidArgumentError);
  expect(() => config.getNumber("BOOLEAN")).toThrow(InvalidArgumentError);
  expect(() => config.getBoolean("NUMBER")).toThrow(InvalidArgumentError);
});

test("getRequired throws on missing", () => {
  const config = new Config();
  expect(() => config.getRequired(INVALID_KEY)).toThrow(InvalidArgumentError);
});

test("getString returns fallback", () => {
  const config = new Config();
  expect(config.getString(INVALID_KEY, CUSTOM_VALUE)).toBe(CUSTOM_VALUE);
});

test("has/delete/clear behave as expected", () => {
  const config = new Config();
  config.set(HAS_KEY, true);
  config.set(REMOVE_KEY, REMOVE_VALUE);

  expect(config.has(HAS_KEY)).toBe(true);
  expect(config.delete(REMOVE_KEY)).toBe(true);
  expect(config.delete(REMOVE_KEY)).toBe(false);

  config.clear();
  expect(config.has(HAS_KEY)).toBe(false);
});

test("boolean parsing handles true/false strings", () => {
  setEnv(`${PREFIX}${BOOL_TRUE_KEY}`, BOOL_TRUE_VALUE);
  setEnv(`${PREFIX}${BOOL_FALSE_KEY}`, BOOL_FALSE_VALUE);

  const config = new Config();
  config.loadFromEnv({ prefix: PREFIX });

  expect(config.getBoolean(BOOL_TRUE_KEY)).toBe(true);
  expect(config.getBoolean(BOOL_FALSE_KEY)).toBe(false);

  deleteEnv(`${PREFIX}${BOOL_TRUE_KEY}`);
  deleteEnv(`${PREFIX}${BOOL_FALSE_KEY}`);
});
