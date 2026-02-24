import { expect, test, vi } from "vitest";
import type { DistributedLock, LockHandle } from "../core/lock.js";
import type { CronScheduler } from "../orchestrator/orchestrator.js";
import { LeaderScheduler } from "./leader-scheduler.js";

const LOCK_KEY = "tokiwa:locks:cron";

class FakeScheduler implements CronScheduler {
  startCalls = 0;
  stopCalls = 0;

  start(): void {
    this.startCalls += 1;
  }

  stop(): void {
    this.stopCalls += 1;
  }

  addJob(): void {}

  removeJob(): boolean {
    return false;
  }

  isJobScheduled(): boolean {
    return false;
  }
}

test("LeaderScheduler starts and stops scheduler when lock is acquired", async () => {
  const handle: LockHandle = { key: LOCK_KEY, token: "token" };
  const lock: DistributedLock = {
    acquire: vi.fn().mockResolvedValue(handle),
    release: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(true),
  };
  const scheduler = new FakeScheduler();
  const leader = new LeaderScheduler({
    scheduler,
    lock,
    lockKey: LOCK_KEY,
    refreshIntervalMs: 0,
  });

  await leader.start();
  expect(scheduler.startCalls).toBe(1);

  await leader.stop();
  expect(scheduler.stopCalls).toBe(1);
  expect(lock.release).toHaveBeenCalledWith(handle);
});
