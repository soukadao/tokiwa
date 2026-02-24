import { Logger } from "../core/logger.js";
import { Cron } from "./cron.js";

type JobHandler = () => void | Promise<void>;

interface Job {
  id: string;
  cron: Cron;
  handler: JobHandler;
  name?: string;
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
   * Adds or replaces a job by id.
   */
  public addJob(
    id: string,
    cronExpression: string,
    handler: JobHandler,
    name?: string,
  ): void {
    const cron = new Cron(cronExpression);
    const job: Job = { id, cron, handler, name };
    this.jobs.set(id, job);
    this.lastRunKeyByJob.delete(id);
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

  private scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }

    const delay =
      this.checkIntervalMs === DEFAULT_CHECK_INTERVAL_MS
        ? Scheduler.getDelayUntilNextMinute(new Date())
        : this.checkIntervalMs;
    this.timerId = setTimeout(this.handleTick, delay);
  }

  private handleTick = (): void => {
    void this.checkAndExecuteJobs();
    this.scheduleNextCheck();
  };

  private async checkAndExecuteJobs(): Promise<void> {
    const now = new Date();
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

  private clearTimer(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

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

  private async waitForInFlight(): Promise<void> {
    if (this.inFlight.size === 0) {
      return;
    }
    await Promise.allSettled(this.inFlight);
  }

  private static getDelayUntilNextMinute(now: Date): number {
    const nextMinute = new Date(now);
    nextMinute.setSeconds(RESET_SECONDS, RESET_MILLISECONDS);
    nextMinute.setMinutes(nextMinute.getMinutes() + NEXT_MINUTE_INCREMENT);
    return nextMinute.getTime() - now.getTime();
  }

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
}
