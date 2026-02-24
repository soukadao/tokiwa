/**
 * 外部コマンドを実行し、標準出力を返す
 * シェルを介さず安全にコマンドを実行する
 * @param command 実行するコマンド
 * @param args コマンドライン引数
 * @returns 標準出力の文字列
 * @throws {RuntimeError} コマンドの実行に失敗した場合
 */
export declare const execCommand: (command: string, args?: readonly string[]) => Promise<string>;
