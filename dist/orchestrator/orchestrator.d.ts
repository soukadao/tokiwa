import type { DistributedLock } from "../core/lock.js";
import type { ConversationStore } from "../workflow/conversation-store.js";
import type { RunStore, WorkflowRunRecord } from "../workflow/run-store.js";
import { Runner, type WorkflowRunOptions, type WorkflowRunResult } from "../workflow/runner.js";
import type { Trigger } from "../workflow/trigger.js";
import type { Workflow } from "../workflow/workflow.js";
import { Event, type EventMetadata } from "./event.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type { EventQueue } from "./event-queue.js";
import { Snapshot } from "./snapshot.js";
export type CronJobHandler = () => void | Promise<void>;
export interface CronScheduler {
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    addJob(id: string, cronExpression: string, handler: CronJobHandler, name?: string): void;
    removeJob(id: string): boolean;
    isJobScheduled(id: string): boolean;
}
export interface WorkflowErrorContext {
    workflowId: string;
    event: Event;
    trigger: Trigger<Event, unknown, unknown>;
}
export type WorkflowErrorHandler = (error: Error, context: WorkflowErrorContext) => void | Promise<void>;
export type OrchestratorMode = "all" | "producer" | "worker";
export type AckPolicy = "always" | "onSuccess";
export type RunStoreErrorHandler = (error: Error, record: WorkflowRunRecord) => void | Promise<void>;
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
/**
 * ワークフローの登録、イベントのパブリッシュ、キュー処理、cronスケジューリングを管理する中央コーディネーター。
 *
 * オーケストレーターは「producer」「worker」「all」の3つのモードで動作し、
 * イベント駆動型ワークフローの実行ライフサイクル全体を統括する。
 */
export declare class Orchestrator {
    readonly dispatcher: EventDispatcher;
    readonly queue: EventQueue;
    readonly runner: Runner;
    private readonly workflows;
    private readonly eventWorkflowIndex;
    private readonly wildcardEventWorkflows;
    private readonly regexEventWorkflows;
    private readonly maxConcurrentEvents;
    private readonly workflowConcurrency;
    private readonly mode;
    private readonly ackPolicy;
    private readonly scheduler?;
    private readonly onWorkflowError?;
    private readonly conversationStore?;
    private readonly conversationLock?;
    private readonly conversationLockTtlMs;
    private readonly conversationLockRefreshMs;
    private readonly conversationLockRetryCount;
    private readonly conversationLockRetryDelayMs;
    private readonly conversationLockKeyPrefix;
    private readonly runStore?;
    private readonly onRunStoreError?;
    private readonly conversationLocks;
    private isRunning;
    private processing;
    private metrics;
    /**
     * オーケストレーターを初期化する。
     *
     * 同時実行数、動作モード、ack ポリシー、会話ストア、分散ロック、実行ストアなどのオプションを設定する。
     *
     * @param options - オーケストレーターの設定オプション
     */
    constructor(options?: OrchestratorOptions);
    /**
     * オーケストレーターを開始する。
     *
     * 動作モードに応じてスケジューラーの起動やワーカーループの開始を行う。
     * 既に起動中の場合は何もしない。
     */
    start(): void;
    /**
     * オーケストレーターを正常に停止する。
     *
     * 実行中の処理の完了を待機し、スケジューラーを停止する。
     */
    stop(): Promise<void>;
    /**
     * 新しいイベントを作成してキューに追加する。
     *
     * @param type - イベントタイプ
     * @param payload - イベントのペイロード
     * @param metadata - イベントのメタデータ
     * @returns 作成されたイベント
     */
    publish<TPayload = unknown>(type: string, payload?: TPayload, metadata?: EventMetadata): Event<TPayload>;
    /**
     * 既存のイベントをキューに追加する。
     *
     * オーケストレーターが起動中かつワーカーモードの場合、キュー処理を自動的にトリガーする。
     *
     * @param event - キューに追加するイベント
     */
    enqueue(event: Event): void;
    /**
     * キューに溜まった全イベントを同期的に処理する。
     *
     * ワーカーモードでのみ使用可能。プロデューサーモードでは {@link StateError} をスローする。
     *
     * @throws {StateError} プロデューサーモードで呼び出された場合
     */
    drain(): Promise<void>;
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
    registerWorkflow<Context = unknown, Input = unknown>(workflow: Workflow<Context, Input>, trigger?: Trigger<Event, Input, Context>, options?: WorkflowRunOptions<Context, Input>): void;
    /**
     * スケジューラーを通じてcronジョブを登録する。
     *
     * @param jobId - ジョブの一意識別子
     * @param cronExpression - cron式（例: "0 * * * *"）
     * @param handler - 実行するハンドラー関数
     * @param name - ジョブの表示名（任意）
     * @throws {StateError} スケジューラーが設定されていない場合
     */
    registerCronJob(jobId: string, cronExpression: string, handler: CronJobHandler, name?: string): void;
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
    registerCronEvent<TPayload = unknown>(jobId: string, cronExpression: string, eventType: string, payload?: TPayload, metadata?: EventMetadata, name?: string): void;
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
    registerCronWorkflow<Context = unknown, Input = unknown>(jobId: string, cronExpression: string, workflowId: string, options?: WorkflowRunOptions<Context, Input>, name?: string): void;
    /**
     * 登録済みのcronジョブを削除する。
     *
     * @param jobId - 削除するジョブのID
     * @returns ジョブが存在して削除された場合は `true`
     */
    removeCronJob(jobId: string): boolean;
    /**
     * 指定されたcronジョブが登録されているかどうかを確認する。
     *
     * @param jobId - 確認するジョブのID
     * @returns ジョブが登録されている場合は `true`
     */
    isCronJobScheduled(jobId: string): boolean;
    /**
     * 登録済みのワークフローを削除する。
     *
     * ワークフローに関連するイベントインデックスも合わせて削除される。
     *
     * @param workflowId - 削除するワークフローのID
     * @returns ワークフローが存在して削除された場合は `true`
     */
    unregisterWorkflow(workflowId: string): boolean;
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
    runWorkflow<Context = unknown, Input = unknown>(workflowId: string, options?: WorkflowRunOptions<Context, Input>): Promise<WorkflowRunResult>;
    /**
     * オーケストレーターの現在の状態のスナップショットを作成する。
     *
     * 実行状態、モード、キューサイズ、メトリクスを含むスナップショットを返す。
     *
     * @returns オーケストレーターの状態スナップショット
     */
    snapshot(): Promise<Snapshot>;
    /**
     * キューの現在のサイズを取得する。
     *
     * @returns キュー内のイベント数
     */
    private getQueueSize;
    /**
     * キュー処理をチェーンして実行する。
     *
     * 前回の処理が完了した後に次の処理を開始し、処理の直列化を保証する。
     *
     * @param allowWhenStopped - 停止中でも処理を許可するかどうか
     */
    private kick;
    /**
     * スケジューラーを返す。設定されていない場合は例外をスローする。
     *
     * @returns 設定済みのcronスケジューラー
     * @throws {StateError} スケジューラーが設定されていない場合
     */
    private getScheduler;
    /**
     * 会話ストアを返す。設定されていない場合は例外をスローする。
     *
     * @returns 設定済みの会話ストア
     * @throws {StateError} 会話ストアが設定されていない場合
     */
    private getConversationStore;
    /**
     * 現在のモードがワーカーモード（「producer」以外）かどうかを判定する。
     *
     * @returns ワーカーモードの場合は `true`
     */
    private isWorkerMode;
    /**
     * スケジューラーを起動すべきかどうかを判定する（「worker」以外のモードで起動する）。
     *
     * @returns スケジューラーを起動すべき場合は `true`
     */
    private shouldStartScheduler;
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
    private withConversationLock;
    /**
     * ローカル会話ロック（Promiseチェーン）を使用してタスクを実行する。
     *
     * 同一会話IDに対する処理を直列化し、同時実行による競合を防止する。
     *
     * @param conversationId - ロック対象の会話ID
     * @param task - ロック取得後に実行するタスク
     * @returns タスクの実行結果
     */
    private withLocalConversationLock;
    /**
     * リトライ付きで分散ロックを取得する。
     *
     * 設定されたリトライ回数と遅延に従って、ロック取得を繰り返し試行する。
     *
     * @param key - ロックキー
     * @returns 取得したロックハンドル。取得できなかった場合は `null`
     */
    private acquireConversationLock;
    /**
     * 指定ミリ秒間の遅延を行うシンプルなスリープ関数。
     *
     * @param ms - 遅延するミリ秒数
     */
    private sleep;
    /**
     * メインのキュー処理ループ。同時実行数を制御しながらイベントを処理する。
     *
     * 設定された最大同時実行数まで並列にイベントを処理し、
     * キューが空になるか停止されるまでループを継続する。
     *
     * @param allowWhenStopped - 停止中でも処理を許可するかどうか
     */
    private processQueue;
    /**
     * デキューされたメッセージからイベントとack/nackコールバックを抽出する。
     *
     * {@link QueueMessage} 形式の場合はイベントとコールバックを分離し、
     * 単純なイベントの場合はそのまま返す。
     *
     * @param message - デキューされたメッセージ
     * @returns イベントとオプションのack/nackコールバック
     */
    private normalizeQueueMessage;
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
    private handleQueueAck;
    /**
     * nack理由の文字列をフォーマットする。
     *
     * @param result - 処理結果
     * @returns ディスパッチエラー数とワークフロー失敗数を含む理由文字列
     */
    private buildNackReason;
    /**
     * 単一のイベントを処理する。ディスパッチとトリガーされたワークフローの実行を行う。
     *
     * @param event - 処理するイベント
     * @returns ディスパッチエラー数とワークフロー失敗数を含む処理結果
     */
    private processEvent;
    /**
     * イベントによってトリガーされた全ワークフローを並行実行する。
     *
     * ワークフロー同時実行数の制限に従い、並列で実行する。
     *
     * @param event - トリガー元のイベント
     * @returns 失敗したワークフローの数
     */
    private runTriggeredWorkflows;
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
    private executeTriggeredWorkflow;
    /**
     * 2つの会話メモリオブジェクトをマージする。
     *
     * 両方が未定義の場合は `undefined` を返す。
     *
     * @param base - ベースとなるメモリ
     * @param override - 上書きするメモリ
     * @returns マージされたメモリ、または両方未定義の場合は `undefined`
     */
    private mergeMemory;
    /**
     * ワークフローの実行記録を実行ストアに保存する。
     *
     * 実行ストアが設定されていない場合は何もしない。
     * 保存中のエラーはエラーハンドラーがあればそちらに委譲し、なければ再スローする。
     *
     * @param result - ワークフローの実行結果
     */
    private saveRunRecord;
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
    private executeWorkflow;
    /**
     * イベントタイプに一致するトリガーを持つ全ワークフローを検索する。
     *
     * 完全一致、ワイルドカード、正規表現のインデックスを順に検索し、
     * さらにフィルター関数による絞り込みを行う。
     *
     * @param event - マッチング対象のイベント
     * @returns トリガー条件に一致したワークフローの配列
     */
    private getTriggeredWorkflows;
    /**
     * イベントタイプがトリガーのマッチャーに一致するかを判定する。
     *
     * 正規表現、配列、ワイルドカード（"*"）、文字列の完全一致に対応する。
     *
     * @param matcher - トリガーのイベントタイプマッチャー
     * @param eventType - 判定対象のイベントタイプ
     * @returns 一致する場合は `true`
     */
    private matchesEventType;
    /**
     * ワークフローをイベントタイプインデックスに追加する。
     *
     * トリガーのタイプに応じて、完全一致インデックス、ワイルドカードセット、
     * または正規表現セットに登録する。
     *
     * @param registration - インデックスに追加するワークフロー登録情報
     */
    private indexWorkflow;
    /**
     * ワークフローをイベントタイプインデックスから削除する。
     *
     * トリガーのタイプに応じて、該当するインデックスから登録を除去する。
     *
     * @param registration - インデックスから削除するワークフロー登録情報
     */
    private unindexWorkflow;
    /**
     * イベントタイプからワークフローへのマッピングをSetに追加する。
     *
     * 該当するイベントタイプのバケットが存在しない場合は新規作成する。
     *
     * @param eventType - イベントタイプ
     * @param registration - 追加するワークフロー登録情報
     */
    private addEventIndex;
    /**
     * イベントタイプからワークフローへのマッピングをSetから削除する。
     *
     * バケットが空になった場合はバケット自体も削除する。
     *
     * @param eventType - イベントタイプ
     * @param registration - 削除するワークフロー登録情報
     */
    private removeEventIndex;
    /**
     * 登録情報がイベントトリガー型かどうかを判定する型ガード。
     *
     * @param registration - 判定対象のワークフロー登録情報
     * @returns イベントトリガー型の場合は `true`
     */
    private isEventRegistration;
    /**
     * デキューされたメッセージが {@link QueueMessage} 型かどうかを判定する型ガード。
     *
     * @param message - 判定対象のメッセージ
     * @returns QueueMessage型の場合は `true`
     */
    private isQueueMessage;
    /**
     * ワークフローエラーハンドラーを呼び出す。ハンドラー自体のエラーは無視する。
     *
     * エラーハンドラーが設定されていない場合は何もしない。
     *
     * @param error - 発生したエラー
     * @param registration - エラーが発生したワークフローの登録情報
     * @param event - エラーのトリガーとなったイベント
     */
    private handleWorkflowError;
}
