import type { DistributedLock, LockHandle } from "../core/lock.js";
import type { CronScheduler } from "../orchestrator/orchestrator.js";

const DEFAULT_LOCK_KEY = "tokiwa:locks:cron";
const DEFAULT_LOCK_TTL_MS = 60_000;
const DEFAULT_REFRESH_INTERVAL_MS = 20_000;
const DEFAULT_RETRY_INTERVAL_MS = 5_000;

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
export class LeaderScheduler implements CronScheduler {
  private readonly scheduler: CronScheduler;
  private readonly lock: DistributedLock;
  private readonly lockKey: string;
  private readonly lockTtlMs: number;
  private readonly refreshIntervalMs: number;
  private readonly retryIntervalMs: number;
  private running = false;
  private leaderHandle: LockHandle | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private schedulerStarted = false;

  /**
   * スケジューラー、ロック、タイミングオプションで初期化する。
   * @param options スケジューラー、ロック、およびタイミング設定を含むオプション
   */
  constructor(options: LeaderSchedulerOptions) {
    this.scheduler = options.scheduler;
    this.lock = options.lock;
    this.lockKey = options.lockKey ?? DEFAULT_LOCK_KEY;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.refreshIntervalMs =
      options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  }

  /**
   * リーダー選出を開始する。ロックの取得を試み、成功すればスケジューラーを起動する。
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.tryAcquire();
  }

  /**
   * スケジューラーを停止し、リーダーシップを解放する。
   */
  async stop(): Promise<void> {
    this.running = false;
    this.clearRetry();
    await this.stopLeader();
  }

  /**
   * 内部スケジューラーにジョブを追加する。
   * @param cronExpression cron式文字列
   * @param name ジョブの表示名
   * @param handler ジョブ実行時に呼び出されるハンドラー
   * @returns 生成されたジョブID
   */
  addJob(
    cronExpression: string,
    name: string,
    handler: () => void | Promise<void>,
  ): string {
    return this.scheduler.addJob(cronExpression, name, handler);
  }

  /**
   * 内部スケジューラーからジョブを削除する。
   * @param id 削除対象のジョブID
   * @returns ジョブが存在し削除された場合true
   */
  removeJob(id: string): boolean {
    return this.scheduler.removeJob(id);
  }

  /**
   * 指定されたIDのジョブが登録されているか確認する。
   * @param id 確認対象のジョブID
   * @returns ジョブが登録されている場合true
   */
  isJobScheduled(id: string): boolean {
    return this.scheduler.isJobScheduled(id);
  }

  /**
   * リーダーシップロックの取得を試みる。取得成功時はリーダーとして起動し、失敗時はリトライをスケジュールする。
   */
  private async tryAcquire(): Promise<void> {
    if (!this.running) {
      return;
    }

    const handle = await this.lock.acquire(this.lockKey, {
      ttlMs: this.lockTtlMs,
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
  private startLeader(): void {
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
  private async refresh(): Promise<void> {
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
  private async demote(): Promise<void> {
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
  private scheduleRetry(): void {
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
  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * リフレッシュタイマーをクリアする。
   */
  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * スケジューラーを停止し、ロックを解放してリーダーシップを終了する。
   */
  private async stopLeader(): Promise<void> {
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
}
