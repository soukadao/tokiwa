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

// src/cron/cron.ts
var CRON_FIELD_SPECS = [
  { key: "minute", min: 0, max: 59 },
  { key: "hour", min: 0, max: 23 },
  { key: "dayOfMonth", min: 1, max: 31 },
  { key: "month", min: 1, max: 12 },
  { key: "dayOfWeek", min: 0, max: 6 }
];
var CRON_FIELD_COUNT = CRON_FIELD_SPECS.length;
var BASE_10 = 10;
var MIN_STEP_VALUE = 1;
var DEFAULT_RANGE_STEP = 1;
var NEXT_MINUTE_INCREMENT = 1;
var NEXT_HOUR_INCREMENT = 1;
var NEXT_DAY_INCREMENT = 1;
var NEXT_YEAR_INCREMENT = 1;
var MONTH_OFFSET = 1;
var RESET_HOURS = 0;
var RESET_MINUTES = 0;
var RESET_SECONDS = 0;
var RESET_MILLISECONDS = 0;
var LOOKAHEAD_YEARS = 4;
var DAYS_PER_YEAR = 365;
var HOURS_PER_DAY = 24;
var MINUTES_PER_HOUR = 60;
var CRON_MAX_ITERATIONS = LOOKAHEAD_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR;
var Cron = class _Cron {
  static MAX_ITERATIONS = CRON_MAX_ITERATIONS;
  fields;
  /**
   * @param expression minute hour dayOfMonth month dayOfWeek
   */
  constructor(expression) {
    this.fields = this.parse(expression);
  }
  /**
   * 5フィールドのcron式をパースし、CronFieldsオブジェクトに変換する。
   * @param expression スペース区切りのcron式文字列
   * @returns パース済みのCronFieldsオブジェクト
   */
  parse(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== CRON_FIELD_COUNT) {
      throw new InvalidArgumentError(
        "Cron expression must have exactly 5 fields"
      );
    }
    const fields = {
      minute: [],
      hour: [],
      dayOfMonth: [],
      month: [],
      dayOfWeek: []
    };
    CRON_FIELD_SPECS.forEach((spec, index) => {
      fields[spec.key] = this.parseField(parts[index], spec.min, spec.max);
    });
    return fields;
  }
  /**
   * 単一フィールドをパースする。ワイルドカード(*)、範囲、ステップ、カンマ区切りに対応する。
   * @param field パース対象のフィールド文字列
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @returns ソート済みの許容値配列
   */
  parseField(field, min, max) {
    if (field === "*") {
      return this.buildRange(min, max);
    }
    const values = /* @__PURE__ */ new Set();
    const parts = field.split(",");
    for (const part of parts) {
      this.parseFieldPart(part, min, max, values);
    }
    return this.sortedValues(values);
  }
  /**
   * カンマ区切りフィールドの1パートをパースし、値をセットに追加する。
   * ステップ式(/)、範囲式(-)、単一値のいずれかを処理する。
   * @param part パース対象のパート文字列
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @param values パース結果を格納するセット
   */
  parseFieldPart(part, min, max, values) {
    if (part.includes("/")) {
      const [range, step] = part.split("/");
      const stepValue = this.parseStepValue(step);
      const { start, end } = this.parseStepRange(range, min, max);
      this.addRange(values, start, end, stepValue, min, max);
      return;
    }
    if (part.includes("-")) {
      const [start, end] = part.split("-");
      const startValue = parseInt(start, BASE_10);
      const endValue = parseInt(end, BASE_10);
      if (Number.isNaN(startValue) || Number.isNaN(endValue)) {
        throw new InvalidArgumentError(`Invalid range: ${part}`);
      }
      if (startValue < min || endValue > max || startValue > endValue) {
        throw new InvalidArgumentError(`Range out of bounds: ${part}`);
      }
      this.addRange(values, startValue, endValue, DEFAULT_RANGE_STEP, min, max);
      return;
    }
    const value = parseInt(part, BASE_10);
    if (Number.isNaN(value)) {
      throw new InvalidArgumentError(`Invalid value: ${part}`);
    }
    if (value < min || value > max) {
      throw new InvalidArgumentError(
        `Value out of bounds: ${value} (must be between ${min} and ${max})`
      );
    }
    values.add(value);
  }
  /**
   * ステップ値をパースし、有効な正の整数であることを検証する。
   * @param step ステップ値の文字列
   * @returns パース済みのステップ値
   * @throws {InvalidArgumentError} ステップ値が無効または1未満の場合
   */
  parseStepValue(step) {
    const stepValue = parseInt(step, BASE_10);
    if (Number.isNaN(stepValue) || stepValue < MIN_STEP_VALUE) {
      throw new InvalidArgumentError(`Invalid step value: ${step}`);
    }
    return stepValue;
  }
  /**
   * ステップ式の範囲部分をパースする。*(全範囲)、数値-数値(明示範囲)、単一数値(開始値のみ)に対応する。
   * @param range 範囲文字列（例: "*", "1-5", "3"）
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   * @returns 開始値と終了値を含むオブジェクト
   */
  parseStepRange(range, min, max) {
    if (range === "*") {
      return { start: min, end: max };
    }
    if (range.includes("-")) {
      const [start, end] = range.split("-");
      const startValue = this.parseBoundedValue(start, min, max, range);
      const endValue = this.parseBoundedValue(end, min, max, range);
      if (startValue > endValue) {
        throw new InvalidArgumentError(`Range out of bounds: ${range}`);
      }
      return { start: startValue, end: endValue };
    }
    return {
      start: this.parseBoundedValue(range, min, max, range),
      end: max
    };
  }
  /**
   * 整数値をパースし、指定された範囲内であることを検証する。
   * @param value パース対象の文字列
   * @param min 許容される最小値
   * @param max 許容される最大値
   * @param label エラーメッセージ用のラベル文字列
   * @returns パース済みの整数値
   * @throws {InvalidArgumentError} 値が無効または範囲外の場合
   */
  parseBoundedValue(value, min, max, label) {
    const parsed = parseInt(value, BASE_10);
    if (Number.isNaN(parsed)) {
      throw new InvalidArgumentError(`Invalid range: ${label}`);
    }
    if (parsed < min || parsed > max) {
      throw new InvalidArgumentError(`Range out of bounds: ${label}`);
    }
    return parsed;
  }
  /**
   * 指定されたステップ間隔で範囲内の値をセットに追加する。
   * @param values 値を追加するセット
   * @param start 範囲の開始値
   * @param end 範囲の終了値
   * @param step ステップ間隔
   * @param min フィールドの最小許容値
   * @param max フィールドの最大許容値
   */
  addRange(values, start, end, step, min, max) {
    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) {
        values.add(i);
      }
    }
  }
  /**
   * 最小値から最大値までの連続した整数配列を生成する。
   * @param min 範囲の開始値
   * @param max 範囲の終了値
   * @returns 連続した整数の配列
   */
  buildRange(min, max) {
    const values = [];
    for (let i = min; i <= max; i++) {
      values.push(i);
    }
    return values;
  }
  /**
   * セットを昇順にソートされた配列に変換する。
   * @param values 変換対象のセット
   * @returns ソート済みの数値配列
   */
  sortedValues(values) {
    return Array.from(values).sort((a, b) => a - b);
  }
  /**
   * Returns true when the date matches the cron fields.
   */
  matches(date) {
    return this.fields.minute.includes(date.getMinutes()) && this.fields.hour.includes(date.getHours()) && this.fields.dayOfMonth.includes(date.getDate()) && this.fields.month.includes(date.getMonth() + MONTH_OFFSET) && this.fields.dayOfWeek.includes(date.getDay());
  }
  /**
   * Returns the next execution time after the given date.
   * Seconds and milliseconds are cleared before searching.
   */
  getNextExecution(after = /* @__PURE__ */ new Date()) {
    const next = new Date(after);
    next.setSeconds(RESET_SECONDS, RESET_MILLISECONDS);
    next.setMinutes(next.getMinutes() + NEXT_MINUTE_INCREMENT);
    let iterations = 0;
    while (iterations < _Cron.MAX_ITERATIONS) {
      const month = next.getMonth() + MONTH_OFFSET;
      if (!this.fields.month.includes(month)) {
        const { value, carry } = this.nextAllowedValue(
          this.fields.month,
          month
        );
        if (carry) {
          next.setFullYear(next.getFullYear() + NEXT_YEAR_INCREMENT);
        }
        next.setMonth(value - MONTH_OFFSET, 1);
        next.setHours(
          RESET_HOURS,
          RESET_MINUTES,
          RESET_SECONDS,
          RESET_MILLISECONDS
        );
        iterations++;
        continue;
      }
      if (!this.matchesDay(next)) {
        next.setDate(next.getDate() + NEXT_DAY_INCREMENT);
        next.setHours(
          RESET_HOURS,
          RESET_MINUTES,
          RESET_SECONDS,
          RESET_MILLISECONDS
        );
        iterations++;
        continue;
      }
      const hour = next.getHours();
      if (!this.fields.hour.includes(hour)) {
        const { value, carry } = this.nextAllowedValue(this.fields.hour, hour);
        if (carry) {
          next.setDate(next.getDate() + NEXT_DAY_INCREMENT);
        }
        next.setHours(value, RESET_MINUTES, RESET_SECONDS, RESET_MILLISECONDS);
        iterations++;
        continue;
      }
      const minute = next.getMinutes();
      if (!this.fields.minute.includes(minute)) {
        const { value, carry } = this.nextAllowedValue(
          this.fields.minute,
          minute
        );
        if (carry) {
          next.setHours(
            next.getHours() + NEXT_HOUR_INCREMENT,
            value,
            RESET_SECONDS,
            RESET_MILLISECONDS
          );
        } else {
          next.setMinutes(value, RESET_SECONDS, RESET_MILLISECONDS);
        }
        iterations++;
        continue;
      }
      return next;
    }
    if (iterations >= _Cron.MAX_ITERATIONS) {
      throw new RuntimeError(
        `Could not find next execution time within ${LOOKAHEAD_YEARS} years`
      );
    }
    return next;
  }
  /**
   * Returns a shallow copy of the parsed fields.
   */
  getFields() {
    return { ...this.fields };
  }
  /**
   * 指定された日付がdayOfMonthとdayOfWeekの両方に一致するか判定する。
   * @param date 判定対象の日付
   * @returns 両フィールドに一致する場合true
   */
  matchesDay(date) {
    return this.fields.dayOfMonth.includes(date.getDate()) && this.fields.dayOfWeek.includes(date.getDay());
  }
  /**
   * ソート済みリストから現在値以上の次の許容値を探す。
   * 現在値以上の値が見つからない場合、リストの先頭に戻りキャリーフラグをtrueにする。
   * @param values ソート済みの許容値リスト
   * @param current 現在の値
   * @returns 次の許容値とキャリーフラグを含むオブジェクト
   */
  nextAllowedValue(values, current) {
    for (const value of values) {
      if (value >= current) {
        return { value, carry: false };
      }
    }
    return { value: values[0], carry: true };
  }
};

// src/cron/leader-scheduler.ts
var DEFAULT_LOCK_KEY = "tokiwa:locks:cron";
var DEFAULT_LOCK_TTL_MS = 6e4;
var DEFAULT_REFRESH_INTERVAL_MS = 2e4;
var DEFAULT_RETRY_INTERVAL_MS = 5e3;
var LeaderScheduler = class {
  scheduler;
  lock;
  lockKey;
  lockTtlMs;
  refreshIntervalMs;
  retryIntervalMs;
  running = false;
  leaderHandle = null;
  refreshTimer = null;
  retryTimer = null;
  schedulerStarted = false;
  /**
   * スケジューラー、ロック、タイミングオプションで初期化する。
   * @param options スケジューラー、ロック、およびタイミング設定を含むオプション
   */
  constructor(options) {
    this.scheduler = options.scheduler;
    this.lock = options.lock;
    this.lockKey = options.lockKey ?? DEFAULT_LOCK_KEY;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  }
  /**
   * リーダー選出を開始する。ロックの取得を試み、成功すればスケジューラーを起動する。
   */
  async start() {
    if (this.running) {
      return;
    }
    this.running = true;
    await this.tryAcquire();
  }
  /**
   * スケジューラーを停止し、リーダーシップを解放する。
   */
  async stop() {
    this.running = false;
    this.clearRetry();
    await this.stopLeader();
  }
  /**
   * 内部スケジューラーにジョブを追加する。
   * @param id ジョブの一意識別子
   * @param cronExpression cron式文字列
   * @param handler ジョブ実行時に呼び出されるハンドラー
   * @param name ジョブの表示名（省略可）
   */
  addJob(id, cronExpression, handler, name) {
    this.scheduler.addJob(id, cronExpression, handler, name);
  }
  /**
   * 内部スケジューラーからジョブを削除する。
   * @param id 削除対象のジョブID
   * @returns ジョブが存在し削除された場合true
   */
  removeJob(id) {
    return this.scheduler.removeJob(id);
  }
  /**
   * 指定されたIDのジョブが登録されているか確認する。
   * @param id 確認対象のジョブID
   * @returns ジョブが登録されている場合true
   */
  isJobScheduled(id) {
    return this.scheduler.isJobScheduled(id);
  }
  /**
   * リーダーシップロックの取得を試みる。取得成功時はリーダーとして起動し、失敗時はリトライをスケジュールする。
   */
  async tryAcquire() {
    if (!this.running) {
      return;
    }
    const handle = await this.lock.acquire(this.lockKey, {
      ttlMs: this.lockTtlMs
    });
    if (!handle) {
      this.scheduleRetry();
      return;
    }
    this.leaderHandle = handle;
    this.startLeader();
  }
  /**
   * 内部スケジューラーを起動し、ロックのリフレッシュタイマーを開始する。
   */
  startLeader() {
    if (this.schedulerStarted) {
      return;
    }
    this.scheduler.start();
    this.schedulerStarted = true;
    if (this.refreshIntervalMs > 0 && this.lock.refresh) {
      this.refreshTimer = setInterval(() => {
        void this.refresh();
      }, this.refreshIntervalMs);
    }
  }
  /**
   * ロックのTTLをリフレッシュする。リフレッシュに失敗した場合は降格処理を行う。
   */
  async refresh() {
    if (!this.leaderHandle || !this.lock.refresh) {
      return;
    }
    const ok = await this.lock.refresh(this.leaderHandle, this.lockTtlMs);
    if (!ok) {
      await this.demote();
    }
  }
  /**
   * リーダーシップを放棄する。スケジューラーを停止し、ロックを解放した後、リーダーシップの再取得を試みる。
   */
  async demote() {
    if (!this.leaderHandle) {
      return;
    }
    const handle = this.leaderHandle;
    this.leaderHandle = null;
    this.stopRefresh();
    if (this.schedulerStarted) {
      await this.scheduler.stop();
      this.schedulerStarted = false;
    }
    await this.lock.release(handle);
    if (this.running) {
      this.scheduleRetry();
    }
  }
  /**
   * ロック取得のリトライをretryIntervalMs後にスケジュールする。
   */
  scheduleRetry() {
    if (!this.running) {
      return;
    }
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      void this.tryAcquire();
    }, this.retryIntervalMs);
  }
  /**
   * リトライタイマーをクリアする。
   */
  clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  /**
   * リフレッシュタイマーをクリアする。
   */
  stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  /**
   * スケジューラーを停止し、ロックを解放してリーダーシップを終了する。
   */
  async stopLeader() {
    this.stopRefresh();
    if (this.schedulerStarted) {
      await this.scheduler.stop();
      this.schedulerStarted = false;
    }
    if (this.leaderHandle) {
      await this.lock.release(this.leaderHandle);
      this.leaderHandle = null;
    }
  }
};

// src/cron/scheduler.ts
var MILLISECONDS_PER_SECOND = 1e3;
var SECONDS_PER_MINUTE = 60;
var MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
var DEFAULT_CHECK_INTERVAL_MS = MILLISECONDS_PER_MINUTE;
var MIN_CHECK_INTERVAL_MS = 1;
var RESET_SECONDS2 = 0;
var RESET_MILLISECONDS2 = 0;
var NEXT_MINUTE_INCREMENT2 = 1;
var Scheduler = class _Scheduler {
  jobs = /* @__PURE__ */ new Map();
  timerId = null;
  isRunning = false;
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS;
  logger;
  inFlight = /* @__PURE__ */ new Set();
  lastRunKeyByJob = /* @__PURE__ */ new Map();
  /**
   * @param options Default is minute boundary scheduling.
   */
  constructor(options = {}) {
    if (typeof options === "number") {
      this.checkIntervalMs = options;
      this.logger = new Logger({ level: "error" });
    } else {
      this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
      this.logger = options.logger ?? new Logger({ level: "error" });
    }
    this.checkIntervalMs = Math.max(
      MIN_CHECK_INTERVAL_MS,
      this.checkIntervalMs
    );
  }
  /**
   * Adds or replaces a job by id.
   */
  addJob(id, cronExpression, handler, name) {
    const cron = new Cron(cronExpression);
    const job = { id, cron, handler, name };
    this.jobs.set(id, job);
    this.lastRunKeyByJob.delete(id);
  }
  /**
   * Removes a job by id.
   */
  removeJob(id) {
    this.lastRunKeyByJob.delete(id);
    return this.jobs.delete(id);
  }
  /**
   * Returns a job by id, if present.
   */
  getJob(id) {
    return this.jobs.get(id);
  }
  /**
   * Returns all registered jobs.
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }
  /**
   * Starts scheduling if not already running.
   */
  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.scheduleNextCheck();
  }
  /**
   * Stops scheduling and clears the pending timer.
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    this.clearTimer();
    await this.waitForInFlight();
  }
  /**
   * 次のタイマーティックをスケジュールする。
   * デフォルト間隔の場合は次の分境界まで、それ以外はcheckIntervalMsで待機する。
   */
  scheduleNextCheck() {
    if (!this.isRunning) {
      return;
    }
    const delay = this.checkIntervalMs === DEFAULT_CHECK_INTERVAL_MS ? _Scheduler.getDelayUntilNextMinute(/* @__PURE__ */ new Date()) : this.checkIntervalMs;
    this.timerId = setTimeout(this.handleTick, delay);
  }
  /**
   * タイマーコールバック。ジョブの実行チェックを行い、次のティックを再スケジュールする。
   */
  handleTick = () => {
    void this.checkAndExecuteJobs();
    this.scheduleNextCheck();
  };
  /**
   * 全ジョブを現在時刻と照合し、一致するジョブを実行する。
   * 同一分内での重複実行を防止するためミニットキーで管理する。
   */
  async checkAndExecuteJobs() {
    const now = /* @__PURE__ */ new Date();
    const minuteKey = _Scheduler.buildMinuteKey(now);
    const tasks = [];
    for (const job of this.jobs.values()) {
      if (!job.cron.matches(now)) {
        continue;
      }
      if (this.lastRunKeyByJob.get(job.id) === minuteKey) {
        continue;
      }
      this.lastRunKeyByJob.set(job.id, minuteKey);
      tasks.push(this.runJob(job));
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }
  /**
   * 保留中のsetTimeoutタイマーをクリアする。
   */
  clearTimer() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
  /**
   * ジョブのハンドラーを実行し、エラー発生時はログに記録する。
   * 実行中のジョブはinFlightセットで追跡される。
   * @param job 実行対象のジョブ
   * @returns ジョブ完了を表すPromise
   */
  runJob(job) {
    const task = (async () => {
      try {
        await job.handler();
      } catch (error) {
        this.logger.error(`Error executing job ${job.id}`, {
          jobId: job.id,
          name: job.name,
          error
        });
      }
    })();
    this.inFlight.add(task);
    task.finally(() => {
      this.inFlight.delete(task);
    });
    return task;
  }
  /**
   * 実行中の全ジョブが完了するまで待機する。
   */
  async waitForInFlight() {
    if (this.inFlight.size === 0) {
      return;
    }
    await Promise.allSettled(this.inFlight);
  }
  /**
   * 現在時刻から次の分境界までのミリ秒数を計算する。
   * @param now 現在時刻
   * @returns 次の分境界までのミリ秒数
   */
  static getDelayUntilNextMinute(now) {
    const nextMinute = new Date(now);
    nextMinute.setSeconds(RESET_SECONDS2, RESET_MILLISECONDS2);
    nextMinute.setMinutes(nextMinute.getMinutes() + NEXT_MINUTE_INCREMENT2);
    return nextMinute.getTime() - now.getTime();
  }
  /**
   * 指定された日時から分単位の一意キーを生成する。重複実行防止に使用される。
   * @param date キー生成対象の日時
   * @returns "年-月-日-時-分" 形式の文字列キー
   */
  static buildMinuteKey(date) {
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ].join("-");
  }
  /**
   * Returns the next execution time for a job, or null if missing.
   */
  getNextExecutionTime(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    return job.cron.getNextExecution();
  }
  /**
   * Returns true when a job id is registered.
   */
  isJobScheduled(jobId) {
    return this.jobs.has(jobId);
  }
};

// src/orchestrator/connection.ts
var Connection = class {
  id;
  name;
  state = "disconnected";
  metadata;
  /**
   * 接続を生成する。初期状態は"disconnected"となる。
   *
   * @param init - 接続の初期化パラメータ（名前とメタデータ）
   */
  constructor(init = {}) {
    this.id = generateId();
    this.name = init.name;
    this.metadata = init.metadata ?? {};
  }
  /**
   * 接続状態を"connected"に設定する。
   */
  connect() {
    this.state = "connected";
  }
  /**
   * 接続状態を"disconnected"に設定する。
   */
  disconnect() {
    this.state = "disconnected";
  }
  /**
   * 現在の接続状態を返す。
   *
   * @returns 現在の接続状態（"connected" または "disconnected"）
   */
  getState() {
    return this.state;
  }
  /**
   * メタデータをマージして更新する。既存のキーは上書きされる。
   *
   * @param update - マージするメタデータのキーと値のペア
   */
  updateMetadata(update) {
    this.metadata = { ...this.metadata, ...update };
  }
  /**
   * メタデータのシャローコピーを返す。
   *
   * @returns メタデータオブジェクトの浅いコピー
   */
  getMetadata() {
    return { ...this.metadata };
  }
};

// src/orchestrator/event.ts
var Event = class _Event {
  id;
  type;
  payload;
  timestamp;
  metadata;
  /**
   * EventInitからイベントを生成する。typeが空文字列の場合はエラーをスローする。
   *
   * @param init - イベントの初期化パラメータ
   * @throws {InvalidArgumentError} typeが空文字列の場合
   */
  constructor(init) {
    if (!init.type || init.type.trim().length === 0) {
      throw new InvalidArgumentError("Event type must be a non-empty string");
    }
    this.id = generateId();
    this.type = init.type;
    this.payload = init.payload;
    this.timestamp = init.timestamp ?? /* @__PURE__ */ new Date();
    this.metadata = init.metadata ?? {};
  }
  /**
   * イベントを生成するファクトリメソッド。型、ペイロード、メタデータを指定してイベントを作成する。
   *
   * @template TPayload - イベントのペイロードの型
   * @param type - イベントの種別を示す文字列
   * @param payload - イベントに付随するデータ
   * @param metadata - イベントのメタデータ（相関ID、原因ID、ソース、タグなど）
   * @returns 新しいEventインスタンス
   */
  static create(type, payload, metadata) {
    return new _Event({ type, payload, metadata });
  }
};

// src/orchestrator/subscriber.ts
var Subscriber = class {
  /** サブスクライバーの一意な識別子 */
  id;
  /** 購読対象のイベントタイプ */
  type;
  /** サブスクライバーの名前（デバッグ用途） */
  name;
  /** 一度だけ実行して自動登録解除するかどうか */
  once;
  /** イベントフィルター関数 */
  filter;
  /** イベントハンドラー関数 */
  handler;
  /**
   * 新しいサブスクライバーを作成する。
   * @param type - 購読するイベントタイプ（空文字列は不可）
   * @param handler - イベント受信時に呼び出されるハンドラー関数
   * @param options - サブスクライバーのオプション設定
   * @throws {InvalidArgumentError} タイプが空文字列の場合
   */
  constructor(type, handler, options = {}) {
    if (!type || type.trim().length === 0) {
      throw new InvalidArgumentError(
        "Subscriber type must be a non-empty string"
      );
    }
    this.id = generateId();
    this.type = type;
    this.name = options.name;
    this.once = options.once ?? false;
    this.filter = options.filter;
    this.handler = handler;
  }
};

// src/orchestrator/event-dispatcher.ts
var EventDispatcher = class {
  /** イベントタイプごとのサブスクライバーセット */
  subscribersByType = /* @__PURE__ */ new Map();
  /** サブスクライバーIDによるサブスクライバーのマップ */
  subscribersById = /* @__PURE__ */ new Map();
  /**
   * 指定されたイベントタイプに対して新しいハンドラーを登録する。
   * @param type - 購読するイベントタイプ（`*` でワイルドカード購読可能）
   * @param handler - イベント受信時に呼び出されるハンドラー関数
   * @param options - サブスクライバーのオプション設定（名前、一回限り、フィルターなど）
   * @returns 作成された {@link Subscriber} インスタンス
   */
  subscribe(type, handler, options = {}) {
    const subscriber = new Subscriber(type, handler, options);
    const bucket = this.subscribersByType.get(type) ?? /* @__PURE__ */ new Set();
    bucket.add(subscriber);
    this.subscribersByType.set(type, bucket);
    this.subscribersById.set(subscriber.id, subscriber);
    return subscriber;
  }
  /**
   * 指定されたIDのサブスクライバーを登録解除する。
   * @param subscriberId - 登録解除するサブスクライバーのID
   * @returns 登録解除に成功した場合は `true`、該当するサブスクライバーが見つからない場合は `false`
   */
  unsubscribe(subscriberId) {
    const subscriber = this.subscribersById.get(subscriberId);
    if (!subscriber) {
      return false;
    }
    this.subscribersById.delete(subscriberId);
    const bucket = this.subscribersByType.get(subscriber.type);
    if (bucket) {
      bucket.delete(subscriber);
      if (bucket.size === 0) {
        this.subscribersByType.delete(subscriber.type);
      }
    }
    return true;
  }
  /**
   * サブスクライバーをすべて、または指定したタイプのものだけクリアする。
   * @param type - クリア対象のイベントタイプ。省略時はすべてのサブスクライバーを削除する。
   */
  clear(type) {
    if (!type) {
      this.subscribersByType.clear();
      this.subscribersById.clear();
      return;
    }
    const bucket = this.subscribersByType.get(type);
    if (!bucket) {
      return;
    }
    for (const subscriber of bucket) {
      this.subscribersById.delete(subscriber.id);
    }
    this.subscribersByType.delete(type);
  }
  /**
   * 指定されたIDのサブスクライバーを取得する。
   * @param subscriberId - 取得するサブスクライバーのID
   * @returns 該当する {@link Subscriber}、見つからない場合は `undefined`
   */
  getSubscriber(subscriberId) {
    return this.subscribersById.get(subscriberId);
  }
  /**
   * すべてのサブスクライバー、または指定したタイプのサブスクライバー一覧を取得する。
   * @param type - フィルタリングするイベントタイプ。省略時はすべてのサブスクライバーを返す。
   * @returns サブスクライバーの配列
   */
  getSubscribers(type) {
    if (type) {
      return Array.from(this.subscribersByType.get(type) ?? []);
    }
    return Array.from(this.subscribersById.values());
  }
  /**
   * イベントをマッチするサブスクライバーにディスパッチする。
   * 直接一致するタイプのサブスクライバーとワイルドカード（`*`）サブスクライバーの両方に配信する。
   * フィルターやハンドラーで発生したエラーは収集され、結果に含まれる。
   * `once` フラグが設定されたサブスクライバーは実行後に自動的に登録解除される。
   * @param event - ディスパッチするイベント
   * @returns 配信数とエラー情報を含む {@link DispatchResult}
   */
  async dispatch(event) {
    const targets = /* @__PURE__ */ new Set();
    const direct = this.subscribersByType.get(event.type);
    const wildcard = this.subscribersByType.get("*");
    if (direct) {
      for (const subscriber of direct) {
        targets.add(subscriber);
      }
    }
    if (wildcard) {
      for (const subscriber of wildcard) {
        targets.add(subscriber);
      }
    }
    const errors = [];
    let delivered = 0;
    for (const subscriber of targets) {
      let executed = false;
      if (subscriber.filter) {
        try {
          if (!subscriber.filter(event)) {
            continue;
          }
        } catch (error) {
          errors.push({
            subscriberId: subscriber.id,
            error: error instanceof Error ? error : new RuntimeError(String(error), { cause: error }),
            stage: "filter"
          });
          continue;
        }
      }
      try {
        executed = true;
        const context = {
          subscriberId: subscriber.id,
          dispatcher: this,
          eventType: event.type
        };
        await subscriber.handler(event, context);
        delivered += 1;
      } catch (error) {
        errors.push({
          subscriberId: subscriber.id,
          error: error instanceof Error ? error : new RuntimeError(String(error), { cause: error }),
          stage: "handler"
        });
      } finally {
        if (subscriber.once && executed) {
          this.unsubscribe(subscriber.id);
        }
      }
    }
    return { event, delivered, errors };
  }
};

// src/orchestrator/notification.ts
var Notification = class {
  id;
  level;
  message;
  timestamp;
  data;
  event;
  /**
   * NotificationInitから通知を生成する。レベルが未指定の場合は"info"がデフォルトとなる。
   *
   * @param init - 通知の初期化パラメータ
   */
  constructor(init) {
    this.id = generateId();
    this.level = init.level ?? "info";
    this.message = init.message;
    this.timestamp = init.timestamp ?? /* @__PURE__ */ new Date();
    this.data = init.data;
    this.event = init.event;
  }
};

// src/workflow/run-store.ts
var stringifyCause = (cause) => {
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
};
var toErrorInfo = (error) => {
  const base = {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
  const cause = error.cause;
  if (cause instanceof Error) {
    return { ...base, cause: toErrorInfo(cause) };
  }
  if (cause !== void 0) {
    return { ...base, cause: stringifyCause(cause) };
  }
  return base;
};
var serializeTimelineEntry = (entry) => {
  switch (entry.type) {
    case "run_start":
      return {
        type: entry.type,
        timestamp: entry.timestamp.toISOString()
      };
    case "run_complete":
      return {
        type: entry.type,
        timestamp: entry.timestamp.toISOString(),
        status: entry.status,
        durationMs: entry.durationMs
      };
    case "node_start":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt
      };
    case "node_complete":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        durationMs: entry.durationMs,
        attempt: entry.attempt
      };
    case "node_retry":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt,
        nextDelayMs: entry.nextDelayMs,
        error: toErrorInfo(entry.error)
      };
    case "node_error":
      return {
        type: entry.type,
        nodeId: entry.nodeId,
        timestamp: entry.timestamp.toISOString(),
        attempt: entry.attempt,
        error: toErrorInfo(entry.error)
      };
  }
};
var toRunRecord = (result) => {
  const errors = {};
  for (const [nodeId, error] of Object.entries(result.errors)) {
    errors[nodeId] = toErrorInfo(error);
  }
  return {
    runId: result.runId,
    workflowId: result.workflowId,
    status: result.status,
    startedAt: result.startedAt.toISOString(),
    finishedAt: result.finishedAt.toISOString(),
    durationMs: result.durationMs,
    results: result.results,
    errors,
    attempts: result.attempts,
    timeline: result.timeline.map(serializeTimelineEntry),
    conversationId: result.conversationId,
    memory: result.memory
  };
};
var InMemoryRunStore = class {
  store = /* @__PURE__ */ new Map();
  /**
   * レコードをインメモリストアに保存する。
   *
   * 同じ runId のレコードが既に存在する場合は上書きされる。
   *
   * @param record - 保存するワークフロー実行レコード
   */
  async save(record) {
    this.store.set(record.runId, record);
  }
  /**
   * 指定された runId に対応するレコードを取得する。
   *
   * @param runId - 取得対象の実行ID
   * @returns 該当するレコード。存在しない場合は undefined
   */
  async get(runId) {
    return this.store.get(runId);
  }
  /**
   * 保存されているレコードの一覧を返す。
   *
   * workflowId によるフィルタリングや、limit による件数制限が可能。
   *
   * @param options - フィルタリングおよび件数制限のオプション
   * @returns 条件に一致するレコードの配列
   */
  async list(options = {}) {
    const records = Array.from(this.store.values());
    const filtered = options.workflowId ? records.filter((record) => record.workflowId === options.workflowId) : records;
    if (options.limit && options.limit > 0) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }
};
var DEFAULT_RUNS_DIRECTORY = "runs";
var RUN_FILE_EXTENSION = ".json";
var FileRunStore = class {
  directory;
  fs;
  constructor(options = {}) {
    this.directory = options.directory ?? DEFAULT_RUNS_DIRECTORY;
    this.fs = options.fileSystem ?? new FileSystem();
  }
  /**
   * レコードを JSON ファイルとして保存する。
   *
   * ファイル名は runId に基づいて自動生成される。
   *
   * @param record - 保存するワークフロー実行レコード
   */
  async save(record) {
    const path = this.pathFor(record.runId);
    await this.fs.writeJson(path, record);
  }
  /**
   * 指定された runId に対応するレコードを JSON ファイルから読み込む。
   *
   * ファイルが存在しない場合は undefined を返す。
   *
   * @param runId - 取得対象の実行ID
   * @returns 該当するレコード。ファイルが存在しない場合は undefined
   */
  async get(runId) {
    const path = this.pathFor(runId);
    if (!await this.fs.exists(path)) {
      return void 0;
    }
    return this.fs.readJson(path);
  }
  /**
   * ディレクトリ内の JSON ファイルからレコードの一覧を読み込む。
   *
   * workflowId によるフィルタリングや、limit による件数制限が可能。
   * ディレクトリが存在しない場合は空配列を返す。
   *
   * @param options - フィルタリングおよび件数制限のオプション
   * @returns 条件に一致するレコードの配列
   */
  async list(options = {}) {
    if (!await this.fs.exists(this.directory)) {
      return [];
    }
    const names = await this.fs.listDir(this.directory);
    const records = [];
    for (const name of names) {
      if (!name.endsWith(RUN_FILE_EXTENSION)) {
        continue;
      }
      const record = await this.fs.readJson(
        this.joinPath(name)
      );
      if (options.workflowId && record.workflowId !== options.workflowId) {
        continue;
      }
      records.push(record);
      if (options.limit && options.limit > 0 && records.length >= options.limit) {
        break;
      }
    }
    return records;
  }
  /**
   * 指定された runId に対応するファイルパスを生成する。
   *
   * @param runId - 実行ID
   * @returns JSON ファイルのフルパス
   */
  pathFor(runId) {
    return this.joinPath(`${runId}${RUN_FILE_EXTENSION}`);
  }
  /**
   * ディレクトリとファイル名を結合してパスを生成する。
   *
   * @param fileName - ファイル名
   * @returns 結合されたファイルパス
   */
  joinPath(fileName) {
    return `${this.directory}/${fileName}`;
  }
};

// src/workflow/runner.ts
var MIN_CONCURRENCY = 1;
var DEFAULT_CONCURRENCY = 4;
var DEFAULT_CHATFLOW_CONCURRENCY = 1;
var DEFAULT_FAIL_FAST = true;
var MIN_RETRY_ATTEMPTS = 1;
var MIN_BACKOFF_MULTIPLIER = 1;
var MIN_DELAY_MS = 0;
var DEFAULT_RETRY_MAX_ATTEMPTS = 1;
var DEFAULT_RETRY_INITIAL_DELAY_MS = 1e3;
var DEFAULT_RETRY_BACKOFF_MULTIPLIER = 2;
var DEFAULT_RETRY_MAX_DELAY_MS = 3e4;
var DEFAULT_RETRY_JITTER_MS = 0;
var CHATFLOW_REQUIRES_CONVERSATION_ID = "Chatflow requires conversationId to run.";
var ABORT_ERROR_NAME = "AbortError";
var ABORT_ERROR_MESSAGE = "Workflow aborted";
var createAbortError = (cause) => {
  const error = cause ? new Error(ABORT_ERROR_MESSAGE, { cause }) : new Error(ABORT_ERROR_MESSAGE);
  error.name = ABORT_ERROR_NAME;
  return error;
};
var resolveAbortError = (reason) => reason instanceof Error ? reason : createAbortError(reason);
var isAbortError = (error) => error instanceof Error && error.name === ABORT_ERROR_NAME;
var throwIfAborted = (signal) => {
  if (!signal?.aborted) {
    return;
  }
  throw resolveAbortError(signal.reason);
};
var withAbort = async (promise, signal) => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw resolveAbortError(signal.reason);
  }
  return new Promise((resolve2, reject) => {
    const onAbort = () => {
      cleanup();
      reject(resolveAbortError(signal.reason));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve2(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
};
var sleep = (ms, signal) => new Promise((resolve2, reject) => {
  if (signal?.aborted) {
    reject(resolveAbortError(signal.reason));
    return;
  }
  let timeoutId;
  let onAbort;
  const cleanup = () => {
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  };
  onAbort = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    cleanup();
    reject(resolveAbortError(signal?.reason));
  };
  timeoutId = setTimeout(() => {
    cleanup();
    resolve2();
  }, ms);
  if (!signal) {
    return;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }
});
var resolveRetryPolicy = (policy) => ({
  maxAttempts: Math.max(
    MIN_RETRY_ATTEMPTS,
    policy?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS
  ),
  initialDelayMs: Math.max(
    MIN_DELAY_MS,
    policy?.initialDelayMs ?? DEFAULT_RETRY_INITIAL_DELAY_MS
  ),
  backoffMultiplier: Math.max(
    MIN_BACKOFF_MULTIPLIER,
    policy?.backoffMultiplier ?? DEFAULT_RETRY_BACKOFF_MULTIPLIER
  ),
  maxDelayMs: Math.max(
    MIN_DELAY_MS,
    policy?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
  ),
  jitterMs: Math.max(MIN_DELAY_MS, policy?.jitterMs ?? DEFAULT_RETRY_JITTER_MS)
});
var computeRetryDelayMs = (attempt, policy) => {
  if (policy.maxAttempts <= 1) {
    return 0;
  }
  const exponentialDelay = policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1);
  const boundedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
  if (policy.jitterMs <= 0) {
    return boundedDelay;
  }
  return boundedDelay + Math.random() * policy.jitterMs;
};
var cloneMemory = (memory) => structuredClone(memory);
var Runner = class {
  /**
   * ワークフローを実行し、すべてのノードを依存関係の順序に従って処理する。
   *
   * 依存関係のないノードから順に、設定された同時実行数（concurrency）の範囲内で
   * 並列にノードを実行する。`failFast` が有効な場合、いずれかのノードでエラーが
   * 発生した時点で残りの実行を中断する。chatflow タイプのワークフローでは
   * `conversationId` が必須となり、同時実行数のデフォルトは 1 となる。
   *
   * @typeParam Context - ワークフロー全体で共有されるコンテキストの型
   * @typeParam Input - ワークフローへの入力データの型
   * @param workflow - 実行対象のワークフロー定義
   * @param options - 実行オプション（入力値、コンテキスト、同時実行数、コールバック等）
   * @returns 実行結果（ステータス、各ノードの結果・エラー、タイムライン等を含む）
   * @throws {InvalidArgumentError} chatflow タイプで conversationId が未指定の場合
   * @throws {DependencyError} ノードが存在しない依存先を参照している場合
   * @throws {CyclicDependencyError} ワークフローに循環依存が含まれている場合
   */
  async run(workflow, options = {}) {
    const runId = generateId();
    const startedAt = /* @__PURE__ */ new Date();
    const results = {};
    const errors = {};
    const attempts = {};
    const timeline = [
      { type: "run_start", timestamp: startedAt }
    ];
    const abortController = new AbortController();
    const signal = abortController.signal;
    const abortRun = (cause) => {
      if (signal.aborted) {
        return;
      }
      abortController.abort(createAbortError(cause));
    };
    const dependencies = /* @__PURE__ */ new Map();
    const dependents = /* @__PURE__ */ new Map();
    const nodes = workflow.getNodes();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const chatflow = workflow.type === "chatflow";
    if (chatflow && (!options.conversationId || options.conversationId.trim().length === 0)) {
      throw new InvalidArgumentError(CHATFLOW_REQUIRES_CONVERSATION_ID);
    }
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (!nodeIds.has(dep)) {
          throw new DependencyError(
            `Node ${node.id} depends on missing node: ${dep}`
          );
        }
      }
    }
    for (const node of nodes) {
      dependencies.set(node.id, new Set(node.dependsOn));
      dependents.set(node.id, /* @__PURE__ */ new Set());
    }
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        const bucket = dependents.get(dep);
        if (bucket) {
          bucket.add(node.id);
        }
      }
    }
    const ready = nodes.filter(
      (node) => (dependencies.get(node.id)?.size ?? 0) === 0
    );
    const concurrency = Math.max(
      MIN_CONCURRENCY,
      options.concurrency ?? (chatflow ? DEFAULT_CHATFLOW_CONCURRENCY : DEFAULT_CONCURRENCY)
    );
    const failFast = options.failFast ?? DEFAULT_FAIL_FAST;
    let memoryState = options.memory ? cloneMemory(options.memory) : chatflow ? {} : void 0;
    const getMemory = () => memoryState;
    const setMemory = (next) => {
      if (!memoryState) {
        memoryState = {};
      }
      for (const key of Object.keys(memoryState)) {
        delete memoryState[key];
      }
      Object.assign(memoryState, next);
    };
    const updateMemory = (patch) => {
      if (!memoryState) {
        memoryState = {};
      }
      Object.assign(memoryState, patch);
    };
    let aborted = false;
    let completedCount = 0;
    const inFlight = /* @__PURE__ */ new Set();
    const scheduleNode = (node) => {
      const task = this.runNode(
        node,
        workflow,
        runId,
        options,
        results,
        errors,
        attempts,
        timeline,
        options.conversationId,
        signal,
        memoryState,
        getMemory,
        setMemory,
        updateMemory
      ).then(() => {
        if (aborted) {
          return;
        }
        const downstream = dependents.get(node.id);
        if (!downstream) {
          return;
        }
        for (const dependentId of downstream) {
          const deps = dependencies.get(dependentId);
          if (!deps) {
            continue;
          }
          deps.delete(node.id);
          if (deps.size === 0) {
            const dependentNode = workflow.getNode(dependentId);
            if (dependentNode) {
              ready.push(dependentNode);
            }
          }
        }
      }).catch((error) => {
        if (failFast) {
          aborted = true;
          abortRun(error);
        }
      }).finally(() => {
        completedCount += 1;
        inFlight.delete(task);
      });
      inFlight.add(task);
    };
    while (ready.length > 0 || inFlight.size > 0) {
      while (!aborted && ready.length > 0 && inFlight.size < concurrency) {
        const node = ready.shift();
        if (!node) {
          break;
        }
        scheduleNode(node);
      }
      if (inFlight.size === 0) {
        break;
      }
      await Promise.race(inFlight);
    }
    const finishedAt = /* @__PURE__ */ new Date();
    const status = Object.keys(errors).length > 0 ? "failed" : "succeeded";
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    timeline.push({
      type: "run_complete",
      timestamp: finishedAt,
      status,
      durationMs
    });
    if (status === "succeeded" && completedCount < nodes.length) {
      throw new CyclicDependencyError("Workflow contains a cyclic dependency");
    }
    return {
      runId,
      workflowId: workflow.id,
      status,
      startedAt,
      finishedAt,
      durationMs,
      results,
      errors,
      attempts,
      timeline,
      conversationId: options.conversationId,
      memory: memoryState
    };
  }
  /**
   * 単一ノードをリトライポリシーに基づいて実行する。
   *
   * ノードのハンドラを呼び出し、成功した場合は結果を `results` に格納する。
   * 失敗した場合はリトライポリシー（最大試行回数、指数バックオフ、ジッター）に
   * 従って再試行を行う。すべての試行が失敗した場合、またはアボートシグナルを
   * 受信した場合はエラーをスローする。各段階でタイムラインエントリの記録と
   * コールバックの呼び出しを行う。
   *
   * @typeParam Context - ワークフロー全体で共有されるコンテキストの型
   * @typeParam Input - ワークフローへの入力データの型
   * @param node - 実行対象のノード
   * @param workflow - ノードが属するワークフロー定義
   * @param runId - 今回の実行を識別する一意の ID
   * @param options - ワークフロー実行オプション（コールバック等を含む）
   * @param results - 各ノードの実行結果を格納する共有オブジェクト
   * @param errors - 各ノードのエラーを格納する共有オブジェクト
   * @param attempts - 各ノードの試行回数を格納する共有オブジェクト
   * @param timeline - 実行タイムラインのエントリ配列
   * @param conversationId - 会話 ID（chatflow の場合に使用）
   * @param signal - 中断を検知するための AbortSignal
   * @param memory - 会話メモリの現在の状態
   * @param getMemory - 会話メモリを取得する関数
   * @param setMemory - 会話メモリを置き換える関数
   * @param updateMemory - 会話メモリを部分更新する関数
   * @throws ノードの全リトライが失敗した場合、またはアボートされた場合にエラーをスローする
   */
  async runNode(node, workflow, runId, options, results, errors, attempts, timeline, conversationId, signal, memory, getMemory, setMemory, updateMemory) {
    const policy = resolveRetryPolicy(node.retry);
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        throwIfAborted(signal);
        attempts[node.id] = attempt;
        const nodeStart = /* @__PURE__ */ new Date();
        timeline.push({
          type: "node_start",
          nodeId: node.id,
          timestamp: nodeStart,
          attempt
        });
        if (options.onNodeStart) {
          await options.onNodeStart(node);
        }
        throwIfAborted(signal);
        const output = await withAbort(
          Promise.resolve(
            node.handler({
              workflowId: workflow.id,
              nodeId: node.id,
              runId,
              conversationId,
              context: options.context,
              input: options.input,
              event: options.event,
              results,
              getResult: (nodeId) => results[nodeId],
              memory,
              getMemory,
              setMemory,
              updateMemory,
              signal
            })
          ),
          signal
        );
        results[node.id] = output;
        if (options.onNodeComplete) {
          await options.onNodeComplete(node, output);
        }
        const nodeFinish = /* @__PURE__ */ new Date();
        timeline.push({
          type: "node_complete",
          nodeId: node.id,
          timestamp: nodeFinish,
          durationMs: nodeFinish.getTime() - nodeStart.getTime(),
          attempt
        });
        return;
      } catch (error) {
        const err = error instanceof Error ? error : new RuntimeError(String(error), { cause: error });
        if (isAbortError(err)) {
          errors[node.id] = err;
          timeline.push({
            type: "node_error",
            nodeId: node.id,
            timestamp: /* @__PURE__ */ new Date(),
            attempt,
            error: err
          });
          if (options.onNodeError) {
            await options.onNodeError(node, err);
          }
          throw err;
        }
        if (attempt >= policy.maxAttempts) {
          errors[node.id] = err;
          timeline.push({
            type: "node_error",
            nodeId: node.id,
            timestamp: /* @__PURE__ */ new Date(),
            attempt,
            error: err
          });
          if (options.onNodeError) {
            await options.onNodeError(node, err);
          }
          throw err;
        }
        const nextDelayMs = computeRetryDelayMs(attempt, policy);
        timeline.push({
          type: "node_retry",
          nodeId: node.id,
          timestamp: /* @__PURE__ */ new Date(),
          attempt,
          nextDelayMs,
          error: err
        });
        if (options.onNodeRetry) {
          await options.onNodeRetry(node, err, attempt, nextDelayMs);
        }
        if (nextDelayMs > 0) {
          try {
            await sleep(nextDelayMs, signal);
          } catch (sleepError) {
            const sleepErr = sleepError instanceof Error ? sleepError : new RuntimeError(String(sleepError), { cause: sleepError });
            if (isAbortError(sleepErr)) {
              errors[node.id] = sleepErr;
              timeline.push({
                type: "node_error",
                nodeId: node.id,
                timestamp: /* @__PURE__ */ new Date(),
                attempt,
                error: sleepErr
              });
              if (options.onNodeError) {
                await options.onNodeError(node, sleepErr);
              }
            }
            throw sleepErr;
          }
        }
      }
    }
  }
};

// src/orchestrator/queue.ts
var COMPACT_AFTER_DEQUEUE_COUNT = 50;
var COMPACT_RATIO = 2;
var Queue = class {
  /** キューに格納されたイベントの配列 */
  items = [];
  /** 次にデキューされるイベントのインデックス */
  head = 0;
  /**
   * イベントをキューの末尾に追加する。
   * @param event - キューに追加するイベント
   */
  enqueue(event) {
    this.items.push(event);
  }
  /**
   * キューの先頭からイベントを取り出して返す。
   * デキュー回数が閾値を超え、かつ使用済み領域が全体の半分以上を占める場合に自動コンパクションを実行する。
   * @returns 取り出したイベント。キューが空の場合は `undefined`。
   */
  dequeue() {
    if (this.head >= this.items.length) {
      return void 0;
    }
    const event = this.items[this.head];
    this.head += 1;
    if (this.head > COMPACT_AFTER_DEQUEUE_COUNT && this.head * COMPACT_RATIO > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return event;
  }
  /**
   * キューの先頭のイベントを取り出さずに参照する。
   * @returns 先頭のイベント。キューが空の場合は `undefined`。
   */
  peek() {
    return this.items[this.head];
  }
  /**
   * キュー内の未処理イベント数を返す。
   * @returns 未処理のイベント数
   */
  size() {
    return this.items.length - this.head;
  }
  /**
   * キュー内のすべてのイベントを削除する。
   */
  clear() {
    this.items.length = 0;
    this.head = 0;
  }
  /**
   * キュー内のすべての未処理イベントを配列として返す。キューの状態は変更しない。
   * @returns 未処理イベントの配列
   */
  list() {
    return this.items.slice(this.head);
  }
  /**
   * キュー内のすべての未処理イベントを取り出して返し、キューを空にする。
   * @returns 取り出されたすべての未処理イベントの配列
   */
  drain() {
    const drained = this.items.slice(this.head);
    this.items.length = 0;
    this.head = 0;
    return drained;
  }
};

// src/orchestrator/snapshot.ts
var Snapshot = class {
  /** オーケストレーターが実行中かどうか */
  isRunning;
  /** オーケストレーターの動作モード */
  mode;
  /** キュー内の未処理イベント数 */
  queueSize;
  /** メトリクス情報 */
  metrics;
  /** スナップショット取得時刻 */
  timestamp;
  /**
   * 初期化パラメータからスナップショットを作成する。
   * @param init - スナップショットの初期化パラメータ
   */
  constructor(init) {
    this.isRunning = init.isRunning;
    this.mode = init.mode ?? "all";
    this.queueSize = init.queueSize;
    this.metrics = init.metrics;
    this.timestamp = init.timestamp ?? /* @__PURE__ */ new Date();
  }
};

// src/orchestrator/orchestrator.ts
var MIN_CONCURRENCY2 = 1;
var DEFAULT_MAX_CONCURRENT_EVENTS = 1;
var DEFAULT_WORKFLOW_CONCURRENCY = 2;
var DEFAULT_MODE = "all";
var DEFAULT_ACK_POLICY = "always";
var DEFAULT_CONVERSATION_LOCK_TTL_MS = 6e4;
var DEFAULT_CONVERSATION_LOCK_REFRESH_MS = 2e4;
var DEFAULT_CONVERSATION_LOCK_RETRY_COUNT = 10;
var DEFAULT_CONVERSATION_LOCK_RETRY_DELAY_MS = 200;
var DEFAULT_CONVERSATION_LOCK_KEY_PREFIX = "tokiwa:locks:conversation";
var MISSING_SCHEDULER_MESSAGE = "Cron scheduler is not configured. Provide OrchestratorOptions.scheduler.";
var MISSING_WORKER_MODE_MESSAGE = "Drain is not available in producer mode.";
var MISSING_CONVERSATION_STORE_MESSAGE = "Conversation store is not configured. Provide OrchestratorOptions.conversationStore.";
var CHATFLOW_REQUIRES_CONVERSATION_ID2 = "Chatflow requires conversationId to run.";
var CHATFLOW_CRON_UNSUPPORTED = "Chatflow workflows cannot be scheduled by cron.";
var CONVERSATION_LOCK_FAILED = "Failed to acquire conversation lock for chatflow.";
var Orchestrator = class {
  dispatcher;
  queue;
  runner;
  workflows = /* @__PURE__ */ new Map();
  eventWorkflowIndex = /* @__PURE__ */ new Map();
  wildcardEventWorkflows = /* @__PURE__ */ new Set();
  regexEventWorkflows = /* @__PURE__ */ new Set();
  maxConcurrentEvents;
  workflowConcurrency;
  mode;
  ackPolicy;
  scheduler;
  onWorkflowError;
  conversationStore;
  conversationLock;
  conversationLockTtlMs;
  conversationLockRefreshMs;
  conversationLockRetryCount;
  conversationLockRetryDelayMs;
  conversationLockKeyPrefix;
  runStore;
  onRunStoreError;
  conversationLocks = /* @__PURE__ */ new Map();
  isRunning = false;
  processing = null;
  metrics = {
    published: 0,
    processed: 0,
    dispatchErrors: 0,
    workflowRuns: 0,
    workflowErrors: 0
  };
  /**
   * オーケストレーターを初期化する。
   *
   * 同時実行数、動作モード、ack ポリシー、会話ストア、分散ロック、実行ストアなどのオプションを設定する。
   *
   * @param options - オーケストレーターの設定オプション
   */
  constructor(options = {}) {
    this.dispatcher = new EventDispatcher();
    this.queue = options.queue ?? new Queue();
    this.runner = new Runner();
    this.maxConcurrentEvents = Math.max(
      MIN_CONCURRENCY2,
      options.maxConcurrentEvents ?? DEFAULT_MAX_CONCURRENT_EVENTS
    );
    this.workflowConcurrency = Math.max(
      MIN_CONCURRENCY2,
      options.workflowConcurrency ?? DEFAULT_WORKFLOW_CONCURRENCY
    );
    this.mode = options.mode ?? DEFAULT_MODE;
    this.ackPolicy = options.ackPolicy ?? DEFAULT_ACK_POLICY;
    this.scheduler = options.scheduler;
    this.onWorkflowError = options.onWorkflowError;
    this.conversationStore = options.conversationStore;
    this.conversationLock = options.conversationLock;
    this.conversationLockTtlMs = options.conversationLockTtlMs ?? DEFAULT_CONVERSATION_LOCK_TTL_MS;
    this.conversationLockRefreshMs = options.conversationLockRefreshMs ?? DEFAULT_CONVERSATION_LOCK_REFRESH_MS;
    this.conversationLockRetryCount = options.conversationLockRetryCount ?? DEFAULT_CONVERSATION_LOCK_RETRY_COUNT;
    this.conversationLockRetryDelayMs = options.conversationLockRetryDelayMs ?? DEFAULT_CONVERSATION_LOCK_RETRY_DELAY_MS;
    this.conversationLockKeyPrefix = options.conversationLockKeyPrefix ?? DEFAULT_CONVERSATION_LOCK_KEY_PREFIX;
    this.runStore = options.runStore;
    this.onRunStoreError = options.onRunStoreError;
  }
  /**
   * オーケストレーターを開始する。
   *
   * 動作モードに応じてスケジューラーの起動やワーカーループの開始を行う。
   * 既に起動中の場合は何もしない。
   */
  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    if (this.shouldStartScheduler()) {
      void Promise.resolve(this.scheduler?.start()).catch(() => {
      });
    }
    if (this.isWorkerMode()) {
      void this.kick();
    }
  }
  /**
   * オーケストレーターを正常に停止する。
   *
   * 実行中の処理の完了を待機し、スケジューラーを停止する。
   */
  async stop() {
    this.isRunning = false;
    if (this.scheduler && this.shouldStartScheduler()) {
      await this.scheduler.stop();
    }
    if (this.processing) {
      await this.processing;
    }
  }
  /**
   * 新しいイベントを作成してキューに追加する。
   *
   * @param type - イベントタイプ
   * @param payload - イベントのペイロード
   * @param metadata - イベントのメタデータ
   * @returns 作成されたイベント
   */
  publish(type, payload, metadata) {
    const event = Event.create(type, payload, metadata);
    this.enqueue(event);
    return event;
  }
  /**
   * 既存のイベントをキューに追加する。
   *
   * オーケストレーターが起動中かつワーカーモードの場合、キュー処理を自動的にトリガーする。
   *
   * @param event - キューに追加するイベント
   */
  enqueue(event) {
    void Promise.resolve(this.queue.enqueue(event)).catch(() => {
    });
    this.metrics.published += 1;
    if (this.isRunning && this.isWorkerMode()) {
      void this.kick();
    }
  }
  /**
   * キューに溜まった全イベントを同期的に処理する。
   *
   * ワーカーモードでのみ使用可能。プロデューサーモードでは {@link StateError} をスローする。
   *
   * @throws {StateError} プロデューサーモードで呼び出された場合
   */
  async drain() {
    if (!this.isWorkerMode()) {
      throw new StateError(MISSING_WORKER_MODE_MESSAGE);
    }
    await this.kick(true);
  }
  /**
   * ワークフローをトリガーとともに登録する。
   *
   * 同じIDのワークフローが既に登録されている場合は {@link ConflictError} をスローする。
   *
   * @param workflow - 登録するワークフロー
   * @param trigger - ワークフローのトリガー条件（デフォルトは手動トリガー）
   * @param options - ワークフロー実行時のオプション
   * @throws {ConflictError} 同じIDのワークフローが既に登録されている場合
   */
  registerWorkflow(workflow, trigger = { type: "manual" }, options) {
    if (this.workflows.has(workflow.id)) {
      throw new ConflictError(`Workflow already registered: ${workflow.id}`);
    }
    const registration = {
      workflow,
      trigger,
      options
    };
    const storedRegistration = registration;
    this.workflows.set(workflow.id, storedRegistration);
    this.indexWorkflow(storedRegistration);
  }
  /**
   * スケジューラーを通じてcronジョブを登録する。
   *
   * @param jobId - ジョブの一意識別子
   * @param cronExpression - cron式（例: "0 * * * *"）
   * @param handler - 実行するハンドラー関数
   * @param name - ジョブの表示名（任意）
   * @throws {StateError} スケジューラーが設定されていない場合
   */
  registerCronJob(jobId, cronExpression, handler, name) {
    this.getScheduler().addJob(jobId, cronExpression, handler, name);
  }
  /**
   * スケジュールに従ってイベントをパブリッシュするcronジョブを登録する。
   *
   * @param jobId - ジョブの一意識別子
   * @param cronExpression - cron式
   * @param eventType - パブリッシュするイベントタイプ
   * @param payload - イベントのペイロード（任意）
   * @param metadata - イベントのメタデータ（任意）
   * @param name - ジョブの表示名（任意）
   */
  registerCronEvent(jobId, cronExpression, eventType, payload, metadata, name) {
    this.registerCronJob(
      jobId,
      cronExpression,
      () => {
        this.publish(eventType, payload, metadata);
      },
      name
    );
  }
  /**
   * スケジュールに従ってワークフローを実行するcronジョブを登録する。
   *
   * チャットフローワークフローはcronスケジューリングに対応していない。
   *
   * @param jobId - ジョブの一意識別子
   * @param cronExpression - cron式
   * @param workflowId - 実行するワークフローのID
   * @param options - ワークフロー実行時のオプション（任意）
   * @param name - ジョブの表示名（任意）
   * @throws {NotFoundError} 指定されたワークフローが見つからない場合
   * @throws {InvalidArgumentError} チャットフローワークフローが指定された場合
   */
  registerCronWorkflow(jobId, cronExpression, workflowId, options, name) {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }
    if (registration.workflow.type === "chatflow") {
      throw new InvalidArgumentError(CHATFLOW_CRON_UNSUPPORTED);
    }
    this.registerCronJob(
      jobId,
      cronExpression,
      async () => {
        await this.runWorkflow(workflowId, options);
      },
      name
    );
  }
  /**
   * 登録済みのcronジョブを削除する。
   *
   * @param jobId - 削除するジョブのID
   * @returns ジョブが存在して削除された場合は `true`
   */
  removeCronJob(jobId) {
    return this.getScheduler().removeJob(jobId);
  }
  /**
   * 指定されたcronジョブが登録されているかどうかを確認する。
   *
   * @param jobId - 確認するジョブのID
   * @returns ジョブが登録されている場合は `true`
   */
  isCronJobScheduled(jobId) {
    return this.getScheduler().isJobScheduled(jobId);
  }
  /**
   * 登録済みのワークフローを削除する。
   *
   * ワークフローに関連するイベントインデックスも合わせて削除される。
   *
   * @param workflowId - 削除するワークフローのID
   * @returns ワークフローが存在して削除された場合は `true`
   */
  unregisterWorkflow(workflowId) {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      return false;
    }
    this.unindexWorkflow(registration);
    return this.workflows.delete(workflowId);
  }
  /**
   * 登録済みのワークフローを手動で実行する。
   *
   * 登録時のオプションと引数のオプションがマージされ、ワークフローが実行される。
   *
   * @param workflowId - 実行するワークフローのID
   * @param options - ワークフロー実行時のオプション（任意）
   * @returns ワークフローの実行結果
   * @throws {NotFoundError} 指定されたワークフローが見つからない場合
   */
  async runWorkflow(workflowId, options) {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }
    const mergedOptions = {
      ...registration.options ?? {},
      ...options ?? {}
    };
    this.metrics.workflowRuns += 1;
    const result = await this.executeWorkflow(registration, mergedOptions);
    if (result.status === "failed") {
      this.metrics.workflowErrors += 1;
    }
    return result;
  }
  /**
   * オーケストレーターの現在の状態のスナップショットを作成する。
   *
   * 実行状態、モード、キューサイズ、メトリクスを含むスナップショットを返す。
   *
   * @returns オーケストレーターの状態スナップショット
   */
  async snapshot() {
    return new Snapshot({
      isRunning: this.isRunning,
      mode: this.mode,
      queueSize: await this.getQueueSize(),
      metrics: { ...this.metrics }
    });
  }
  /**
   * キューの現在のサイズを取得する。
   *
   * @returns キュー内のイベント数
   */
  async getQueueSize() {
    const size = this.queue.size();
    return await Promise.resolve(size);
  }
  /**
   * キュー処理をチェーンして実行する。
   *
   * 前回の処理が完了した後に次の処理を開始し、処理の直列化を保証する。
   *
   * @param allowWhenStopped - 停止中でも処理を許可するかどうか
   */
  async kick(allowWhenStopped = false) {
    const run = async () => {
      await this.processQueue(allowWhenStopped);
    };
    const chain = (this.processing ?? Promise.resolve()).then(run, run).finally(() => {
      if (this.processing === chain) {
        this.processing = null;
      }
    });
    this.processing = chain;
    return chain;
  }
  /**
   * スケジューラーを返す。設定されていない場合は例外をスローする。
   *
   * @returns 設定済みのcronスケジューラー
   * @throws {StateError} スケジューラーが設定されていない場合
   */
  getScheduler() {
    if (!this.scheduler) {
      throw new StateError(MISSING_SCHEDULER_MESSAGE);
    }
    return this.scheduler;
  }
  /**
   * 会話ストアを返す。設定されていない場合は例外をスローする。
   *
   * @returns 設定済みの会話ストア
   * @throws {StateError} 会話ストアが設定されていない場合
   */
  getConversationStore() {
    if (!this.conversationStore) {
      throw new StateError(MISSING_CONVERSATION_STORE_MESSAGE);
    }
    return this.conversationStore;
  }
  /**
   * 現在のモードがワーカーモード（「producer」以外）かどうかを判定する。
   *
   * @returns ワーカーモードの場合は `true`
   */
  isWorkerMode() {
    return this.mode !== "producer";
  }
  /**
   * スケジューラーを起動すべきかどうかを判定する（「worker」以外のモードで起動する）。
   *
   * @returns スケジューラーを起動すべき場合は `true`
   */
  shouldStartScheduler() {
    return this.mode !== "worker";
  }
  /**
   * 分散ロックとローカル会話ロックの両方を取得してタスクを実行する。
   *
   * 分散ロックが設定されていない場合はローカルロックのみを使用する。
   * ロックの自動リフレッシュも行い、長時間実行タスクのロック失効を防止する。
   *
   * @param conversationId - ロック対象の会話ID
   * @param task - ロック取得後に実行するタスク
   * @returns タスクの実行結果
   * @throws {StateError} 分散ロックの取得に失敗した場合
   */
  async withConversationLock(conversationId, task) {
    if (!this.conversationLock) {
      return this.withLocalConversationLock(conversationId, task);
    }
    const lockKey = `${this.conversationLockKeyPrefix}:${conversationId}`;
    const handle = await this.acquireConversationLock(lockKey);
    if (!handle) {
      throw new StateError(CONVERSATION_LOCK_FAILED);
    }
    let refreshTimer = null;
    if (this.conversationLockRefreshMs > 0 && this.conversationLock.refresh) {
      refreshTimer = setInterval(() => {
        void this.conversationLock?.refresh?.(handle, this.conversationLockTtlMs).catch(() => {
        });
      }, this.conversationLockRefreshMs);
    }
    try {
      return await this.withLocalConversationLock(conversationId, task);
    } finally {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      await this.conversationLock.release(handle);
    }
  }
  /**
   * ローカル会話ロック（Promiseチェーン）を使用してタスクを実行する。
   *
   * 同一会話IDに対する処理を直列化し、同時実行による競合を防止する。
   *
   * @param conversationId - ロック対象の会話ID
   * @param task - ロック取得後に実行するタスク
   * @returns タスクの実行結果
   */
  async withLocalConversationLock(conversationId, task) {
    const previous = this.conversationLocks.get(conversationId) ?? Promise.resolve();
    let release = () => {
    };
    const gate = new Promise((resolve2) => {
      release = () => resolve2();
    });
    const chain = previous.catch(() => {
    }).then(() => gate);
    this.conversationLocks.set(conversationId, chain);
    await previous.catch(() => {
    });
    try {
      return await task();
    } finally {
      release();
      if (this.conversationLocks.get(conversationId) === chain) {
        this.conversationLocks.delete(conversationId);
      }
    }
  }
  /**
   * リトライ付きで分散ロックを取得する。
   *
   * 設定されたリトライ回数と遅延に従って、ロック取得を繰り返し試行する。
   *
   * @param key - ロックキー
   * @returns 取得したロックハンドル。取得できなかった場合は `null`
   */
  async acquireConversationLock(key) {
    if (!this.conversationLock) {
      return null;
    }
    for (let attempt = 0; attempt <= this.conversationLockRetryCount; attempt += 1) {
      const handle = await this.conversationLock.acquire(key, {
        ttlMs: this.conversationLockTtlMs
      });
      if (handle) {
        return handle;
      }
      if (attempt < this.conversationLockRetryCount && this.conversationLockRetryDelayMs > 0) {
        await this.sleep(this.conversationLockRetryDelayMs);
      }
    }
    return null;
  }
  /**
   * 指定ミリ秒間の遅延を行うシンプルなスリープ関数。
   *
   * @param ms - 遅延するミリ秒数
   */
  sleep(ms) {
    return new Promise((resolve2) => setTimeout(resolve2, ms));
  }
  /**
   * メインのキュー処理ループ。同時実行数を制御しながらイベントを処理する。
   *
   * 設定された最大同時実行数まで並列にイベントを処理し、
   * キューが空になるか停止されるまでループを継続する。
   *
   * @param allowWhenStopped - 停止中でも処理を許可するかどうか
   */
  async processQueue(allowWhenStopped) {
    const inFlight = /* @__PURE__ */ new Set();
    const schedule = (message) => {
      const { event, ack, nack } = this.normalizeQueueMessage(message);
      const task = this.processEvent(event).then((result) => this.handleQueueAck(result, ack, nack)).catch((error) => {
        if (!nack) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        return Promise.resolve(nack(reason));
      }).finally(() => {
        inFlight.delete(task);
      });
      inFlight.add(task);
    };
    while (this.isRunning || allowWhenStopped) {
      while ((this.isRunning || allowWhenStopped) && inFlight.size < this.maxConcurrentEvents) {
        const message = await this.queue.dequeue();
        if (!message) {
          break;
        }
        schedule(message);
      }
      if (inFlight.size === 0) {
        break;
      }
      await Promise.race(inFlight);
    }
  }
  /**
   * デキューされたメッセージからイベントとack/nackコールバックを抽出する。
   *
   * {@link QueueMessage} 形式の場合はイベントとコールバックを分離し、
   * 単純なイベントの場合はそのまま返す。
   *
   * @param message - デキューされたメッセージ
   * @returns イベントとオプションのack/nackコールバック
   */
  normalizeQueueMessage(message) {
    if (this.isQueueMessage(message)) {
      return {
        event: message.event,
        ack: message.ack,
        nack: message.nack
      };
    }
    return { event: message };
  }
  /**
   * ackポリシーと処理結果に基づいてackまたはnackを実行する。
   *
   * 「always」ポリシーの場合は常にack、「onSuccess」ポリシーの場合は
   * 失敗がなければackし、失敗があればnackする。
   *
   * @param result - イベント処理の結果
   * @param ack - ack コールバック
   * @param nack - nack コールバック
   */
  async handleQueueAck(result, ack, nack) {
    if (!ack && !nack) {
      return;
    }
    const hasFailures = result.dispatchErrors > 0 || result.workflowFailures > 0;
    const shouldAck = this.ackPolicy === "always" || !hasFailures;
    try {
      if (shouldAck) {
        await Promise.resolve(ack?.());
      } else {
        await Promise.resolve(nack?.(this.buildNackReason(result)));
      }
    } catch {
    }
  }
  /**
   * nack理由の文字列をフォーマットする。
   *
   * @param result - 処理結果
   * @returns ディスパッチエラー数とワークフロー失敗数を含む理由文字列
   */
  buildNackReason(result) {
    return `dispatchErrors=${result.dispatchErrors}, workflowFailures=${result.workflowFailures}`;
  }
  /**
   * 単一のイベントを処理する。ディスパッチとトリガーされたワークフローの実行を行う。
   *
   * @param event - 処理するイベント
   * @returns ディスパッチエラー数とワークフロー失敗数を含む処理結果
   */
  async processEvent(event) {
    this.metrics.processed += 1;
    const dispatchResult = await this.dispatcher.dispatch(event);
    this.metrics.dispatchErrors += dispatchResult.errors.length;
    const workflowFailures = await this.runTriggeredWorkflows(event);
    return {
      dispatchErrors: dispatchResult.errors.length,
      workflowFailures
    };
  }
  /**
   * イベントによってトリガーされた全ワークフローを並行実行する。
   *
   * ワークフロー同時実行数の制限に従い、並列で実行する。
   *
   * @param event - トリガー元のイベント
   * @returns 失敗したワークフローの数
   */
  async runTriggeredWorkflows(event) {
    const triggered = this.getTriggeredWorkflows(event);
    if (triggered.length === 0) {
      return 0;
    }
    const inFlight = /* @__PURE__ */ new Set();
    let failures = 0;
    const schedule = (registration) => {
      const task = this.executeTriggeredWorkflow(registration, event).then((result) => {
        if (result.status === "failed") {
          failures += 1;
        }
      }).catch((error) => {
        failures += 1;
        const err = error instanceof Error ? error : new RuntimeError(String(error), { cause: error });
        void this.handleWorkflowError(err, registration, event);
      }).finally(() => {
        inFlight.delete(task);
      });
      inFlight.add(task);
    };
    for (const registration of triggered) {
      while (inFlight.size >= this.workflowConcurrency) {
        await Promise.race(inFlight);
      }
      schedule(registration);
    }
    if (inFlight.size > 0) {
      await Promise.all(inFlight);
    }
    return failures;
  }
  /**
   * 単一のトリガー済みワークフローを実行する。
   *
   * トリガーの mapInput / mapContext / mapConversationId を使用して
   * イベントからワークフローの入力・コンテキスト・会話IDをマッピングする。
   *
   * @param registration - 登録済みワークフロー情報
   * @param event - トリガー元のイベント
   * @returns ワークフローの実行結果
   */
  async executeTriggeredWorkflow(registration, event) {
    const trigger = registration.trigger;
    const baseOptions = registration.options ?? {};
    const input = trigger.mapInput?.(event) ?? baseOptions.input ?? event.payload;
    const context = trigger.mapContext?.(event) ?? baseOptions.context;
    const conversationId = trigger.mapConversationId?.(event) ?? baseOptions.conversationId;
    this.metrics.workflowRuns += 1;
    try {
      const result = await this.executeWorkflow(registration, {
        ...baseOptions,
        input,
        context,
        event,
        conversationId
      });
      if (result.status === "failed") {
        this.metrics.workflowErrors += 1;
      }
      return result;
    } catch (error) {
      this.metrics.workflowErrors += 1;
      throw error;
    }
  }
  /**
   * 2つの会話メモリオブジェクトをマージする。
   *
   * 両方が未定義の場合は `undefined` を返す。
   *
   * @param base - ベースとなるメモリ
   * @param override - 上書きするメモリ
   * @returns マージされたメモリ、または両方未定義の場合は `undefined`
   */
  mergeMemory(base, override) {
    if (!base && !override) {
      return void 0;
    }
    return { ...base ?? {}, ...override ?? {} };
  }
  /**
   * ワークフローの実行記録を実行ストアに保存する。
   *
   * 実行ストアが設定されていない場合は何もしない。
   * 保存中のエラーはエラーハンドラーがあればそちらに委譲し、なければ再スローする。
   *
   * @param result - ワークフローの実行結果
   */
  async saveRunRecord(result) {
    if (!this.runStore) {
      return;
    }
    const record = toRunRecord(result);
    try {
      await this.runStore.save(record);
    } catch (error) {
      const err = error instanceof Error ? error : new RuntimeError(String(error), { cause: error });
      if (this.onRunStoreError) {
        await this.onRunStoreError(err, record);
        return;
      }
      throw err;
    }
  }
  /**
   * ワークフローを実行する。チャットフローの場合は会話ロックとメモリ管理を行う。
   *
   * 通常のワークフローはそのまま実行し、チャットフローの場合は会話IDの検証、
   * 会話ロックの取得、メモリの読み込み・保存を自動的に行う。
   *
   * @param registration - 登録済みワークフロー情報
   * @param options - ワークフロー実行オプション
   * @returns ワークフローの実行結果
   * @throws {InvalidArgumentError} チャットフローで会話IDが未指定の場合
   */
  async executeWorkflow(registration, options) {
    const workflow = registration.workflow;
    if (workflow.type !== "chatflow") {
      const result = await this.runner.run(workflow, options);
      await this.saveRunRecord(result);
      return result;
    }
    const conversationId = options.conversationId;
    if (!conversationId || conversationId.trim().length === 0) {
      throw new InvalidArgumentError(CHATFLOW_REQUIRES_CONVERSATION_ID2);
    }
    return this.withConversationLock(conversationId, async () => {
      const store = this.getConversationStore();
      const storedMemory = await store.get(conversationId);
      const memory = this.mergeMemory(storedMemory, options.memory);
      const result = await this.runner.run(workflow, {
        ...options,
        conversationId,
        memory
      });
      await store.set(conversationId, result.memory ?? memory ?? {});
      await this.saveRunRecord(result);
      return result;
    });
  }
  /**
   * イベントタイプに一致するトリガーを持つ全ワークフローを検索する。
   *
   * 完全一致、ワイルドカード、正規表現のインデックスを順に検索し、
   * さらにフィルター関数による絞り込みを行う。
   *
   * @param event - マッチング対象のイベント
   * @returns トリガー条件に一致したワークフローの配列
   */
  getTriggeredWorkflows(event) {
    const candidates = /* @__PURE__ */ new Set();
    const direct = this.eventWorkflowIndex.get(event.type);
    if (direct) {
      for (const registration of direct) {
        candidates.add(registration);
      }
    }
    for (const registration of this.wildcardEventWorkflows) {
      candidates.add(registration);
    }
    for (const registration of this.regexEventWorkflows) {
      if (this.matchesEventType(registration.trigger.eventType, event.type)) {
        candidates.add(registration);
      }
    }
    if (candidates.size === 0) {
      return [];
    }
    const matches = [];
    for (const registration of candidates) {
      if (registration.trigger.filter && !registration.trigger.filter(event)) {
        continue;
      }
      matches.push(registration);
    }
    return matches;
  }
  /**
   * イベントタイプがトリガーのマッチャーに一致するかを判定する。
   *
   * 正規表現、配列、ワイルドカード（"*"）、文字列の完全一致に対応する。
   *
   * @param matcher - トリガーのイベントタイプマッチャー
   * @param eventType - 判定対象のイベントタイプ
   * @returns 一致する場合は `true`
   */
  matchesEventType(matcher, eventType) {
    if (matcher instanceof RegExp) {
      if (matcher.global || matcher.sticky) {
        matcher.lastIndex = 0;
      }
      return matcher.test(eventType);
    }
    if (Array.isArray(matcher)) {
      return matcher.includes(eventType);
    }
    if (matcher === "*") {
      return true;
    }
    return matcher === eventType;
  }
  /**
   * ワークフローをイベントタイプインデックスに追加する。
   *
   * トリガーのタイプに応じて、完全一致インデックス、ワイルドカードセット、
   * または正規表現セットに登録する。
   *
   * @param registration - インデックスに追加するワークフロー登録情報
   */
  indexWorkflow(registration) {
    if (!this.isEventRegistration(registration)) {
      return;
    }
    const matcher = registration.trigger.eventType;
    if (matcher instanceof RegExp) {
      this.regexEventWorkflows.add(registration);
      return;
    }
    if (Array.isArray(matcher)) {
      for (const eventType of matcher) {
        if (eventType === "*") {
          this.wildcardEventWorkflows.add(registration);
        } else {
          this.addEventIndex(eventType, registration);
        }
      }
      return;
    }
    if (matcher === "*") {
      this.wildcardEventWorkflows.add(registration);
      return;
    }
    this.addEventIndex(matcher, registration);
  }
  /**
   * ワークフローをイベントタイプインデックスから削除する。
   *
   * トリガーのタイプに応じて、該当するインデックスから登録を除去する。
   *
   * @param registration - インデックスから削除するワークフロー登録情報
   */
  unindexWorkflow(registration) {
    if (!this.isEventRegistration(registration)) {
      return;
    }
    const matcher = registration.trigger.eventType;
    if (matcher instanceof RegExp) {
      this.regexEventWorkflows.delete(registration);
      return;
    }
    if (Array.isArray(matcher)) {
      for (const eventType of matcher) {
        if (eventType === "*") {
          this.wildcardEventWorkflows.delete(registration);
        } else {
          this.removeEventIndex(eventType, registration);
        }
      }
      return;
    }
    if (matcher === "*") {
      this.wildcardEventWorkflows.delete(registration);
      return;
    }
    this.removeEventIndex(matcher, registration);
  }
  /**
   * イベントタイプからワークフローへのマッピングをSetに追加する。
   *
   * 該当するイベントタイプのバケットが存在しない場合は新規作成する。
   *
   * @param eventType - イベントタイプ
   * @param registration - 追加するワークフロー登録情報
   */
  addEventIndex(eventType, registration) {
    const bucket = this.eventWorkflowIndex.get(eventType);
    if (bucket) {
      bucket.add(registration);
      return;
    }
    this.eventWorkflowIndex.set(eventType, /* @__PURE__ */ new Set([registration]));
  }
  /**
   * イベントタイプからワークフローへのマッピングをSetから削除する。
   *
   * バケットが空になった場合はバケット自体も削除する。
   *
   * @param eventType - イベントタイプ
   * @param registration - 削除するワークフロー登録情報
   */
  removeEventIndex(eventType, registration) {
    const bucket = this.eventWorkflowIndex.get(eventType);
    if (!bucket) {
      return;
    }
    bucket.delete(registration);
    if (bucket.size === 0) {
      this.eventWorkflowIndex.delete(eventType);
    }
  }
  /**
   * 登録情報がイベントトリガー型かどうかを判定する型ガード。
   *
   * @param registration - 判定対象のワークフロー登録情報
   * @returns イベントトリガー型の場合は `true`
   */
  isEventRegistration(registration) {
    return registration.trigger.type === "event";
  }
  /**
   * デキューされたメッセージが {@link QueueMessage} 型かどうかを判定する型ガード。
   *
   * @param message - 判定対象のメッセージ
   * @returns QueueMessage型の場合は `true`
   */
  isQueueMessage(message) {
    return typeof message.event !== "undefined";
  }
  /**
   * ワークフローエラーハンドラーを呼び出す。ハンドラー自体のエラーは無視する。
   *
   * エラーハンドラーが設定されていない場合は何もしない。
   *
   * @param error - 発生したエラー
   * @param registration - エラーが発生したワークフローの登録情報
   * @param event - エラーのトリガーとなったイベント
   */
  async handleWorkflowError(error, registration, event) {
    if (!this.onWorkflowError) {
      return;
    }
    try {
      await this.onWorkflowError(error, {
        workflowId: registration.workflow.id,
        event,
        trigger: registration.trigger
      });
    } catch {
    }
  }
};

// src/utils/exec-async.ts
import {
  exec,
  execFile
} from "node:child_process";
import { promisify } from "node:util";
var DEFAULT_ENCODING2 = "utf8";
var SHELL_EXEC_DISABLED_MESSAGE = "Shell execution is disabled. Pass { allowShell: true } to execAsync.";
var execAsyncRaw = promisify(exec);
var execFileAsyncRaw = promisify(execFile);
var normalizeOutput = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (value) {
    return value.toString(DEFAULT_ENCODING2);
  }
  return "";
};
var execAsync = async (command, options = {}) => {
  if (!options.allowShell) {
    throw new InvalidArgumentError(SHELL_EXEC_DISABLED_MESSAGE);
  }
  const { allowShell: _allowShell, ...execOptions } = options;
  const { stdout, stderr } = await execAsyncRaw(command, {
    encoding: DEFAULT_ENCODING2,
    ...execOptions
  });
  return { stdout: normalizeOutput(stdout), stderr: normalizeOutput(stderr) };
};
var execFileAsync = async (file, args = [], options = {}) => {
  const { stdout, stderr } = await execFileAsyncRaw(file, args, {
    encoding: DEFAULT_ENCODING2,
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

// src/workflow/memory-diff.ts
var EMPTY_DIFF = { set: {}, remove: [] };
var isEmptyDiff = (diff) => Object.keys(diff.set).length === 0 && diff.remove.length === 0;
var diffMemory = (previous, next) => {
  const set = {};
  const remove = [];
  const prevKeys = Object.keys(previous);
  const nextKeys = new Set(Object.keys(next));
  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      remove.push(key);
      continue;
    }
    const prevValue = previous[key];
    const nextValue = next[key];
    if (!Object.is(prevValue, nextValue)) {
      set[key] = nextValue;
    }
  }
  for (const key of Object.keys(next)) {
    if (!(key in previous)) {
      set[key] = next[key];
    }
  }
  if (Object.keys(set).length === 0 && remove.length === 0) {
    return EMPTY_DIFF;
  }
  return { set, remove };
};
var applyMemoryDiff = (base, diff) => {
  const next = { ...base, ...diff.set };
  for (const key of diff.remove) {
    delete next[key];
  }
  return next;
};

// src/workflow/conversation-store.ts
var cloneMemory2 = (memory) => structuredClone(memory);
var InMemoryConversationStore = class {
  store = /* @__PURE__ */ new Map();
  /**
   * 指定された会話IDに対応するメモリを取得する。
   *
   * 格納されたメモリのディープクローンを返すため、返却値を変更しても
   * ストア内部のデータには影響しない。
   *
   * @param conversationId - 取得対象の会話ID
   * @returns 会話メモリのディープクローン。存在しない場合は `undefined`
   */
  async get(conversationId) {
    const memory = this.store.get(conversationId);
    if (!memory) {
      return void 0;
    }
    return cloneMemory2(memory);
  }
  /**
   * 指定された会話IDに対して会話メモリを保存する。
   *
   * 引数のメモリをディープクローンして格納するため、保存後に元のオブジェクトを
   * 変更してもストア内部のデータには影響しない。
   *
   * @param conversationId - 保存対象の会話ID
   * @param memory - 保存する会話メモリ
   */
  async set(conversationId, memory) {
    this.store.set(conversationId, cloneMemory2(memory));
  }
  /**
   * 指定された会話IDに対応するメモリを削除する。
   *
   * @param conversationId - 削除対象の会話ID
   */
  async delete(conversationId) {
    this.store.delete(conversationId);
  }
};
var DEFAULT_DIRECTORY = "conversations";
var DEFAULT_COMPACT_AFTER_PATCHES = 50;
var MIN_COMPACT_AFTER_PATCHES = 1;
var BASE_FILE_NAME = "base.json";
var DELTA_FILE_NAME = "deltas.jsonl";
var LINE_ENDING = "\n";
var DeltaConversationStore = class {
  directory;
  fs;
  compactAfterPatches;
  constructor(options = {}) {
    this.directory = options.directory ?? DEFAULT_DIRECTORY;
    this.fs = options.fileSystem ?? new FileSystem();
    const compactAfterPatches = options.compactAfterPatches ?? DEFAULT_COMPACT_AFTER_PATCHES;
    this.compactAfterPatches = Math.max(
      MIN_COMPACT_AFTER_PATCHES,
      compactAfterPatches
    );
  }
  /**
   * 指定された会話IDに対応するメモリを取得する。
   *
   * ベースファイルとデルタファイルから現在の状態を復元する。
   * デルタ数がコンパクション閾値以上の場合、自動的にコンパクションを実行して
   * 次回以降の読み取りを高速化する。
   *
   * @param conversationId - 取得対象の会話ID
   * @returns 復元された会話メモリ。存在しない場合は `undefined`
   */
  async get(conversationId) {
    const state = await this.readState(conversationId);
    if (!state.memory) {
      return void 0;
    }
    if (state.deltaCount >= this.compactAfterPatches) {
      await this.compact(conversationId, state.memory);
    }
    return state.memory;
  }
  /**
   * 指定された会話IDに対して会話メモリを保存する。
   *
   * 既存のベースファイルが存在しない場合は新規にベースファイルを作成する。
   * 既存の状態がある場合は、現在の状態との差分を計算してデルタファイルに追記する。
   * 差分が空の場合は書き込みをスキップする。デルタ数がコンパクション閾値に達した
   * 場合は自動的にコンパクションを実行する。
   *
   * @param conversationId - 保存対象の会話ID
   * @param memory - 保存する会話メモリ
   */
  async set(conversationId, memory) {
    const state = await this.readState(conversationId);
    if (!state.memory) {
      await this.writeBase(conversationId, memory);
      await this.clearDeltas(conversationId);
      return;
    }
    const diff = diffMemory(state.memory, memory);
    if (isEmptyDiff(diff)) {
      return;
    }
    await this.appendDelta(conversationId, diff);
    const nextDeltaCount = state.deltaCount + 1;
    if (nextDeltaCount >= this.compactAfterPatches) {
      await this.compact(conversationId, memory);
    }
  }
  /**
   * 指定された会話IDに対応するベースファイルとデルタファイルを削除する。
   *
   * @param conversationId - 削除対象の会話ID
   */
  async delete(conversationId) {
    await this.fs.remove(this.basePath(conversationId));
    await this.fs.remove(this.deltaPath(conversationId));
  }
  /**
   * 指定された会話IDに対応するベースファイルのパスを返す。
   *
   * @param conversationId - 会話ID
   * @returns ベースファイル (base.json) の絶対パス
   */
  basePath(conversationId) {
    return `${this.directory}/${conversationId}/${BASE_FILE_NAME}`;
  }
  /**
   * 指定された会話IDに対応するデルタファイルのパスを返す。
   *
   * @param conversationId - 会話ID
   * @returns デルタファイル (deltas.jsonl) の絶対パス
   */
  deltaPath(conversationId) {
    return `${this.directory}/${conversationId}/${DELTA_FILE_NAME}`;
  }
  /**
   * ベースファイルに会話メモリをJSON形式で書き込む。
   *
   * @param conversationId - 会話ID
   * @param memory - 書き込む会話メモリ
   */
  async writeBase(conversationId, memory) {
    await this.fs.writeJson(this.basePath(conversationId), memory);
  }
  /**
   * デルタファイルに差分エントリを1行追記する。
   *
   * タイムスタンプとともに差分情報をJSONL形式で追記する。
   *
   * @param conversationId - 会話ID
   * @param diff - 追記するメモリ差分
   */
  async appendDelta(conversationId, diff) {
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      diff
    };
    const line = `${JSON.stringify(entry)}${LINE_ENDING}`;
    await this.fs.appendText(this.deltaPath(conversationId), line);
  }
  /**
   * デルタファイルの内容をクリア（空文字で上書き）する。
   *
   * @param conversationId - 会話ID
   */
  async clearDeltas(conversationId) {
    await this.fs.writeText(this.deltaPath(conversationId), "");
  }
  /**
   * コンパクションを実行する。
   *
   * 現在のメモリ状態をベースファイルに書き出し、デルタファイルをクリアすることで
   * 蓄積されたデルタパッチを統合し、次回以降の読み取りパフォーマンスを改善する。
   *
   * @param conversationId - 会話ID
   * @param memory - コンパクション時点の最新メモリ状態
   */
  async compact(conversationId, memory) {
    await this.writeBase(conversationId, memory);
    await this.clearDeltas(conversationId);
  }
  /**
   * ベースファイルとデルタファイルから現在の会話メモリ状態を読み取る。
   *
   * ベースファイルが存在しない場合は未初期化として扱う。ベースファイルなしで
   * デルタファイルのみ存在する場合は不整合としてエラーをスローする。
   * ベースファイルが存在する場合、デルタファイルの各行を順に適用して
   * 最新のメモリ状態を復元する。
   *
   * @param conversationId - 会話ID
   * @returns 復元されたメモリ状態と適用されたデルタ数
   */
  async readState(conversationId) {
    const basePath = this.basePath(conversationId);
    const deltaPath = this.deltaPath(conversationId);
    if (!await this.fs.exists(basePath)) {
      if (await this.fs.exists(deltaPath)) {
        throw new RuntimeError(
          `Delta file exists without base: ${conversationId}`
        );
      }
      return { memory: void 0, deltaCount: 0 };
    }
    let memory = await this.fs.readJson(basePath);
    if (!await this.fs.exists(deltaPath)) {
      return { memory, deltaCount: 0 };
    }
    const text = await this.fs.readText(deltaPath);
    const lines = text.split(LINE_ENDING).filter((line) => line.length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line);
      memory = applyMemoryDiff(memory, entry.diff);
    }
    return { memory, deltaCount: lines.length };
  }
};

// src/workflow/node.ts
var MIN_RETRY_ATTEMPTS2 = 1;
var MIN_BACKOFF_MULTIPLIER2 = 1;
var MIN_DELAY_MS2 = 0;
var validateInteger = (value, name, min) => {
  if (!Number.isInteger(value) || value < min) {
    throw new InvalidArgumentError(
      `Node retry ${name} must be an integer >= ${min}`
    );
  }
  return value;
};
var validateNumber = (value, name, min) => {
  if (!Number.isFinite(value) || value < min) {
    throw new InvalidArgumentError(
      `Node retry ${name} must be a number >= ${min}`
    );
  }
  return value;
};
var Node = class {
  id;
  name;
  handler;
  retry;
  dependencies = /* @__PURE__ */ new Set();
  /**
   * NodeDefinition からノードを生成する。
   * リトライポリシーが指定されている場合、各パラメータ（maxAttempts, initialDelayMs,
   * backoffMultiplier, maxDelayMs, jitterMs）のバリデーションを行い、
   * 不正な値が含まれている場合は {@link InvalidArgumentError} をスローする。
   * また、dependsOn で指定された依存ノード ID を内部の依存関係セットに登録する。
   *
   * @param definition - ノードの定義オブジェクト（名前、ハンドラ、依存関係、リトライポリシーを含む）
   * @throws {InvalidArgumentError} リトライポリシーのパラメータが不正な場合
   */
  constructor(definition) {
    this.id = generateId();
    this.name = definition.name;
    this.handler = definition.handler;
    this.retry = definition.retry ? {
      maxAttempts: definition.retry.maxAttempts === void 0 ? void 0 : validateInteger(
        definition.retry.maxAttempts,
        "maxAttempts",
        MIN_RETRY_ATTEMPTS2
      ),
      initialDelayMs: definition.retry.initialDelayMs === void 0 ? void 0 : validateNumber(
        definition.retry.initialDelayMs,
        "initialDelayMs",
        MIN_DELAY_MS2
      ),
      backoffMultiplier: definition.retry.backoffMultiplier === void 0 ? void 0 : validateNumber(
        definition.retry.backoffMultiplier,
        "backoffMultiplier",
        MIN_BACKOFF_MULTIPLIER2
      ),
      maxDelayMs: definition.retry.maxDelayMs === void 0 ? void 0 : validateNumber(
        definition.retry.maxDelayMs,
        "maxDelayMs",
        MIN_DELAY_MS2
      ),
      jitterMs: definition.retry.jitterMs === void 0 ? void 0 : validateNumber(
        definition.retry.jitterMs,
        "jitterMs",
        MIN_DELAY_MS2
      )
    } : void 0;
    if (definition.dependsOn) {
      for (const dep of definition.dependsOn) {
        this.dependencies.add(dep);
      }
    }
  }
  /**
   * 指定されたノード ID を依存関係として追加する。
   * このノードは、追加された依存ノードの実行が完了するまで実行されない。
   *
   * @param nodeId - 依存先ノードの ID
   */
  addDependency(nodeId) {
    this.dependencies.add(nodeId);
  }
  /**
   * このノードが依存しているノード ID の一覧を返す。
   * 返される配列は内部の依存関係セットのスナップショットであり、
   * 変更しても元のデータには影響しない。
   *
   * @returns 依存先ノード ID の配列
   */
  get dependsOn() {
    return Array.from(this.dependencies);
  }
};

// src/workflow/workflow.ts
var DEFAULT_WORKFLOW_TYPE = "workflow";
var VALID_WORKFLOW_TYPES = ["workflow", "chatflow"];
var Workflow = class {
  id;
  name;
  description;
  type;
  nodes = /* @__PURE__ */ new Map();
  /**
   * ワークフロー定義からワークフローインスタンスを生成する。
   *
   * ワークフローのタイプは「workflow」または「chatflow」を指定可能。
   * 定義にノードが含まれている場合、それらを自動的にワークフローに追加する。
   *
   * @param definition - ワークフローの定義オブジェクト
   * @throws {InvalidArgumentError} ワークフロータイプが不正な場合
   */
  constructor(definition) {
    this.id = generateId();
    this.name = definition.name;
    this.description = definition.description;
    if (definition.type && !VALID_WORKFLOW_TYPES.includes(definition.type)) {
      throw new InvalidArgumentError(
        `Workflow type must be one of: ${VALID_WORKFLOW_TYPES.join(", ")}`
      );
    }
    this.type = definition.type ?? DEFAULT_WORKFLOW_TYPE;
    if (definition.nodes) {
      for (const node of definition.nodes) {
        this.addNode(node instanceof Node ? node : new Node(node));
      }
    }
  }
  /**
   * ワークフローにノードを追加する。
   *
   * 同一IDのノードが既に存在する場合はエラーをスローする。
   *
   * @param node - 追加するノード
   * @throws {ConflictError} 同一IDのノードが既に存在する場合
   */
  addNode(node) {
    if (this.nodes.has(node.id)) {
      throw new ConflictError(`Node already exists: ${node.id}`);
    }
    this.nodes.set(node.id, node);
  }
  /**
   * 2つのノード間に依存関係を作成し接続する。
   *
   * fromNodeId から toNodeId への依存関係を設定する。
   * つまり、toNodeId のノードは fromNodeId のノードが完了するまで実行されない。
   *
   * @param fromNodeId - 依存元のノードID（先に実行されるノード）
   * @param toNodeId - 依存先のノードID（後に実行されるノード）
   * @throws {NotFoundError} 指定されたノードIDが存在しない場合
   */
  connect(fromNodeId, toNodeId) {
    const toNode = this.nodes.get(toNodeId);
    if (!toNode) {
      throw new NotFoundError(`Unknown node: ${toNodeId}`);
    }
    if (!this.nodes.has(fromNodeId)) {
      throw new NotFoundError(`Unknown node: ${fromNodeId}`);
    }
    toNode.addDependency(fromNodeId);
  }
  /**
   * 指定されたIDのノードを取得する。
   *
   * @param nodeId - 取得するノードのID
   * @returns 該当するノード。存在しない場合は `undefined`
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }
  /**
   * ワークフローに登録されている全ノードを配列として取得する。
   *
   * @returns 全ノードの配列
   */
  getNodes() {
    return Array.from(this.nodes.values());
  }
  /**
   * ノードの依存関係に基づいてトポロジカルソートを行い、実行計画を生成する。
   *
   * 依存関係のないノードから順に並べ、全ノードが正しい実行順序で返される。
   * 循環依存が検出された場合はエラーをスローする。
   *
   * @returns トポロジカルソート済みのノード配列（実行順）
   * @throws {DependencyError} ノードが存在しない依存先を参照している場合
   * @throws {CyclicDependencyError} ワークフローに循環依存が含まれている場合
   */
  getExecutionPlan() {
    const nodes = this.getNodes();
    const dependencies = /* @__PURE__ */ new Map();
    const dependents = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      dependencies.set(node.id, new Set(node.dependsOn));
      if (!dependents.has(node.id)) {
        dependents.set(node.id, /* @__PURE__ */ new Set());
      }
    }
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (!dependencies.has(dep)) {
          throw new DependencyError(
            `Node ${node.id} depends on missing node: ${dep}`
          );
        }
        const bucket = dependents.get(dep);
        if (bucket) {
          bucket.add(node.id);
        }
      }
    }
    const ready = nodes.filter(
      (node) => (dependencies.get(node.id)?.size ?? 0) === 0
    );
    const executionPlan = [];
    while (ready.length > 0) {
      const node = ready.shift();
      if (!node) {
        continue;
      }
      executionPlan.push(node);
      const downstream = dependents.get(node.id);
      if (!downstream) {
        continue;
      }
      for (const dependentId of downstream) {
        const deps = dependencies.get(dependentId);
        if (!deps) {
          continue;
        }
        deps.delete(node.id);
        if (deps.size === 0) {
          const dependentNode = this.nodes.get(dependentId);
          if (dependentNode) {
            ready.push(dependentNode);
          }
        }
      }
    }
    if (executionPlan.length !== nodes.length) {
      throw new CyclicDependencyError("Workflow contains a cyclic dependency");
    }
    return executionPlan;
  }
};
export {
  AppError,
  Config,
  ConflictError,
  Connection,
  Cron,
  CyclicDependencyError,
  DatabaseAdapter,
  DeltaConversationStore,
  DependencyError,
  Event,
  EventDispatcher,
  FileRunStore,
  FileSystem,
  InMemoryConversationStore,
  InMemoryRunStore,
  InvalidArgumentError,
  LOG_LEVEL,
  LeaderScheduler,
  Logger,
  Node,
  NotFoundError,
  Notification,
  Orchestrator,
  Queue,
  Runner,
  RuntimeError,
  Scheduler,
  SerializationError,
  Snapshot,
  StateError,
  Subscriber,
  Workflow,
  applyMemoryDiff,
  createConfig,
  createLogger,
  diffMemory,
  execAsync,
  execCommand,
  execFileAsync,
  generateId,
  isEmptyDiff,
  measurePerformance,
  runPerformance,
  toRunRecord
};
//# sourceMappingURL=index.js.map
