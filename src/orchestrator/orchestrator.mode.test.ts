import { expect, test } from "vitest";
import { StateError } from "../core/errors.js";
import {
  type CronJobHandler,
  type CronScheduler,
  Orchestrator,
} from "./orchestrator.js";

const CRON_EXPRESSION = "* * * * *";
const JOB_ID = "job";
const ZERO = 0;

class FakeScheduler implements CronScheduler {
  startCalls = 0;
  stopCalls = 0;
  jobs = new Map<string, CronJobHandler>();

  start(): void {
    this.startCalls += 1;
  }

  stop(): void {
    this.stopCalls += 1;
  }

  addJob(id: string, _cron: string, handler: CronJobHandler): void {
    this.jobs.set(id, handler);
  }

  removeJob(id: string): boolean {
    return this.jobs.delete(id);
  }

  isJobScheduled(id: string): boolean {
    return this.jobs.has(id);
  }
}

test("producer mode disables drain", async () => {
  const orchestrator = new Orchestrator({ mode: "producer" });
  await expect(orchestrator.drain()).rejects.toThrow(StateError);
});

test("worker mode does not start scheduler", async () => {
  const scheduler = new FakeScheduler();
  const orchestrator = new Orchestrator({ mode: "worker", scheduler });

  orchestrator.registerCronJob(JOB_ID, CRON_EXPRESSION, () => {});

  orchestrator.start();
  expect(scheduler.startCalls).toBe(ZERO);

  await orchestrator.stop();
  expect(scheduler.stopCalls).toBe(ZERO);
});
