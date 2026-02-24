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
var NotFoundError = class extends AppError {
};
var ConflictError = class extends AppError {
};
var StateError = class extends AppError {
};
var DependencyError = class extends AppError {
};
var CyclicDependencyError = class extends DependencyError {
};
var SerializationError = class extends AppError {
};

// src/core/config.ts
var NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
var BOOLEAN_TRUE_VALUES = /* @__PURE__ */ new Set(["true", "1", "yes", "on"]);
var BOOLEAN_FALSE_VALUES = /* @__PURE__ */ new Set(["false", "0", "no", "off"]);
var EMPTY_PREFIX = "";
var Config = class {
  store = /* @__PURE__ */ new Map();
  /**
   * 設定値を保存する
   * @param key 設定キー
   * @param value 設定値
   */
  set(key, value) {
    this.store.set(key, value);
  }
  /**
   * 設定値を取得する
   * @param key 設定キー
   * @returns 設定値。キーが存在しない場合はundefined
   */
  get(key) {
    return this.store.get(key);
  }
  /**
   * 指定キーが存在するか確認する
   * @param key 設定キー
   * @returns キーが存在すればtrue
   */
  has(key) {
    return this.store.has(key);
  }
  /**
   * 指定キーの設定値を削除する
   * @param key 設定キー
   * @returns キーが存在して削除されたらtrue
   */
  delete(key) {
    return this.store.delete(key);
  }
  /** すべての設定値をクリアする */
  clear() {
    this.store.clear();
  }
  /**
   * 環境変数から設定を読み込む
   * prefixで絞り込み、数値・真偽値の自動パースが可能
   * @param options 読み込みオプション
   */
  loadFromEnv(options = {}) {
    const prefix = options.prefix ?? EMPTY_PREFIX;
    const parseNumbers = options.parseNumbers ?? true;
    const parseBooleans = options.parseBooleans ?? true;
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(prefix) || value === void 0) {
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
  getString(key, fallback) {
    const value = this.get(key);
    if (value === void 0) {
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
  getNumber(key, fallback) {
    const value = this.get(key);
    if (value === void 0) {
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
  getBoolean(key, fallback) {
    const value = this.get(key);
    if (value === void 0) {
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
  getRequired(key) {
    const value = this.get(key);
    if (value === void 0) {
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
  parseEnvValue(value, parseNumbers, parseBooleans) {
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
};
var createConfig = () => new Config();

// src/core/database-adapter.ts
var DISCONNECTED_MESSAGE = "Database is not connected";
var DatabaseAdapter = class {
  type;
  driver;
  connected = false;
  /**
   * @param options データベースの種類とドライバー設定
   */
  constructor(options) {
    this.type = options.type;
    this.driver = options.driver;
  }
  /** データベースが接続中かどうかを返す */
  get isConnected() {
    return this.connected;
  }
  /** データベースに接続する。既に接続済みの場合は何もしない */
  async connect() {
    if (this.connected) {
      return;
    }
    await this.driver.connect();
    this.connected = true;
  }
  /** データベースから切断する。既に切断済みの場合は何もしない */
  async disconnect() {
    if (!this.connected) {
      return;
    }
    await this.driver.disconnect();
    this.connected = false;
  }
  /**
   * SQLクエリを実行する
   * @param sql SQL文
   * @param params バインドパラメータ
   * @returns クエリ結果
   * @throws {StateError} 未接続の場合
   */
  async query(sql, params = []) {
    if (!this.connected) {
      throw new StateError(DISCONNECTED_MESSAGE);
    }
    return this.driver.query(sql, params);
  }
};

// src/core/file-system.ts
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
var DEFAULT_ENCODING = "utf8";
var DEFAULT_JSON_INDENT = 2;
var JSON_LINE_ENDING = "\n";
var FileSystem = class {
  baseDir;
  /**
   * @param options ベースディレクトリ等のオプション
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir ?? null;
  }
  /**
   * baseDirを基準にパスを解決する
   * @param path 相対パスまたは絶対パス
   * @returns 解決済みのパス
   */
  resolvePath(path) {
    return this.baseDir ? resolve(this.baseDir, path) : path;
  }
  /**
   * テキストファイルを読み込む
   * @param path ファイルパス
   * @returns ファイルの内容
   */
  async readText(path) {
    return fs.readFile(this.resolvePath(path), { encoding: DEFAULT_ENCODING });
  }
  /**
   * テキストファイルに書き込む。親ディレクトリがなければ自動作成する
   * @param path ファイルパス
   * @param contents 書き込む内容
   */
  async writeText(path, contents) {
    const fullPath = this.resolvePath(path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, contents, { encoding: DEFAULT_ENCODING });
  }
  /**
   * テキストファイルに追記する。親ディレクトリがなければ自動作成する
   * @param path ファイルパス
   * @param contents 追記する内容
   */
  async appendText(path, contents) {
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
  async readJson(path) {
    const text = await this.readText(path);
    try {
      return JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SerializationError(
        `Failed to parse JSON at ${path}: ${message}`
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
  async writeJson(path, value, indent = DEFAULT_JSON_INDENT) {
    const json = JSON.stringify(value, null, indent);
    if (json === void 0) {
      throw new SerializationError(`Value is not JSON serializable: ${path}`);
    }
    await this.writeText(path, `${json}${JSON_LINE_ENDING}`);
  }
  /**
   * ディレクトリを作成する。既に存在する場合は何もしない
   * @param path ディレクトリパス
   */
  async ensureDir(path) {
    await fs.mkdir(this.resolvePath(path), { recursive: true });
  }
  /**
   * ファイルまたはディレクトリが存在するか確認する
   * @param path パス
   * @returns 存在すればtrue
   */
  async exists(path) {
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
  async stat(path) {
    return fs.stat(this.resolvePath(path));
  }
  /**
   * ディレクトリ内のエントリ一覧を取得する
   * @param path ディレクトリパス
   * @returns ファイル名の配列
   */
  async listDir(path) {
    return fs.readdir(this.resolvePath(path));
  }
  /**
   * ファイルまたはディレクトリを再帰的に削除する
   * @param path 削除対象のパス
   */
  async remove(path) {
    await fs.rm(this.resolvePath(path), { recursive: true, force: true });
  }
};

// src/core/generate-id.ts
import { randomUUID } from "node:crypto";
function generateId() {
  return randomUUID();
}

// src/core/logger.ts
var LOG_LEVEL = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7
};
var DEFAULT_LOG_LEVEL = "info";
var UNSERIALIZABLE_PLACEHOLDER = "[Unserializable]";
var LEVEL_METHOD_MAP = {
  emergency: "error",
  alert: "error",
  critical: "error",
  error: "error",
  warning: "warn",
  notice: "info",
  info: "info",
  debug: "debug"
};
var safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return UNSERIALIZABLE_PLACEHOLDER;
  }
};
var createDefaultSink = () => {
  return (entry) => {
    const method = LEVEL_METHOD_MAP[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const contextText = entry.context ? ` ${safeStringify(entry.context)}` : "";
    console[method](
      `[${timestamp}] ${entry.level}: ${entry.message}${contextText}`
    );
  };
};
var Logger = class {
  level = DEFAULT_LOG_LEVEL;
  levelValue = LOG_LEVEL[DEFAULT_LOG_LEVEL];
  sink = createDefaultSink();
  /**
   * @param options ログレベルやシンクの設定
   */
  constructor(options = {}) {
    if (options.level) {
      this.setLevel(options.level);
    }
    if (options.sink) {
      this.setSink(options.sink);
    }
  }
  /**
   * ログレベルを変更する
   * @param level 新しいログレベル
   */
  setLevel(level) {
    this.level = level;
    this.levelValue = LOG_LEVEL[level];
  }
  /**
   * 現在のログレベルを返す
   * @returns 現在のログレベル
   */
  getLevel() {
    return this.level;
  }
  /**
   * ログ出力先（シンク）を変更する
   * @param sink 新しいログシンク
   */
  setSink(sink) {
    this.sink = sink;
  }
  /**
   * 指定レベルでログを記録する。現在のレベル以下の場合のみ出力される
   * @param level ログレベル
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  log(level, message, context) {
    if (LOG_LEVEL[level] > this.levelValue) {
      return;
    }
    this.sink({ level, message, timestamp: /* @__PURE__ */ new Date(), context });
  }
  /**
   * emergencyレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  emergency(message, context) {
    this.log("emergency", message, context);
  }
  /**
   * alertレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  alert(message, context) {
    this.log("alert", message, context);
  }
  /**
   * criticalレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  critical(message, context) {
    this.log("critical", message, context);
  }
  /**
   * errorレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  error(message, context) {
    this.log("error", message, context);
  }
  /**
   * warningレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  warning(message, context) {
    this.log("warning", message, context);
  }
  /**
   * noticeレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  notice(message, context) {
    this.log("notice", message, context);
  }
  /**
   * infoレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  info(message, context) {
    this.log("info", message, context);
  }
  /**
   * debugレベルのログを記録する
   * @param message ログメッセージ
   * @param context 追加のコンテキスト情報
   */
  debug(message, context) {
    this.log("debug", message, context);
  }
};
var createLogger = (options = {}) => new Logger(options);
export {
  AppError,
  Config,
  ConflictError,
  CyclicDependencyError,
  DatabaseAdapter,
  DependencyError,
  FileSystem,
  InvalidArgumentError,
  LOG_LEVEL,
  Logger,
  NotFoundError,
  RuntimeError,
  SerializationError,
  StateError,
  createConfig,
  createLogger,
  generateId
};
//# sourceMappingURL=index.js.map
