import {
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
  RuntimeError,
  StateError,
} from "../core/index.js";
import type { DistributedLock, LockHandle } from "../core/lock.js";
import type {
  ConversationMemory,
  ConversationStore,
} from "../workflow/conversation-store.js";
import type { RunStore, WorkflowRunRecord } from "../workflow/run-store.js";
import { toRunRecord } from "../workflow/run-store.js";
import {
  Runner,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "../workflow/runner.js";
import type { EventTrigger, Trigger } from "../workflow/trigger.js";
import type { Workflow } from "../workflow/workflow.js";
import { Event, type EventMetadata } from "./event.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type { DequeuedEvent, EventQueue, QueueMessage } from "./event-queue.js";
import { Queue } from "./queue.js";
import { Snapshot } from "./snapshot.js";

const MIN_CONCURRENCY = 1;
const DEFAULT_MAX_CONCURRENT_EVENTS = 1;
const DEFAULT_WORKFLOW_CONCURRENCY = 2;
const DEFAULT_MODE: OrchestratorMode = "all";
const DEFAULT_ACK_POLICY: AckPolicy = "always";
const DEFAULT_CONVERSATION_LOCK_TTL_MS = 60_000;
const DEFAULT_CONVERSATION_LOCK_REFRESH_MS = 20_000;
const DEFAULT_CONVERSATION_LOCK_RETRY_COUNT = 10;
const DEFAULT_CONVERSATION_LOCK_RETRY_DELAY_MS = 200;
const DEFAULT_CONVERSATION_LOCK_KEY_PREFIX = "tokiwa:locks:conversation";
const MISSING_SCHEDULER_MESSAGE =
  "Cron scheduler is not configured. Provide OrchestratorOptions.scheduler.";
const MISSING_WORKER_MODE_MESSAGE = "Drain is not available in producer mode.";
const MISSING_CONVERSATION_STORE_MESSAGE =
  "Conversation store is not configured. Provide OrchestratorOptions.conversationStore.";
const CHATFLOW_REQUIRES_CONVERSATION_ID =
  "Chatflow requires conversationId to run.";
const CHATFLOW_CRON_UNSUPPORTED =
  "Chatflow workflows cannot be scheduled by cron.";
const CONVERSATION_LOCK_FAILED =
  "Failed to acquire conversation lock for chatflow.";

export type CronJobHandler = () => void | Promise<void>;

export interface CronScheduler {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  addJob(
    id: string,
    cronExpression: string,
    handler: CronJobHandler,
    name?: string,
  ): void;
  removeJob(id: string): boolean;
  isJobScheduled(id: string): boolean;
}

export interface WorkflowErrorContext {
  workflowId: string;
  event: Event;
  trigger: Trigger<Event, unknown, unknown>;
}

export type WorkflowErrorHandler = (
  error: Error,
  context: WorkflowErrorContext,
) => void | Promise<void>;

export type OrchestratorMode = "all" | "producer" | "worker";
export type AckPolicy = "always" | "onSuccess";

export type RunStoreErrorHandler = (
  error: Error,
  record: WorkflowRunRecord,
) => void | Promise<void>;

export interface OrchestratorOptions {
  maxConcurrentEvents?: number;
  workflowConcurrency?: number;
  mode?: OrchestratorMode;
  ackPolicy?: AckPolicy;
  queue?: EventQueue;
  scheduler?: CronScheduler;
  onWorkflowError?: WorkflowErrorHandler;
  conversationStore?: ConversationStore;
  conversationLock?: DistributedLock;
  conversationLockTtlMs?: number;
  conversationLockRefreshMs?: number;
  conversationLockRetryCount?: number;
  conversationLockRetryDelayMs?: number;
  conversationLockKeyPrefix?: string;
  runStore?: RunStore;
  onRunStoreError?: RunStoreErrorHandler;
}

interface RegisteredWorkflow<Context = unknown, Input = unknown> {
  workflow: Workflow<Context, Input>;
  trigger: Trigger<Event, Input, Context>;
  options?: WorkflowRunOptions<Context, Input>;
}

type AnyRegisteredWorkflow = RegisteredWorkflow<unknown, unknown>;
type EventRegisteredWorkflow = RegisteredWorkflow<unknown, unknown> & {
  trigger: EventTrigger<Event, unknown, unknown>;
};

interface OrchestratorMetrics {
  published: number;
  processed: number;
  dispatchErrors: number;
  workflowRuns: number;
  workflowErrors: number;
}

interface ProcessResult {
  dispatchErrors: number;
  workflowFailures: number;
}

/**
 * ワークフローの登録、イベントのパブリッシュ、キュー処理、cronスケジューリングを管理する中央コーディネーター。
 *
 * オーケストレーターは「producer」「worker」「all」の3つのモードで動作し、
 * イベント駆動型ワークフローの実行ライフサイクル全体を統括する。
 */
export class Orchestrator {
  readonly dispatcher: EventDispatcher;
  readonly queue: EventQueue;
  readonly runner: Runner;
  private readonly workflows = new Map<string, AnyRegisteredWorkflow>();
  private readonly eventWorkflowIndex = new Map<
    string,
    Set<EventRegisteredWorkflow>
  >();
  private readonly wildcardEventWorkflows = new Set<EventRegisteredWorkflow>();
  private readonly regexEventWorkflows = new Set<EventRegisteredWorkflow>();
  private readonly maxConcurrentEvents: number;
  private readonly workflowConcurrency: number;
  private readonly mode: OrchestratorMode;
  private readonly ackPolicy: AckPolicy;
  private readonly scheduler?: CronScheduler;
  private readonly onWorkflowError?: WorkflowErrorHandler;
  private readonly conversationStore?: ConversationStore;
  private readonly conversationLock?: DistributedLock;
  private readonly conversationLockTtlMs: number;
  private readonly conversationLockRefreshMs: number;
  private readonly conversationLockRetryCount: number;
  private readonly conversationLockRetryDelayMs: number;
  private readonly conversationLockKeyPrefix: string;
  private readonly runStore?: RunStore;
  private readonly onRunStoreError?: RunStoreErrorHandler;
  private readonly conversationLocks = new Map<string, Promise<void>>();
  private isRunning = false;
  private processing: Promise<void> | null = null;
  private metrics: OrchestratorMetrics = {
    published: 0,
    processed: 0,
    dispatchErrors: 0,
    workflowRuns: 0,
    workflowErrors: 0,
  };

  /**
   * オーケストレーターを初期化する。
   *
   * 同時実行数、動作モード、ack ポリシー、会話ストア、分散ロック、実行ストアなどのオプションを設定する。
   *
   * @param options - オーケストレーターの設定オプション
   */
  constructor(options: OrchestratorOptions = {}) {
    this.dispatcher = new EventDispatcher();
    this.queue = options.queue ?? new Queue();
    this.runner = new Runner();
    this.maxConcurrentEvents = Math.max(
      MIN_CONCURRENCY,
      options.maxConcurrentEvents ?? DEFAULT_MAX_CONCURRENT_EVENTS,
    );
    this.workflowConcurrency = Math.max(
      MIN_CONCURRENCY,
      options.workflowConcurrency ?? DEFAULT_WORKFLOW_CONCURRENCY,
    );
    this.mode = options.mode ?? DEFAULT_MODE;
    this.ackPolicy = options.ackPolicy ?? DEFAULT_ACK_POLICY;
    this.scheduler = options.scheduler;
    this.onWorkflowError = options.onWorkflowError;
    this.conversationStore = options.conversationStore;
    this.conversationLock = options.conversationLock;
    this.conversationLockTtlMs =
      options.conversationLockTtlMs ?? DEFAULT_CONVERSATION_LOCK_TTL_MS;
    this.conversationLockRefreshMs =
      options.conversationLockRefreshMs ?? DEFAULT_CONVERSATION_LOCK_REFRESH_MS;
    this.conversationLockRetryCount =
      options.conversationLockRetryCount ??
      DEFAULT_CONVERSATION_LOCK_RETRY_COUNT;
    this.conversationLockRetryDelayMs =
      options.conversationLockRetryDelayMs ??
      DEFAULT_CONVERSATION_LOCK_RETRY_DELAY_MS;
    this.conversationLockKeyPrefix =
      options.conversationLockKeyPrefix ?? DEFAULT_CONVERSATION_LOCK_KEY_PREFIX;
    this.runStore = options.runStore;
    this.onRunStoreError = options.onRunStoreError;
  }

  /**
   * オーケストレーターを開始する。
   *
   * 動作モードに応じてスケジューラーの起動やワーカーループの開始を行う。
   * 既に起動中の場合は何もしない。
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    if (this.shouldStartScheduler()) {
      void Promise.resolve(this.scheduler?.start()).catch(() => {});
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
  async stop(): Promise<void> {
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
  publish<TPayload = unknown>(
    type: string,
    payload?: TPayload,
    metadata?: EventMetadata,
  ): Event<TPayload> {
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
  enqueue(event: Event): void {
    void Promise.resolve(this.queue.enqueue(event)).catch(() => {});
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
  async drain(): Promise<void> {
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
  registerWorkflow<Context = unknown, Input = unknown>(
    workflow: Workflow<Context, Input>,
    trigger: Trigger<Event, Input, Context> = { type: "manual" },
    options?: WorkflowRunOptions<Context, Input>,
  ): void {
    if (this.workflows.has(workflow.id)) {
      throw new ConflictError(`Workflow already registered: ${workflow.id}`);
    }

    const registration: RegisteredWorkflow<Context, Input> = {
      workflow,
      trigger,
      options,
    };

    const storedRegistration = registration as AnyRegisteredWorkflow;
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
  registerCronJob(
    jobId: string,
    cronExpression: string,
    handler: CronJobHandler,
    name?: string,
  ): void {
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
  registerCronEvent<TPayload = unknown>(
    jobId: string,
    cronExpression: string,
    eventType: string,
    payload?: TPayload,
    metadata?: EventMetadata,
    name?: string,
  ): void {
    this.registerCronJob(
      jobId,
      cronExpression,
      () => {
        this.publish(eventType, payload, metadata);
      },
      name,
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
  registerCronWorkflow<Context = unknown, Input = unknown>(
    jobId: string,
    cronExpression: string,
    workflowId: string,
    options?: WorkflowRunOptions<Context, Input>,
    name?: string,
  ): void {
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
        await this.runWorkflow<Context, Input>(workflowId, options);
      },
      name,
    );
  }

  /**
   * 登録済みのcronジョブを削除する。
   *
   * @param jobId - 削除するジョブのID
   * @returns ジョブが存在して削除された場合は `true`
   */
  removeCronJob(jobId: string): boolean {
    return this.getScheduler().removeJob(jobId);
  }

  /**
   * 指定されたcronジョブが登録されているかどうかを確認する。
   *
   * @param jobId - 確認するジョブのID
   * @returns ジョブが登録されている場合は `true`
   */
  isCronJobScheduled(jobId: string): boolean {
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
  unregisterWorkflow(workflowId: string): boolean {
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
  async runWorkflow<Context = unknown, Input = unknown>(
    workflowId: string,
    options?: WorkflowRunOptions<Context, Input>,
  ): Promise<WorkflowRunResult> {
    const registration = this.workflows.get(workflowId);
    if (!registration) {
      throw new NotFoundError(`Unknown workflow: ${workflowId}`);
    }

    const mergedOptions: WorkflowRunOptions<unknown, unknown> = {
      ...(registration.options ?? {}),
      ...(options ?? {}),
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
  async snapshot(): Promise<Snapshot> {
    return new Snapshot({
      isRunning: this.isRunning,
      mode: this.mode,
      queueSize: await this.getQueueSize(),
      metrics: { ...this.metrics },
    });
  }

  /**
   * キューの現在のサイズを取得する。
   *
   * @returns キュー内のイベント数
   */
  private async getQueueSize(): Promise<number> {
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
  private async kick(allowWhenStopped: boolean = false): Promise<void> {
    const run = async (): Promise<void> => {
      await this.processQueue(allowWhenStopped);
    };

    const chain = (this.processing ?? Promise.resolve())
      .then(run, run)
      .finally(() => {
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
  private getScheduler(): CronScheduler {
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
  private getConversationStore(): ConversationStore {
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
  private isWorkerMode(): boolean {
    return this.mode !== "producer";
  }

  /**
   * スケジューラーを起動すべきかどうかを判定する（「worker」以外のモードで起動する）。
   *
   * @returns スケジューラーを起動すべき場合は `true`
   */
  private shouldStartScheduler(): boolean {
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
  private async withConversationLock<T>(
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!this.conversationLock) {
      return this.withLocalConversationLock(conversationId, task);
    }

    const lockKey = `${this.conversationLockKeyPrefix}:${conversationId}`;
    const handle = await this.acquireConversationLock(lockKey);
    if (!handle) {
      throw new StateError(CONVERSATION_LOCK_FAILED);
    }

    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    if (this.conversationLockRefreshMs > 0 && this.conversationLock.refresh) {
      refreshTimer = setInterval(() => {
        void this.conversationLock
          ?.refresh?.(handle, this.conversationLockTtlMs)
          .catch(() => {});
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
  private async withLocalConversationLock<T>(
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.conversationLocks.get(conversationId) ?? Promise.resolve();
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const chain = previous.catch(() => {}).then(() => gate);
    this.conversationLocks.set(conversationId, chain);

    await previous.catch(() => {});
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
  private async acquireConversationLock(
    key: string,
  ): Promise<LockHandle | null> {
    if (!this.conversationLock) {
      return null;
    }

    for (
      let attempt = 0;
      attempt <= this.conversationLockRetryCount;
      attempt += 1
    ) {
      const handle = await this.conversationLock.acquire(key, {
        ttlMs: this.conversationLockTtlMs,
      });
      if (handle) {
        return handle;
      }
      if (
        attempt < this.conversationLockRetryCount &&
        this.conversationLockRetryDelayMs > 0
      ) {
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
  private sleep(ms: number): Promise<void> {
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
  private async processQueue(allowWhenStopped: boolean): Promise<void> {
    const inFlight = new Set<Promise<void>>();

    const schedule = (message: DequeuedEvent): void => {
      const { event, ack, nack } = this.normalizeQueueMessage(message);
      const task = this.processEvent(event)
        .then((result) => this.handleQueueAck(result, ack, nack))
        .catch((error: unknown) => {
          if (!nack) {
            return;
          }
          const reason = error instanceof Error ? error.message : String(error);
          return Promise.resolve(nack(reason));
        })
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    };

    while (this.isRunning || allowWhenStopped) {
      while (
        (this.isRunning || allowWhenStopped) &&
        inFlight.size < this.maxConcurrentEvents
      ) {
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
  private normalizeQueueMessage(message: DequeuedEvent): {
    event: Event;
    ack?: QueueMessage["ack"];
    nack?: QueueMessage["nack"];
  } {
    if (this.isQueueMessage(message)) {
      return {
        event: message.event,
        ack: message.ack,
        nack: message.nack,
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
  private async handleQueueAck(
    result: ProcessResult,
    ack?: QueueMessage["ack"],
    nack?: QueueMessage["nack"],
  ): Promise<void> {
    if (!ack && !nack) {
      return;
    }

    const hasFailures =
      result.dispatchErrors > 0 || result.workflowFailures > 0;
    const shouldAck = this.ackPolicy === "always" || !hasFailures;

    try {
      if (shouldAck) {
        await Promise.resolve(ack?.());
      } else {
        await Promise.resolve(nack?.(this.buildNackReason(result)));
      }
    } catch {
      // Ignore queue acknowledgement errors to avoid crashing the worker loop.
    }
  }

  /**
   * nack理由の文字列をフォーマットする。
   *
   * @param result - 処理結果
   * @returns ディスパッチエラー数とワークフロー失敗数を含む理由文字列
   */
  private buildNackReason(result: ProcessResult): string {
    return `dispatchErrors=${result.dispatchErrors}, workflowFailures=${result.workflowFailures}`;
  }

  /**
   * 単一のイベントを処理する。ディスパッチとトリガーされたワークフローの実行を行う。
   *
   * @param event - 処理するイベント
   * @returns ディスパッチエラー数とワークフロー失敗数を含む処理結果
   */
  private async processEvent(event: Event): Promise<ProcessResult> {
    this.metrics.processed += 1;
    const dispatchResult = await this.dispatcher.dispatch(event);
    this.metrics.dispatchErrors += dispatchResult.errors.length;

    const workflowFailures = await this.runTriggeredWorkflows(event);

    return {
      dispatchErrors: dispatchResult.errors.length,
      workflowFailures,
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
  private async runTriggeredWorkflows(event: Event): Promise<number> {
    const triggered = this.getTriggeredWorkflows(event);
    if (triggered.length === 0) {
      return 0;
    }

    const inFlight = new Set<Promise<void>>();
    let failures = 0;

    const schedule = (registration: EventRegisteredWorkflow): void => {
      const task = this.executeTriggeredWorkflow(registration, event)
        .then((result) => {
          if (result.status === "failed") {
            failures += 1;
          }
        })
        .catch((error: unknown) => {
          failures += 1;
          const err =
            error instanceof Error
              ? error
              : new RuntimeError(String(error), { cause: error });
          void this.handleWorkflowError(err, registration, event);
        })
        .finally(() => {
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
  private async executeTriggeredWorkflow(
    registration: EventRegisteredWorkflow,
    event: Event,
  ): Promise<WorkflowRunResult> {
    const trigger = registration.trigger;
    const baseOptions = registration.options ?? {};
    const input =
      trigger.mapInput?.(event) ?? baseOptions.input ?? event.payload;
    const context = trigger.mapContext?.(event) ?? baseOptions.context;
    const conversationId =
      trigger.mapConversationId?.(event) ?? baseOptions.conversationId;
    // DEBUG

    this.metrics.workflowRuns += 1;

    try {
      const result = await this.executeWorkflow(registration, {
        ...baseOptions,
        input,
        context,
        event,
        conversationId,
      });

      if (result.status === "failed") {
        this.metrics.workflowErrors += 1;
      }

      return result;
    } catch (error: unknown) {
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
  private mergeMemory(
    base?: ConversationMemory,
    override?: ConversationMemory,
  ): ConversationMemory | undefined {
    if (!base && !override) {
      return undefined;
    }
    return { ...(base ?? {}), ...(override ?? {}) };
  }

  /**
   * ワークフローの実行記録を実行ストアに保存する。
   *
   * 実行ストアが設定されていない場合は何もしない。
   * 保存中のエラーはエラーハンドラーがあればそちらに委譲し、なければ再スローする。
   *
   * @param result - ワークフローの実行結果
   */
  private async saveRunRecord(result: WorkflowRunResult): Promise<void> {
    if (!this.runStore) {
      return;
    }
    const record = toRunRecord(result);
    try {
      await this.runStore.save(record);
    } catch (error: unknown) {
      const err =
        error instanceof Error
          ? error
          : new RuntimeError(String(error), { cause: error });
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
  private async executeWorkflow(
    registration: AnyRegisteredWorkflow,
    options: WorkflowRunOptions<unknown, unknown>,
  ): Promise<WorkflowRunResult> {
    const workflow = registration.workflow;
    if (workflow.type !== "chatflow") {
      const result = await this.runner.run(workflow, options);
      await this.saveRunRecord(result);
      return result;
    }

    const conversationId = options.conversationId;
    if (!conversationId || conversationId.trim().length === 0) {
      throw new InvalidArgumentError(CHATFLOW_REQUIRES_CONVERSATION_ID);
    }

    return this.withConversationLock(conversationId, async () => {
      const store = this.getConversationStore();
      const storedMemory = await store.get(conversationId);
      const memory = this.mergeMemory(storedMemory, options.memory);

      const result = await this.runner.run(workflow, {
        ...options,
        conversationId,
        memory,
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
  private getTriggeredWorkflows(event: Event): EventRegisteredWorkflow[] {
    // DEBUG: trace event matching
    const candidates = new Set<EventRegisteredWorkflow>();

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

    const matches: EventRegisteredWorkflow[] = [];
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
  private matchesEventType(
    matcher: EventTrigger<Event, unknown, unknown>["eventType"],
    eventType: string,
  ): boolean {
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
  private indexWorkflow(registration: AnyRegisteredWorkflow): void {
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
  private unindexWorkflow(registration: AnyRegisteredWorkflow): void {
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
  private addEventIndex(
    eventType: string,
    registration: EventRegisteredWorkflow,
  ): void {
    const bucket = this.eventWorkflowIndex.get(eventType);
    if (bucket) {
      bucket.add(registration);
      return;
    }

    this.eventWorkflowIndex.set(eventType, new Set([registration]));
  }

  /**
   * イベントタイプからワークフローへのマッピングをSetから削除する。
   *
   * バケットが空になった場合はバケット自体も削除する。
   *
   * @param eventType - イベントタイプ
   * @param registration - 削除するワークフロー登録情報
   */
  private removeEventIndex(
    eventType: string,
    registration: EventRegisteredWorkflow,
  ): void {
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
  private isEventRegistration(
    registration: AnyRegisteredWorkflow,
  ): registration is EventRegisteredWorkflow {
    return registration.trigger.type === "event";
  }

  /**
   * デキューされたメッセージが {@link QueueMessage} 型かどうかを判定する型ガード。
   *
   * @param message - 判定対象のメッセージ
   * @returns QueueMessage型の場合は `true`
   */
  private isQueueMessage(message: DequeuedEvent): message is QueueMessage {
    return typeof (message as QueueMessage).event !== "undefined";
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
  private async handleWorkflowError(
    error: Error,
    registration: EventRegisteredWorkflow,
    event: Event,
  ): Promise<void> {
    if (!this.onWorkflowError) {
      return;
    }

    try {
      await this.onWorkflowError(error, {
        workflowId: registration.workflow.id,
        event,
        trigger: registration.trigger,
      });
    } catch {
      // Ignore errors raised by the error handler itself.
    }
  }
}
