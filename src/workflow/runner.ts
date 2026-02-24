import {
  CyclicDependencyError,
  DependencyError,
  generateId,
  InvalidArgumentError,
  RuntimeError,
} from "../core/index.js";
import type { ConversationMemory } from "./conversation-store.js";
import type { Node } from "./node.js";
import type { Workflow } from "./workflow.js";

const MIN_CONCURRENCY = 1;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CHATFLOW_CONCURRENCY = 1;
const DEFAULT_FAIL_FAST = true;
const MIN_RETRY_ATTEMPTS = 1;
const MIN_BACKOFF_MULTIPLIER = 1;
const MIN_DELAY_MS = 0;
const DEFAULT_RETRY_MAX_ATTEMPTS = 1;
const DEFAULT_RETRY_INITIAL_DELAY_MS = 1000;
const DEFAULT_RETRY_BACKOFF_MULTIPLIER = 2;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const DEFAULT_RETRY_JITTER_MS = 0;
const CHATFLOW_REQUIRES_CONVERSATION_ID =
  "Chatflow requires conversationId to run.";
const ABORT_ERROR_NAME = "AbortError";
const ABORT_ERROR_MESSAGE = "Workflow aborted";

export interface WorkflowRunOptions<Context = unknown, Input = unknown> {
  input?: Input;
  context?: Context;
  event?: unknown;
  conversationId?: string;
  memory?: ConversationMemory;
  concurrency?: number;
  failFast?: boolean;
  onNodeStart?: (node: Node<Context, Input>) => void | Promise<void>;
  onNodeComplete?: (
    node: Node<Context, Input>,
    result: unknown,
  ) => void | Promise<void>;
  onNodeError?: (
    node: Node<Context, Input>,
    error: Error,
  ) => void | Promise<void>;
  onNodeRetry?: (
    node: Node<Context, Input>,
    error: Error,
    attempt: number,
    nextDelayMs: number,
  ) => void | Promise<void>;
}

export type WorkflowTimelineEntry =
  | {
      type: "run_start";
      timestamp: Date;
    }
  | {
      type: "run_complete";
      timestamp: Date;
      status: "succeeded" | "failed";
      durationMs: number;
    }
  | {
      type: "node_start";
      nodeId: string;
      timestamp: Date;
      attempt: number;
    }
  | {
      type: "node_complete";
      nodeId: string;
      timestamp: Date;
      durationMs: number;
      attempt: number;
    }
  | {
      type: "node_retry";
      nodeId: string;
      timestamp: Date;
      attempt: number;
      nextDelayMs: number;
      error: Error;
    }
  | {
      type: "node_error";
      nodeId: string;
      timestamp: Date;
      attempt: number;
      error: Error;
    };

export interface WorkflowRunResult {
  runId: string;
  workflowId: string;
  status: "succeeded" | "failed";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  results: Record<string, unknown>;
  errors: Record<string, Error>;
  attempts: Record<string, number>;
  timeline: WorkflowTimelineEntry[];
  conversationId?: string;
  memory?: ConversationMemory;
}

const createAbortError = (cause?: unknown): Error => {
  const error = cause
    ? new Error(ABORT_ERROR_MESSAGE, { cause })
    : new Error(ABORT_ERROR_MESSAGE);
  error.name = ABORT_ERROR_NAME;
  return error;
};

const resolveAbortError = (reason: unknown): Error =>
  reason instanceof Error ? reason : createAbortError(reason);

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === ABORT_ERROR_NAME;

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) {
    return;
  }
  throw resolveAbortError(signal.reason);
};

const withAbort = async <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw resolveAbortError(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(resolveAbortError(signal.reason));
    };
    const cleanup = (): void => {
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
      },
    );
  });
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(resolveAbortError(signal.reason));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const cleanup = (): void => {
      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
    };
    onAbort = (): void => {
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

const resolveRetryPolicy = (policy?: {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}): {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  jitterMs: number;
} => ({
  maxAttempts: Math.max(
    MIN_RETRY_ATTEMPTS,
    policy?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS,
  ),
  initialDelayMs: Math.max(
    MIN_DELAY_MS,
    policy?.initialDelayMs ?? DEFAULT_RETRY_INITIAL_DELAY_MS,
  ),
  backoffMultiplier: Math.max(
    MIN_BACKOFF_MULTIPLIER,
    policy?.backoffMultiplier ?? DEFAULT_RETRY_BACKOFF_MULTIPLIER,
  ),
  maxDelayMs: Math.max(
    MIN_DELAY_MS,
    policy?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
  ),
  jitterMs: Math.max(MIN_DELAY_MS, policy?.jitterMs ?? DEFAULT_RETRY_JITTER_MS),
});

const computeRetryDelayMs = (
  attempt: number,
  policy: ReturnType<typeof resolveRetryPolicy>,
): number => {
  if (policy.maxAttempts <= 1) {
    return 0;
  }
  const exponentialDelay =
    policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1);
  const boundedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
  if (policy.jitterMs <= 0) {
    return boundedDelay;
  }
  return boundedDelay + Math.random() * policy.jitterMs;
};

const cloneMemory = (memory: ConversationMemory): ConversationMemory =>
  structuredClone(memory);

/**
 * ワークフローの実行エンジン。
 *
 * ワークフロー内のノードを依存関係の順序に従って実行する。
 * 同時実行数の制御、リトライポリシーによる再試行、
 * および `AbortSignal` を利用した中断をサポートする。
 */
export class Runner {
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
  async run<Context = unknown, Input = unknown>(
    workflow: Workflow<Context, Input>,
    options: WorkflowRunOptions<Context, Input> = {},
  ): Promise<WorkflowRunResult> {
    const runId = generateId();
    const startedAt = new Date();
    const results: Record<string, unknown> = {};
    const errors: Record<string, Error> = {};
    const attempts: Record<string, number> = {};
    const timeline: WorkflowTimelineEntry[] = [
      { type: "run_start", timestamp: startedAt },
    ];
    const abortController = new AbortController();
    const signal = abortController.signal;
    const abortRun = (cause?: unknown): void => {
      if (signal.aborted) {
        return;
      }
      abortController.abort(createAbortError(cause));
    };

    const dependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();
    const nodes = workflow.getNodes();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const chatflow = workflow.type === "chatflow";
    if (
      chatflow &&
      (!options.conversationId || options.conversationId.trim().length === 0)
    ) {
      throw new InvalidArgumentError(CHATFLOW_REQUIRES_CONVERSATION_ID);
    }

    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (!nodeIds.has(dep)) {
          throw new DependencyError(
            `Node ${node.id} depends on missing node: ${dep}`,
          );
        }
      }
    }

    for (const node of nodes) {
      dependencies.set(node.id, new Set(node.dependsOn));
      dependents.set(node.id, new Set());
    }

    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        const bucket = dependents.get(dep);
        if (bucket) {
          bucket.add(node.id);
        }
      }
    }

    const ready: Node<Context, Input>[] = nodes.filter(
      (node) => (dependencies.get(node.id)?.size ?? 0) === 0,
    );

    const concurrency = Math.max(
      MIN_CONCURRENCY,
      options.concurrency ??
        (chatflow ? DEFAULT_CHATFLOW_CONCURRENCY : DEFAULT_CONCURRENCY),
    );
    const failFast = options.failFast ?? DEFAULT_FAIL_FAST;
    let memoryState: ConversationMemory | undefined = options.memory
      ? cloneMemory(options.memory)
      : chatflow
        ? {}
        : undefined;
    const getMemory = (): ConversationMemory | undefined => memoryState;
    const setMemory = (next: ConversationMemory): void => {
      if (!memoryState) {
        memoryState = {};
      }
      for (const key of Object.keys(memoryState)) {
        delete memoryState[key];
      }
      Object.assign(memoryState, next);
    };
    const updateMemory = (patch: Partial<ConversationMemory>): void => {
      if (!memoryState) {
        memoryState = {};
      }
      Object.assign(memoryState, patch);
    };

    let aborted = false;
    let completedCount = 0;

    const inFlight = new Set<Promise<void>>();

    const scheduleNode = (node: Node<Context, Input>): void => {
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
        updateMemory,
      )
        .then(() => {
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
        })
        .catch((error) => {
          if (failFast) {
            aborted = true;
            abortRun(error);
          }
        })
        .finally(() => {
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

    const finishedAt = new Date();
    const status = Object.keys(errors).length > 0 ? "failed" : "succeeded";
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    timeline.push({
      type: "run_complete",
      timestamp: finishedAt,
      status,
      durationMs,
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
      memory: memoryState,
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
  private async runNode<Context = unknown, Input = unknown>(
    node: Node<Context, Input>,
    workflow: Workflow<Context, Input>,
    runId: string,
    options: WorkflowRunOptions<Context, Input>,
    results: Record<string, unknown>,
    errors: Record<string, Error>,
    attempts: Record<string, number>,
    timeline: WorkflowTimelineEntry[],
    conversationId: string | undefined,
    signal: AbortSignal,
    memory: ConversationMemory | undefined,
    getMemory: () => ConversationMemory | undefined,
    setMemory: (next: ConversationMemory) => void,
    updateMemory: (patch: Partial<ConversationMemory>) => void,
  ): Promise<void> {
    const policy = resolveRetryPolicy(node.retry);
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        throwIfAborted(signal);
        attempts[node.id] = attempt;
        const nodeStart = new Date();
        timeline.push({
          type: "node_start",
          nodeId: node.id,
          timestamp: nodeStart,
          attempt,
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
              getResult: <T = unknown>(nodeId: string) =>
                results[nodeId] as T | undefined,
              memory,
              getMemory,
              setMemory,
              updateMemory,
              signal,
            }),
          ),
          signal,
        );

        results[node.id] = output;

        if (options.onNodeComplete) {
          await options.onNodeComplete(node, output);
        }

        const nodeFinish = new Date();
        timeline.push({
          type: "node_complete",
          nodeId: node.id,
          timestamp: nodeFinish,
          durationMs: nodeFinish.getTime() - nodeStart.getTime(),
          attempt,
        });
        return;
      } catch (error: unknown) {
        const err =
          error instanceof Error
            ? error
            : new RuntimeError(String(error), { cause: error });

        if (isAbortError(err)) {
          errors[node.id] = err;
          timeline.push({
            type: "node_error",
            nodeId: node.id,
            timestamp: new Date(),
            attempt,
            error: err,
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
            timestamp: new Date(),
            attempt,
            error: err,
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
          timestamp: new Date(),
          attempt,
          nextDelayMs,
          error: err,
        });

        if (options.onNodeRetry) {
          await options.onNodeRetry(node, err, attempt, nextDelayMs);
        }

        if (nextDelayMs > 0) {
          try {
            await sleep(nextDelayMs, signal);
          } catch (sleepError: unknown) {
            const sleepErr =
              sleepError instanceof Error
                ? sleepError
                : new RuntimeError(String(sleepError), { cause: sleepError });
            if (isAbortError(sleepErr)) {
              errors[node.id] = sleepErr;
              timeline.push({
                type: "node_error",
                nodeId: node.id,
                timestamp: new Date(),
                attempt,
                error: sleepErr,
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
}
