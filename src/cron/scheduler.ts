import { TZDate } from "@date-fns/tz";
import { generateId } from "../core/index.js";
import { Logger } from "../core/logger.js";
import { Cron } from "./cron.js";

type JobHandler = () => void | Promise<void>;

interface Job {
  id: string;
  cron: Cron;
  handler: JobHandler;
  name: string;
}

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
const DEFAULT_CHECK_INTERVAL_MS = MILLISECONDS_PER_MINUTE;
const MIN_CHECK_INTERVAL_MS = 1;
const RESET_SECONDS = 0;
const RESET_MILLISECONDS = 0;
const NEXT_MINUTE_INCREMENT = 1;

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
export class Scheduler {
  private readonly jobs = new Map<string, Job>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS;
  private readonly logger: SchedulerLogger;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly lastRunKeyByJob = new Map<string, string>();

  /**
   * @param options Default is minute boundary scheduling.
   */
  constructor(options: SchedulerOptions | number = {}) {
    if (typeof options === "number") {
      this.checkIntervalMs = options;
      this.logger = new Logger({ level: "error" });
    } else {
      this.checkIntervalMs =
        options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
      this.logger = options.logger ?? new Logger({ level: "error" });
    }

    this.checkIntervalMs = Math.max(
      MIN_CHECK_INTERVAL_MS,
      this.checkIntervalMs,
    );
  }

  /**
   * Adds a job with a generated id.
   * @param cronExpression cron式文字列
   * @param name ジョブの表示名
   * @param handler ジョブ実行時に呼び出されるハンドラー
   * @returns 生成されたジョブID
   */
  public addJob(
    cronExpression: string,
    name: string,
    handler: JobHandler,
  ): string {
    const cron = new Cron(cronExpression);
    const id = this.generateJobId();
    const job: Job = { id, cron, handler, name };
    this.jobs.set(id, job);
    this.lastRunKeyByJob.delete(id);
    return id;
  }

  /**
   * Removes a job by id.
   */
  public removeJob(id: string): boolean {
    this.lastRunKeyByJob.delete(id);
    return this.jobs.delete(id);
  }

  /**
   * Returns a job by id, if present.
   */
  public getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Returns all registered jobs.
   */
  public getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Starts scheduling if not already running.
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleNextCheck();
  }

  /**
   * Stops scheduling and clears the pending timer.
   */
  public async stop(): Promise<void> {
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
  private scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }

    const delay =
      this.checkIntervalMs === DEFAULT_CHECK_INTERVAL_MS
        ? Scheduler.getDelayUntilNextMinute(new TZDate())
        : this.checkIntervalMs;
    this.timerId = setTimeout(this.handleTick, delay);
  }

  /**
   * タイマーコールバック。ジョブの実行チェックを行い、次のティックを再スケジュールする。
   */
  private handleTick = (): void => {
    void this.checkAndExecuteJobs();
    this.scheduleNextCheck();
  };

  /**
   * 全ジョブを現在時刻と照合し、一致するジョブを実行する。
   * 同一分内での重複実行を防止するためミニットキーで管理する。
   */
  private async checkAndExecuteJobs(): Promise<void> {
    const now = new TZDate();
    const minuteKey = Scheduler.buildMinuteKey(now);
    const tasks: Promise<void>[] = [];

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
  private clearTimer(): void {
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
  private runJob(job: Job): Promise<void> {
    const task = (async () => {
      try {
        await job.handler();
      } catch (error: unknown) {
        this.logger.error(`Error executing job ${job.id}`, {
          jobId: job.id,
          name: job.name,
          error,
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
  private async waitForInFlight(): Promise<void> {
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
  private static getDelayUntilNextMinute(now: Date): number {
    const nextMinute = new TZDate(now);
    nextMinute.setSeconds(RESET_SECONDS, RESET_MILLISECONDS);
    nextMinute.setMinutes(nextMinute.getMinutes() + NEXT_MINUTE_INCREMENT);
    return nextMinute.getTime() - now.getTime();
  }

  /**
   * 指定された日時から分単位の一意キーを生成する。重複実行防止に使用される。
   * @param date キー生成対象の日時
   * @returns "年-月-日-時-分" 形式の文字列キー
   */
  private static buildMinuteKey(date: Date): string {
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ].join("-");
  }

  /**
   * Returns the next execution time for a job, or null if missing.
   */
  public getNextExecutionTime(jobId: string): Date | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    return job.cron.getNextExecution();
  }

  /**
   * Returns true when a job id is registered.
   */
  public isJobScheduled(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * 既存ジョブと重複しないIDを生成する。
   * @returns ジョブID
   */
  private generateJobId(): string {
    let id = generateId();
    while (this.jobs.has(id)) {
      id = generateId();
    }
    return id;
  }
}
