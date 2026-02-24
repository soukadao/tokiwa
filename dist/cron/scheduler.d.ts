import { Cron } from "./cron.js";
type JobHandler = () => void | Promise<void>;
interface Job {
    id: string;
    cron: Cron;
    handler: JobHandler;
    name: string;
}
export interface SchedulerLogger {
    error(message: string, context?: Record<string, unknown>): void;
}
export interface SchedulerOptions {
    checkIntervalMs?: number;
    logger?: SchedulerLogger;
}
/**
 * Runs cron jobs on minute boundaries using local time.
 * When checkIntervalMs is set, it checks at a fixed interval and avoids duplicate runs per minute.
 */
export declare class Scheduler {
    private readonly jobs;
    private timerId;
    private isRunning;
    private checkIntervalMs;
    private readonly logger;
    private readonly inFlight;
    private readonly lastRunKeyByJob;
    /**
     * @param options Default is minute boundary scheduling.
     */
    constructor(options?: SchedulerOptions | number);
    /**
     * Adds a job with a generated id.
     * @param cronExpression cron式文字列
     * @param name ジョブの表示名
     * @param handler ジョブ実行時に呼び出されるハンドラー
     * @returns 生成されたジョブID
     */
    addJob(cronExpression: string, name: string, handler: JobHandler): string;
    /**
     * Removes a job by id.
     */
    removeJob(id: string): boolean;
    /**
     * Returns a job by id, if present.
     */
    getJob(id: string): Job | undefined;
    /**
     * Returns all registered jobs.
     */
    getAllJobs(): Job[];
    /**
     * Starts scheduling if not already running.
     */
    start(): void;
    /**
     * Stops scheduling and clears the pending timer.
     */
    stop(): Promise<void>;
    /**
     * 次のタイマーティックをスケジュールする。
     * デフォルト間隔の場合は次の分境界まで、それ以外はcheckIntervalMsで待機する。
     */
    private scheduleNextCheck;
    /**
     * タイマーコールバック。ジョブの実行チェックを行い、次のティックを再スケジュールする。
     */
    private handleTick;
    /**
     * 全ジョブを現在時刻と照合し、一致するジョブを実行する。
     * 同一分内での重複実行を防止するためミニットキーで管理する。
     */
    private checkAndExecuteJobs;
    /**
     * 保留中のsetTimeoutタイマーをクリアする。
     */
    private clearTimer;
    /**
     * ジョブのハンドラーを実行し、エラー発生時はログに記録する。
     * 実行中のジョブはinFlightセットで追跡される。
     * @param job 実行対象のジョブ
     * @returns ジョブ完了を表すPromise
     */
    private runJob;
    /**
     * 実行中の全ジョブが完了するまで待機する。
     */
    private waitForInFlight;
    /**
     * 現在時刻から次の分境界までのミリ秒数を計算する。
     * @param now 現在時刻
     * @returns 次の分境界までのミリ秒数
     */
    private static getDelayUntilNextMinute;
    /**
     * 指定された日時から分単位の一意キーを生成する。重複実行防止に使用される。
     * @param date キー生成対象の日時
     * @returns "年-月-日-時-分" 形式の文字列キー
     */
    private static buildMinuteKey;
    /**
     * Returns the next execution time for a job, or null if missing.
     */
    getNextExecutionTime(jobId: string): Date | null;
    /**
     * Returns true when a job id is registered.
     */
    isJobScheduled(jobId: string): boolean;
    /**
     * 既存ジョブと重複しないIDを生成する。
     * @returns ジョブID
     */
    private generateJobId;
}
export {};
