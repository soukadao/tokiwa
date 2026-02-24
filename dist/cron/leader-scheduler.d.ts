import type { DistributedLock } from "../core/lock.js";
import type { CronScheduler } from "../orchestrator/orchestrator.js";
export interface LeaderSchedulerOptions {
    scheduler: CronScheduler;
    lock: DistributedLock;
    lockKey?: string;
    lockTtlMs?: number;
    refreshIntervalMs?: number;
    retryIntervalMs?: number;
}
/**
 * 分散リーダー選出機能を備えたCronSchedulerラッパー。
 * ロックを取得したインスタンスのみがジョブを実行し、ロック喪失時は自動的にリーダーシップを再取得する。
 */
export declare class LeaderScheduler implements CronScheduler {
    private readonly scheduler;
    private readonly lock;
    private readonly lockKey;
    private readonly lockTtlMs;
    private readonly refreshIntervalMs;
    private readonly retryIntervalMs;
    private running;
    private leaderHandle;
    private refreshTimer;
    private retryTimer;
    private schedulerStarted;
    /**
     * スケジューラー、ロック、タイミングオプションで初期化する。
     * @param options スケジューラー、ロック、およびタイミング設定を含むオプション
     */
    constructor(options: LeaderSchedulerOptions);
    /**
     * リーダー選出を開始する。ロックの取得を試み、成功すればスケジューラーを起動する。
     */
    start(): Promise<void>;
    /**
     * スケジューラーを停止し、リーダーシップを解放する。
     */
    stop(): Promise<void>;
    /**
     * 内部スケジューラーにジョブを追加する。
     * @param id ジョブの一意識別子
     * @param cronExpression cron式文字列
     * @param handler ジョブ実行時に呼び出されるハンドラー
     * @param name ジョブの表示名（省略可）
     */
    addJob(id: string, cronExpression: string, handler: () => void | Promise<void>, name?: string): void;
    /**
     * 内部スケジューラーからジョブを削除する。
     * @param id 削除対象のジョブID
     * @returns ジョブが存在し削除された場合true
     */
    removeJob(id: string): boolean;
    /**
     * 指定されたIDのジョブが登録されているか確認する。
     * @param id 確認対象のジョブID
     * @returns ジョブが登録されている場合true
     */
    isJobScheduled(id: string): boolean;
    /**
     * リーダーシップロックの取得を試みる。取得成功時はリーダーとして起動し、失敗時はリトライをスケジュールする。
     */
    private tryAcquire;
    /**
     * 内部スケジューラーを起動し、ロックのリフレッシュタイマーを開始する。
     */
    private startLeader;
    /**
     * ロックのTTLをリフレッシュする。リフレッシュに失敗した場合は降格処理を行う。
     */
    private refresh;
    /**
     * リーダーシップを放棄する。スケジューラーを停止し、ロックを解放した後、リーダーシップの再取得を試みる。
     */
    private demote;
    /**
     * ロック取得のリトライをretryIntervalMs後にスケジュールする。
     */
    private scheduleRetry;
    /**
     * リトライタイマーをクリアする。
     */
    private clearRetry;
    /**
     * リフレッシュタイマーをクリアする。
     */
    private stopRefresh;
    /**
     * スケジューラーを停止し、ロックを解放してリーダーシップを終了する。
     */
    private stopLeader;
}
