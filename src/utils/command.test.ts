import { expect, test } from "vitest";
import { RuntimeError } from "../core/index.js";
import { execCommand } from "./command.js";

const NODE_PATH = process.execPath;
const STDOUT_TEXT = "ok";
const SCRIPT_OK = `console.log("${STDOUT_TEXT}")`;
const EXIT_CODE = 2;
const STDERR_TEXT = "failure";
const SCRIPT_FAIL = `console.error("${STDERR_TEXT}"); process.exit(${EXIT_CODE});`;

test("execCommand returns stdout", async () => {
  const output = await execCommand(NODE_PATH, ["-e", SCRIPT_OK]);
  expect(output.trim()).toBe(STDOUT_TEXT);
});

test("execCommand throws RuntimeError on failure", async () => {
  try {
    await execCommand(NODE_PATH, ["-e", SCRIPT_FAIL]);
    throw new Error("Expected execCommand to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeError);
    if (error instanceof Error) {
      expect(error.message).toContain("Command failed:");
      expect(error.message).toContain(`Exit code: ${EXIT_CODE}`);
      expect(error.message).toContain(STDERR_TEXT);
    }
  }
});
