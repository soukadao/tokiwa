// src/core/file-system.ts
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";

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
var DependencyError = class extends AppError {
};
var CyclicDependencyError = class extends DependencyError {
};
var SerializationError = class extends AppError {
};

// src/core/file-system.ts
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
var cloneMemory = (memory) => structuredClone(memory);
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
    return cloneMemory(memory);
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
    this.store.set(conversationId, cloneMemory(memory));
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
var MIN_RETRY_ATTEMPTS = 1;
var MIN_BACKOFF_MULTIPLIER = 1;
var MIN_DELAY_MS = 0;
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
        MIN_RETRY_ATTEMPTS
      ),
      initialDelayMs: definition.retry.initialDelayMs === void 0 ? void 0 : validateNumber(
        definition.retry.initialDelayMs,
        "initialDelayMs",
        MIN_DELAY_MS
      ),
      backoffMultiplier: definition.retry.backoffMultiplier === void 0 ? void 0 : validateNumber(
        definition.retry.backoffMultiplier,
        "backoffMultiplier",
        MIN_BACKOFF_MULTIPLIER
      ),
      maxDelayMs: definition.retry.maxDelayMs === void 0 ? void 0 : validateNumber(
        definition.retry.maxDelayMs,
        "maxDelayMs",
        MIN_DELAY_MS
      ),
      jitterMs: definition.retry.jitterMs === void 0 ? void 0 : validateNumber(
        definition.retry.jitterMs,
        "jitterMs",
        MIN_DELAY_MS
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
var MIN_RETRY_ATTEMPTS2 = 1;
var MIN_BACKOFF_MULTIPLIER2 = 1;
var MIN_DELAY_MS2 = 0;
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
    MIN_RETRY_ATTEMPTS2,
    policy?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS
  ),
  initialDelayMs: Math.max(
    MIN_DELAY_MS2,
    policy?.initialDelayMs ?? DEFAULT_RETRY_INITIAL_DELAY_MS
  ),
  backoffMultiplier: Math.max(
    MIN_BACKOFF_MULTIPLIER2,
    policy?.backoffMultiplier ?? DEFAULT_RETRY_BACKOFF_MULTIPLIER
  ),
  maxDelayMs: Math.max(
    MIN_DELAY_MS2,
    policy?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
  ),
  jitterMs: Math.max(MIN_DELAY_MS2, policy?.jitterMs ?? DEFAULT_RETRY_JITTER_MS)
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
var cloneMemory2 = (memory) => structuredClone(memory);
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
    let memoryState = options.memory ? cloneMemory2(options.memory) : chatflow ? {} : void 0;
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
  DeltaConversationStore,
  FileRunStore,
  InMemoryConversationStore,
  InMemoryRunStore,
  Node,
  Runner,
  Workflow,
  applyMemoryDiff,
  diffMemory,
  isEmptyDiff,
  toRunRecord
};
//# sourceMappingURL=index.js.map
