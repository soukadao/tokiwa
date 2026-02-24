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

// src/core/generate-id.ts
import { randomUUID } from "node:crypto";
function generateId() {
  return randomUUID();
}

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
  return new Promise((resolve, reject) => {
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
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
};
var sleep = (ms, signal) => new Promise((resolve, reject) => {
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
    resolve();
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
   * @param cronExpression - cron式（例: "0 * * * *"）
   * @param name - ジョブの表示名
   * @param handler - 実行するハンドラー関数
   * @returns 生成されたジョブID
   * @throws {StateError} スケジューラーが設定されていない場合
   */
  registerCronJob(cronExpression, name, handler) {
    return this.getScheduler().addJob(cronExpression, name, handler);
  }
  /**
   * スケジュールに従ってイベントをパブリッシュするcronジョブを登録する。
   *
   * @param cronExpression - cron式
   * @param eventType - パブリッシュするイベントタイプ
   * @param name - ジョブの表示名
   * @param payload - イベントのペイロード（任意）
   * @param metadata - イベントのメタデータ（任意）
   * @returns 生成されたジョブID
   */
  registerCronEvent(cronExpression, eventType, name, payload, metadata) {
    return this.registerCronJob(cronExpression, name, () => {
      this.publish(eventType, payload, metadata);
    });
  }
  /**
   * スケジュールに従ってワークフローを実行するcronジョブを登録する。
   *
   * チャットフローワークフローはcronスケジューリングに対応していない。
   *
   * @param cronExpression - cron式
   * @param workflowId - 実行するワークフローのID
   * @param name - ジョブの表示名
   * @param options - ワークフロー実行時のオプション（任意）
   * @returns 生成されたジョブID
   * @throws {NotFoundError} 指定されたワークフローが見つからない場合
   * @throws {InvalidArgumentError} チャットフローワークフローが指定された場合
   */
  registerCronWorkflow(cronExpression, workflowId, name, options) {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }
    if (registration.workflow.type === "chatflow") {
      throw new InvalidArgumentError(CHATFLOW_CRON_UNSUPPORTED);
    }
    return this.registerCronJob(cronExpression, name, async () => {
      await this.runWorkflow(workflowId, options);
    });
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
    const gate = new Promise((resolve) => {
      release = () => resolve();
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
    return new Promise((resolve) => setTimeout(resolve, ms));
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
export {
  Connection,
  Event,
  EventDispatcher,
  Notification,
  Orchestrator,
  Queue,
  Snapshot,
  Subscriber
};
//# sourceMappingURL=index.js.map
