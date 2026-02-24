import { expect, test } from "vitest";
import { StateError } from "../core/errors.js";
import {
  type CronJobHandler,
  type CronScheduler,
  Orchestrator,
} from "./orchestrator.js";

const CRON_EXPRESSION = "* * * * *";
const JOB_NAME = "cron-job";
const JOB_ID_PREFIX = "job-";
const JOB_COUNTER_INCREMENT = 1;
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

  addJob(_cron: string, _name: string, handler: CronJobHandler): string {
    const id = `${JOB_ID_PREFIX}${this.jobs.size + JOB_COUNTER_INCREMENT}`;
    this.jobs.set(id, handler);
    return id;
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

  orchestrator.registerCronJob(CRON_EXPRESSION, JOB_NAME, () => {});

  orchestrator.start();
  expect(scheduler.startCalls).toBe(ZERO);

  await orchestrator.stop();
  expect(scheduler.stopCalls).toBe(ZERO);
});
