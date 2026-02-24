import { promises as fs, type Stats } from "node:fs";
import { dirname, resolve } from "node:path";
import { SerializationError } from "./errors.js";

const DEFAULT_ENCODING: BufferEncoding = "utf8";
const DEFAULT_JSON_INDENT = 2;
const JSON_LINE_ENDING = "\n";

export interface FileSystemOptions {
  baseDir?: string;
}

/**
 * ファイルシステム操作のラッパークラス
 * baseDirを基準としたパス解決とテキスト/JSON/ディレクトリ操作を提供する
 */
export class FileSystem {
  private readonly baseDir: string | null;

  /**
   * @param options ベースディレクトリ等のオプション
   */
  constructor(options: FileSystemOptions = {}) {
    this.baseDir = options.baseDir ?? null;
  }

  /**
   * baseDirを基準にパスを解決する
   * @param path 相対パスまたは絶対パス
   * @returns 解決済みのパス
   */
  resolvePath(path: string): string {
    return this.baseDir ? resolve(this.baseDir, path) : path;
  }

  /**
   * テキストファイルを読み込む
   * @param path ファイルパス
   * @returns ファイルの内容
   */
  async readText(path: string): Promise<string> {
    return fs.readFile(this.resolvePath(path), { encoding: DEFAULT_ENCODING });
  }

  /**
   * テキストファイルに書き込む。親ディレクトリがなければ自動作成する
   * @param path ファイルパス
   * @param contents 書き込む内容
   */
  async writeText(path: string, contents: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, contents, { encoding: DEFAULT_ENCODING });
  }

  /**
   * テキストファイルに追記する。親ディレクトリがなければ自動作成する
   * @param path ファイルパス
   * @param contents 追記する内容
   */
  async appendText(path: string, contents: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, contents, { encoding: DEFAULT_ENCODING });
  }

  /**
   * JSONファイルを読み込みパースする
   * @param path ファイルパス
   * @returns パースされたオブジェクト
   * @throws {SerializationError} JSONパースに失敗した場合
   */
  async readJson<T = unknown>(path: string): Promise<T> {
    const text = await this.readText(path);
    try {
      return JSON.parse(text) as T;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SerializationError(
        `Failed to parse JSON at ${path}: ${message}`,
      );
    }
  }

  /**
   * 値をJSON形式でファイルに書き込む
   * @param path ファイルパス
   * @param value 書き込む値
   * @param indent インデント幅（デフォルト: 2）
   * @throws {SerializationError} JSONシリアライズに失敗した場合
   */
  async writeJson(
    path: string,
    value: unknown,
    indent: number = DEFAULT_JSON_INDENT,
  ): Promise<void> {
    const json = JSON.stringify(value, null, indent);
    if (json === undefined) {
      throw new SerializationError(`Value is not JSON serializable: ${path}`);
    }
    await this.writeText(path, `${json}${JSON_LINE_ENDING}`);
  }

  /**
   * ディレクトリを作成する。既に存在する場合は何もしない
   * @param path ディレクトリパス
   */
  async ensureDir(path: string): Promise<void> {
    await fs.mkdir(this.resolvePath(path), { recursive: true });
  }

  /**
   * ファイルまたはディレクトリが存在するか確認する
   * @param path パス
   * @returns 存在すればtrue
   */
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ファイルまたはディレクトリの情報を取得する
   * @param path パス
   * @returns ファイルステータス
   */
  async stat(path: string): Promise<Stats> {
    return fs.stat(this.resolvePath(path));
  }

  /**
   * ディレクトリ内のエントリ一覧を取得する
   * @param path ディレクトリパス
   * @returns ファイル名の配列
   */
  async listDir(path: string): Promise<string[]> {
    return fs.readdir(this.resolvePath(path));
  }

  /**
   * ファイルまたはディレクトリを再帰的に削除する
   * @param path 削除対象のパス
   */
  async remove(path: string): Promise<void> {
    await fs.rm(this.resolvePath(path), { recursive: true, force: true });
  }
}
