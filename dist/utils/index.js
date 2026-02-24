// src/core/errors.ts
var AppError = class extends Error {
  /**
   * @param message エラーメッセージ
   * @param options エラーオプション（causeなど）
   */
  constructor(message, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
  }
};
var InvalidArgumentError = class extends AppError {
};
var RuntimeError = class extends AppError {
};

// src/utils/exec-async.ts
import {
  exec,
  execFile
} from "node:child_process";
import { promisify } from "node:util";
var DEFAULT_ENCODING = "utf8";
var SHELL_EXEC_DISABLED_MESSAGE = "Shell execution is disabled. Pass { allowShell: true } to execAsync.";
var execAsyncRaw = promisify(exec);
var execFileAsyncRaw = promisify(execFile);
var normalizeOutput = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (value) {
    return value.toString(DEFAULT_ENCODING);
  }
  return "";
};
var execAsync = async (command, options = {}) => {
  if (!options.allowShell) {
    throw new InvalidArgumentError(SHELL_EXEC_DISABLED_MESSAGE);
  }
  const { allowShell: _allowShell, ...execOptions } = options;
  const { stdout, stderr } = await execAsyncRaw(command, {
    encoding: DEFAULT_ENCODING,
    ...execOptions
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};
var execFileAsync = async (file, args = [], options = {}) => {
  const { stdout, stderr } = await execFileAsyncRaw(file, args, {
    encoding: DEFAULT_ENCODING,
    ...options
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};

// src/utils/command.ts
var formatCommand = (command, args) => [command, ...args].join(" ");
var isExecError = (error) => error instanceof Error && ("stderr" in error || "code" in error);
var execCommand = async (command, args = []) => {
  const commandText = formatCommand(command, args);
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout;
  } catch (error) {
    if (isExecError(error)) {
      const stderr = typeof error.stderr === "string" ? error.stderr : error.stderr?.toString() ?? "";
      throw new RuntimeError(
        `Command failed: ${commandText}
Exit code: ${error.code}
${stderr}`
      );
    }
    throw new RuntimeError(`Command failed: ${commandText}
${error}`);
  }
};

// src/utils/performance.ts
import { performance } from "node:perf_hooks";
var DEFAULT_MEASUREMENT_TIMES = 1e4;
var runPerformance = (fn) => {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  const time = t1 - t0;
  return { result, time };
};
var measurePerformance = (fn, times = DEFAULT_MEASUREMENT_TIMES) => {
  const resultTimes = [];
  for (let i = 0; i < times; i++) {
    const { time } = runPerformance(fn);
    resultTimes.push(time);
  }
  return { times: resultTimes };
};
export {
  execAsync,
  execCommand,
  execFileAsync,
  measurePerformance,
  runPerformance
};
//# sourceMappingURL=index.js.map
