import { expect, test, vi } from "vitest";
import { generateId, NotFoundError } from "../core/index.js";
import { Node, Workflow } from "../workflow/index.js";
import {
  type CronJobHandler,
  type CronScheduler,
  Orchestrator,
} from "./orchestrator.js";

const CRON_EXPRESSION = "* * * * *";
const EVENT_TYPE = "system.tick";
const JOB_NAME = "cron-job";

class FakeScheduler implements CronScheduler {
  public start = vi.fn();
  public stop = vi.fn();
  public addJob = vi.fn(
    (_cron: string, _name: string, handler: CronJobHandler): string => {
      const id = generateId();
      this.jobs.set(id, handler);
      return id;
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

  const jobId = orchestrator.registerCronEvent(
    CRON_EXPRESSION,
    EVENT_TYPE,
    JOB_NAME,
  );
  orchestrator.start();

  await scheduler.run(jobId);
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
  const jobId = orchestrator.registerCronWorkflow(
    CRON_EXPRESSION,
    workflow.id,
    JOB_NAME,
  );

  await scheduler.run(jobId);

  expect(runs).toBe(1);
});
