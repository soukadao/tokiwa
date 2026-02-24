import { type ExecFileOptions, type ExecOptions } from "node:child_process";
export interface ExecResult {
    stdout: string;
    stderr: string;
}
export interface ExecAsyncOptions extends ExecOptions {
    allowShell?: boolean;
}
/**
 * NOTE: Executes through a shell. Prefer execFileAsync when possible.
 * allowShell を明示しない限り実行されません。
 */
export declare const execAsync: (command: string, options?: ExecAsyncOptions) => Promise<ExecResult>;
/**
 * シェルを介さずにファイルを直接実行する
 * @param file 実行するファイルパス
 * @param args コマンドライン引数
 * @param options 実行オプション
 * @returns 標準出力と標準エラー出力
 */
export declare const execFileAsync: (file: string, args?: readonly string[], options?: ExecFileOptions) => Promise<ExecResult>;
