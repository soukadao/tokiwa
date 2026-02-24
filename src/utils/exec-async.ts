import {
  type ExecFileOptions,
  type ExecOptions,
  exec,
  execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { InvalidArgumentError } from "../core/index.js";

const DEFAULT_ENCODING: BufferEncoding = "utf8";
const SHELL_EXEC_DISABLED_MESSAGE =
  "Shell execution is disabled. Pass { allowShell: true } to execAsync.";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecAsyncOptions extends ExecOptions {
  allowShell?: boolean;
}

const execAsyncRaw = promisify(exec);
const execFileAsyncRaw = promisify(execFile);

const normalizeOutput = (value: string | Buffer | undefined): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value) {
    return value.toString(DEFAULT_ENCODING);
  }
  return "";
};

/**
 * NOTE: Executes through a shell. Prefer execFileAsync when possible.
 * allowShell を明示しない限り実行されません。
 */
export const execAsync = async (
  command: string,
  options: ExecAsyncOptions = {},
): Promise<ExecResult> => {
  if (!options.allowShell) {
    throw new InvalidArgumentError(SHELL_EXEC_DISABLED_MESSAGE);
  }
  const { allowShell: _allowShell, ...execOptions } = options;
  const { stdout, stderr } = await execAsyncRaw(command, {
    encoding: DEFAULT_ENCODING,
    ...execOptions,
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};

/**
 * シェルを介さずにファイルを直接実行する
 * @param file 実行するファイルパス
 * @param args コマンドライン引数
 * @param options 実行オプション
 * @returns 標準出力と標準エラー出力
 */
export const execFileAsync = async (
  file: string,
  args: readonly string[] = [],
  options: ExecFileOptions = {},
): Promise<ExecResult> => {
  const { stdout, stderr } = await execFileAsyncRaw(file, args, {
    encoding: DEFAULT_ENCODING,
    ...options,
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};
