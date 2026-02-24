import { expect, test } from "vitest";
import {
  InvalidArgumentError,
  RuntimeError,
  StateError,
} from "../core/index.js";
import {
  InMemoryConversationStore,
  Node,
  Workflow,
} from "../workflow/index.js";
import type { RunStore, WorkflowRunRecord } from "../workflow/run-store.js";
import {
  type CronJobHandler,
  type CronScheduler,
  Orchestrator,
} from "./orchestrator.js";

const CRON_EXPRESSION = "* * * * *";
const JOB_ID = "job";
const WORKFLOW_ID = "wf";
const CHATFLOW_ID = "chatflow";
const NODE_ID = "task";
const EVENT_TYPE = "event.alpha";
const EVENT_TYPE_B = "event.beta";
const REGEX_EVENT = "event.regex";
const CONVERSATION_ID = "conv";
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const SAVE_ERROR_MESSAGE = "save failed";

class FakeScheduler implements CronScheduler {
  start(): void {}
  stop(): void {}
  addJob(_id: string, _cron: string, _handler: CronJobHandler): void {}
  removeJob(_id: string): boolean {
    return false;
  }
  isJobScheduled(_id: string): boolean {
    return false;
  }
}

class FailingRunStore implements RunStore {
  async save(_record: WorkflowRunRecord): Promise<void> {
    throw new RuntimeError(SAVE_ERROR_MESSAGE);
  }

  async get(_runId: string): Promise<WorkflowRunRecord | undefined> {
    return undefined;
  }
}

const createWorkflow = (): Workflow =>
  new Workflow({
    id: WORKFLOW_ID,
    nodes: [
      new Node({
        id: NODE_ID,
        handler: () => {
          return { ok: true };
        },
      }),
    ],
  });

const createChatflow = (): Workflow =>
  new Workflow({
    id: CHATFLOW_ID,
    type: "chatflow",
    nodes: [
      new Node({
        id: NODE_ID,
        handler: () => {
          return { ok: true };
        },
      }),
    ],
  });

test("cron APIs throw without scheduler", () => {
  const orchestrator = new Orchestrator();

  expect(() =>
    orchestrator.registerCronJob(JOB_ID, CRON_EXPRESSION, () => {}),
  ).toThrow(StateError);
});

test("chatflow runWorkflow requires conversationId", async () => {
  const store = new InMemoryConversationStore();
  const orchestrator = new Orchestrator({ conversationStore: store });
  orchestrator.registerWorkflow(createChatflow());

  await expect(orchestrator.runWorkflow(CHATFLOW_ID)).rejects.toThrow(
    InvalidArgumentError,
  );
});

test("chatflow runWorkflow requires conversationStore", async () => {
  const orchestrator = new Orchestrator();
  orchestrator.registerWorkflow(createChatflow());

  await expect(
    orchestrator.runWorkflow(CHATFLOW_ID, { conversationId: CONVERSATION_ID }),
  ).rejects.toThrow(StateError);
});

test("registerCronWorkflow rejects chatflow", () => {
  const scheduler = new FakeScheduler();
  const orchestrator = new Orchestrator({ scheduler });
  orchestrator.registerWorkflow(createChatflow());

  expect(() =>
    orchestrator.registerCronWorkflow(JOB_ID, CRON_EXPRESSION, CHATFLOW_ID),
  ).toThrow(InvalidArgumentError);
});

test("regex matcher resets lastIndex", async () => {
  const orchestrator = new Orchestrator();
  let runs = ZERO;

  const workflow = new Workflow({
    id: WORKFLOW_ID,
    nodes: [
      new Node({
        id: NODE_ID,
        handler: () => {
          runs += ONE;
        },
      }),
    ],
  });

  const regex = /event\.regex/g;
  orchestrator.registerWorkflow(workflow, {
    type: "event",
    eventType: regex,
  });

  orchestrator.start();
  orchestrator.publish(REGEX_EVENT);
  orchestrator.publish(REGEX_EVENT);
  await orchestrator.drain();
  await orchestrator.stop();

  expect(runs).toBe(TWO);
});

test("array matcher handles wildcard and unregister", async () => {
  const orchestrator = new Orchestrator();
  let runs = ZERO;

  const workflow = new Workflow({
    id: WORKFLOW_ID,
    nodes: [
      new Node({
        id: NODE_ID,
        handler: () => {
          runs += ONE;
        },
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow, {
    type: "event",
    eventType: [EVENT_TYPE, "*"],
  });

  orchestrator.start();
  orchestrator.publish(EVENT_TYPE_B);
  await orchestrator.drain();

  expect(runs).toBe(ONE);
  expect(orchestrator.unregisterWorkflow(WORKFLOW_ID)).toBe(true);

  orchestrator.publish(EVENT_TYPE_B);
  await orchestrator.drain();
  await orchestrator.stop();

  expect(runs).toBe(ONE);
});

test("runStore errors invoke handler when provided", async () => {
  const runStore = new FailingRunStore();
  let handled = ZERO;
  let handledId = "";
  const orchestrator = new Orchestrator({
    runStore,
    onRunStoreError: (_error, record) => {
      handled += ONE;
      handledId = record.workflowId;
    },
  });

  orchestrator.registerWorkflow(createWorkflow());

  const result = await orchestrator.runWorkflow(WORKFLOW_ID);

  expect(result.status).toBe("succeeded");
  expect(handled).toBe(ONE);
  expect(handledId).toBe(WORKFLOW_ID);
});

test("runStore errors propagate without handler", async () => {
  const runStore = new FailingRunStore();
  const orchestrator = new Orchestrator({ runStore });

  orchestrator.registerWorkflow(createWorkflow());

  await expect(orchestrator.runWorkflow(WORKFLOW_ID)).rejects.toThrow(
    RuntimeError,
  );
});

test("onWorkflowError swallows handler failures", async () => {
  let handled = ZERO;
  const orchestrator = new Orchestrator({
    onWorkflowError: () => {
      handled += ONE;
      throw new RuntimeError("handler failed");
    },
  });

  const workflow = new Workflow({
    id: WORKFLOW_ID,
    nodes: [
      new Node({
        id: NODE_ID,
        dependsOn: ["missing"],
        handler: () => {
          return { ok: false };
        },
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow, {
    type: "event",
    eventType: EVENT_TYPE,
  });

  orchestrator.start();
  orchestrator.publish(EVENT_TYPE);
  await orchestrator.drain();
  await orchestrator.stop();

  expect(handled).toBe(ONE);
});
