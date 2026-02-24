import { InvalidArgumentError } from "./errors.js";

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "off"]);
const EMPTY_PREFIX = "";

export interface EnvLoadOptions {
  prefix?: string;
  parseNumbers?: boolean;
  parseBooleans?: boolean;
}

/**
 * キーバリュー形式の設定ストア
 * 環境変数からの読み込みや型安全な値取得をサポートする
 */
export class Config {
  private readonly store = new Map<string, unknown>();

  /**
   * 設定値を保存する
   * @param key 設定キー
   * @param value 設定値
   */
  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  /**
   * 設定値を取得する
   * @param key 設定キー
   * @returns 設定値。キーが存在しない場合はundefined
   */
  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  /**
   * 指定キーが存在するか確認する
   * @param key 設定キー
   * @returns キーが存在すればtrue
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * 指定キーの設定値を削除する
   * @param key 設定キー
   * @returns キーが存在して削除されたらtrue
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** すべての設定値をクリアする */
  clear(): void {
    this.store.clear();
  }

  /**
   * 環境変数から設定を読み込む
   * prefixで絞り込み、数値・真偽値の自動パースが可能
   * @param options 読み込みオプション
   */
  loadFromEnv(options: EnvLoadOptions = {}): void {
    const prefix = options.prefix ?? EMPTY_PREFIX;
    const parseNumbers = options.parseNumbers ?? true;
    const parseBooleans = options.parseBooleans ?? true;

    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(prefix) || value === undefined) {
        continue;
      }

      const normalizedKey = prefix ? key.slice(prefix.length) : key;
      const parsed = this.parseEnvValue(value, parseNumbers, parseBooleans);
      this.set(normalizedKey, parsed);
    }
  }

  /**
   * 文字列型として設定値を取得する
   * @param key 設定キー
   * @param fallback キーが存在しない場合のデフォルト値
   * @returns 文字列値。キーが存在せずfallbackもない場合はundefined
   * @throws {InvalidArgumentError} 値が文字列でない場合
   */
  getString(key: string, fallback?: string): string | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "string") {
      return value;
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a string`);
  }

  /**
   * 数値型として設定値を取得する
   * @param key 設定キー
   * @param fallback キーが存在しない場合のデフォルト値
   * @returns 数値。キーが存在せずfallbackもない場合はundefined
   * @throws {InvalidArgumentError} 値が数値に変換できない場合
   */
  getNumber(key: string, fallback?: number): number | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && NUMBER_PATTERN.test(value)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a number`);
  }

  /**
   * 真偽値型として設定値を取得する
   * 文字列の場合、"true"/"1"/"yes"/"on"はtrue、"false"/"0"/"no"/"off"はfalseとして扱う
   * @param key 設定キー
   * @param fallback キーが存在しない場合のデフォルト値
   * @returns 真偽値。キーが存在せずfallbackもない場合はundefined
   * @throws {InvalidArgumentError} 値が真偽値に変換できない場合
   */
  getBoolean(key: string, fallback?: boolean): boolean | undefined {
    const value = this.get<unknown>(key);
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (BOOLEAN_TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (BOOLEAN_FALSE_VALUES.has(normalized)) {
        return false;
      }
    }
    throw new InvalidArgumentError(`Config value for ${key} is not a boolean`);
  }

  /**
   * 必須の設定値を取得する
   * @param key 設定キー
   * @returns 設定値
   * @throws {InvalidArgumentError} キーが存在しない場合
   */
  getRequired<T>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new InvalidArgumentError(`Missing required config value: ${key}`);
    }
    return value;
  }

  /**
   * 環境変数の文字列値を適切な型にパースする
   * @param value 環境変数の文字列値
   * @param parseNumbers 数値パースを有効にするか
   * @param parseBooleans 真偽値パースを有効にするか
   * @returns パースされた値
   */
  private parseEnvValue(
    value: string,
    parseNumbers: boolean,
    parseBooleans: boolean,
  ): string | number | boolean {
    if (parseBooleans) {
      const normalized = value.toLowerCase();
      if (BOOLEAN_TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (BOOLEAN_FALSE_VALUES.has(normalized)) {
        return false;
      }
    }

    if (parseNumbers && NUMBER_PATTERN.test(value)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return value;
  }
}
/**
 * 新しいConfigインスタンスを生成するファクトリ関数
 * @returns 新しいConfigインスタンス
 */
export const createConfig = (): Config => new Config();
