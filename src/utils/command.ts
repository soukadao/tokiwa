import { RuntimeError } from "../core/index.js";
import { execFileAsync } from "./exec-async.js";

const formatCommand = (command: string, args: readonly string[]): string =>
  [command, ...args].join(" ");

type ExecError = Error & { stderr?: string | Buffer; code?: number };

const isExecError = (error: unknown): error is ExecError =>
  error instanceof Error && ("stderr" in error || "code" in error);

/**
 * 外部コマンドを実行し、標準出力を返す
 * シェルを介さず安全にコマンドを実行する
 * @param command 実行するコマンド
 * @param args コマンドライン引数
 * @returns 標準出力の文字列
 * @throws {RuntimeError} コマンドの実行に失敗した場合
 */
export const execCommand = async (
  command: string,
  args: readonly string[] = [],
): Promise<string> => {
  const commandText = formatCommand(command, args);

  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout;
  } catch (error: unknown) {
    if (isExecError(error)) {
      const stderr =
        typeof error.stderr === "string"
          ? error.stderr
          : (error.stderr?.toString() ?? "");

      throw new RuntimeError(
        `Command failed: ${commandText}\nExit code: ${error.code}\n${stderr}`,
      );
    }

    throw new RuntimeError(`Command failed: ${commandText}\n${error}`);
  }
};
