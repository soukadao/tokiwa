import { expect, test, vi } from "vitest";
import { NotFoundError } from "../core/index.js";
import { Node, Workflow } from "../workflow/index.js";
import {
  type CronJobHandler,
  type CronScheduler,
  Orchestrator,
} from "./orchestrator.js";

const CRON_EXPRESSION = "* * * * *";
const CRON_JOB_ID = "cron-job";
const EVENT_TYPE = "system.tick";

class FakeScheduler implements CronScheduler {
  public start = vi.fn();
  public stop = vi.fn();
  public addJob = vi.fn(
    (id: string, _cron: string, handler: CronJobHandler): void => {
      this.jobs.set(id, handler);
    },
  );
  public removeJob = vi.fn((id: string): boolean => this.jobs.delete(id));
  public isJobScheduled = vi.fn((id: string): boolean => this.jobs.has(id));

  private readonly jobs = new Map<string, CronJobHandler>();

  async run(jobId: string): Promise<void> {
    const handler = this.jobs.get(jobId);
    if (!handler) {
      throw new NotFoundError(`Missing job: ${jobId}`);
    }
    await handler();
  }
}

test("start/stop delegates to scheduler", async () => {
  const scheduler = new FakeScheduler();
  const orchestrator = new Orchestrator({ scheduler });

  orchestrator.start();
  await orchestrator.stop();

  expect(scheduler.start).toHaveBeenCalledTimes(1);
  expect(scheduler.stop).toHaveBeenCalledTimes(1);
});

test("registerCronEvent publishes an event", async () => {
  const scheduler = new FakeScheduler();
  const orchestrator = new Orchestrator({ scheduler });
  let delivered = 0;

  orchestrator.dispatcher.subscribe(EVENT_TYPE, () => {
    delivered += 1;
  });

  orchestrator.registerCronEvent(CRON_JOB_ID, CRON_EXPRESSION, EVENT_TYPE);
  orchestrator.start();

  await scheduler.run(CRON_JOB_ID);
  await orchestrator.drain();

  expect(delivered).toBe(1);
  await orchestrator.stop();
});

test("registerCronWorkflow runs a workflow", async () => {
  const scheduler = new FakeScheduler();
  const orchestrator = new Orchestrator({ scheduler });
  let runs = 0;

  const workflow = new Workflow({
    nodes: [
      new Node({
        handler: () => {
          runs += 1;
        },
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow);
  orchestrator.registerCronWorkflow(CRON_JOB_ID, CRON_EXPRESSION, workflow.id);

  await scheduler.run(CRON_JOB_ID);

  expect(runs).toBe(1);
});
