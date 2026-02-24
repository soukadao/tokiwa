import { expect, test } from "vitest";
import { InvalidArgumentError, RuntimeError } from "../core/index.js";
import { Node, Runner, Workflow } from "./index.js";

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY_MS = 0;
const RETRY_BACKOFF_MULTIPLIER = 1;
const RETRY_WORKFLOW_ID = "retry";
const CHATFLOW_WORKFLOW_ID = "chatflow";
const CONVERSATION_ID = "conv-1";
const MEMORY_KEY = "count";
const INITIAL_COUNT = 0;
const UPDATED_COUNT = 1;
const ZERO = 0;
const ONE = 1;
const HOOK_WORKFLOW_ID = "hooks";
const HOOK_NODE_ID = "hook-node";
const HOOK_INPUT = 7;
const HOOK_RESULT = { ok: true };
const RETRY_NODE_ID = "retry-node";
const RETRY_DELAY_MS = 1;
const RETRY_ATTEMPTS = 2;
const RETRY_JITTER_MS = 0;
const ERROR_NODE_ID = "error-node";
const ERROR_ATTEMPTS = 1;
const MEMORY_WORKFLOW_ID = "memory-flow";
const MEMORY_NODE_ID = "memory-node";
const MEMORY_KEY_A = "a";
const MEMORY_KEY_B = "b";
const MEMORY_KEY_C = "c";
const MEMORY_VALUE_A = 1;
const MEMORY_VALUE_B = 2;
const MEMORY_VALUE_C = 3;

test("runner executes dependencies before dependents", async () => {
  const order: string[] = [];
  const workflow = new Workflow({
    id: "order",
    nodes: [
      new Node({
        id: "A",
        handler: () => {
          order.push("A");
        },
      }),
      new Node({
        id: "B",
        dependsOn: ["A"],
        handler: () => {
          order.push("B");
        },
      }),
      new Node({
        id: "C",
        dependsOn: ["A"],
        handler: () => {
          order.push("C");
        },
      }),
    ],
  });

  const runner = new Runner();
  await runner.run(workflow, { concurrency: 2 });

  const indexA = order.indexOf("A");
  const indexB = order.indexOf("B");
  const indexC = order.indexOf("C");

  expect(indexA).toBeGreaterThanOrEqual(0);
  expect(indexB).toBeGreaterThan(indexA);
  expect(indexC).toBeGreaterThan(indexA);
});

test("runner reports failures without double-recording", async () => {
  const workflow = new Workflow({
    id: "failures",
    nodes: [
      new Node({
        id: "A",
        handler: () => {
          throw new RuntimeError("boom");
        },
      }),
      new Node({
        id: "B",
        handler: () => {},
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow, {
    failFast: false,
    concurrency: 2,
  });

  expect(result.status).toBe("failed");
  expect(result.errors.A).toBeInstanceOf(Error);
});

test("runner throws on missing dependency", async () => {
  const workflow = new Workflow({
    id: "missing",
    nodes: [
      new Node({
        id: "A",
        dependsOn: ["missing"],
        handler: () => {},
      }),
    ],
  });

  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(
    "Node A depends on missing node: missing",
  );
});

test("runner throws on cyclic dependency", async () => {
  const workflow = new Workflow({
    id: "cycle",
    nodes: [
      new Node({
        id: "A",
        dependsOn: ["B"],
        handler: () => {},
      }),
      new Node({
        id: "B",
        dependsOn: ["A"],
        handler: () => {},
      }),
    ],
  });

  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(
    "Workflow contains a cyclic dependency",
  );
});

test("runner retries nodes using retry policy", async () => {
  let attempt = 0;
  const workflow = new Workflow({
    id: RETRY_WORKFLOW_ID,
    nodes: [
      new Node({
        id: "A",
        retry: {
          maxAttempts: RETRY_MAX_ATTEMPTS,
          initialDelayMs: RETRY_INITIAL_DELAY_MS,
          backoffMultiplier: RETRY_BACKOFF_MULTIPLIER,
        },
        handler: () => {
          attempt += 1;
          if (attempt < RETRY_MAX_ATTEMPTS) {
            throw new RuntimeError("retry");
          }
        },
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow);

  expect(attempt).toBe(RETRY_MAX_ATTEMPTS);
  expect(result.attempts.A).toBe(RETRY_MAX_ATTEMPTS);
  expect(result.status).toBe("succeeded");
  expect(result.timeline.some((entry) => entry.type === "node_retry")).toBe(
    true,
  );
});

test("chatflow exposes memory updates", async () => {
  const workflow = new Workflow({
    id: CHATFLOW_WORKFLOW_ID,
    type: "chatflow",
    nodes: [
      new Node({
        id: "writer",
        handler: ({ updateMemory }) => {
          updateMemory?.({ [MEMORY_KEY]: UPDATED_COUNT });
        },
      }),
      new Node({
        id: "reader",
        dependsOn: ["writer"],
        handler: ({ getMemory }) => {
          const memory = getMemory?.();
          if (!memory || memory[MEMORY_KEY] !== UPDATED_COUNT) {
            throw new RuntimeError("memory mismatch");
          }
        },
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow, {
    conversationId: CONVERSATION_ID,
    memory: { [MEMORY_KEY]: INITIAL_COUNT },
  });

  expect(result.conversationId).toBe(CONVERSATION_ID);
  expect(result.memory?.[MEMORY_KEY]).toBe(UPDATED_COUNT);
});

test("runner invokes node lifecycle hooks", async () => {
  const workflow = new Workflow({
    id: HOOK_WORKFLOW_ID,
    nodes: [
      new Node({
        id: HOOK_NODE_ID,
        handler: ({ input }) => ({ ok: input === HOOK_INPUT }),
      }),
    ],
  });

  const events: string[] = [];
  let captured: unknown = null;
  const runner = new Runner();
  await runner.run(workflow, {
    input: HOOK_INPUT,
    onNodeStart: (node) => {
      events.push(`start:${node.id}`);
    },
    onNodeComplete: (node, result) => {
      events.push(`complete:${node.id}`);
      captured = result;
    },
  });

  expect(events).toEqual([`start:${HOOK_NODE_ID}`, `complete:${HOOK_NODE_ID}`]);
  expect(captured).toEqual(HOOK_RESULT);
});

test("runner calls onNodeRetry with delay", async () => {
  let attempt = 0;
  let retryCalled = ZERO;
  let lastDelay = ZERO;
  const workflow = new Workflow({
    id: RETRY_WORKFLOW_ID,
    nodes: [
      new Node({
        id: RETRY_NODE_ID,
        retry: {
          maxAttempts: RETRY_ATTEMPTS,
          initialDelayMs: RETRY_DELAY_MS,
          backoffMultiplier: RETRY_BACKOFF_MULTIPLIER,
          jitterMs: RETRY_JITTER_MS,
        },
        handler: () => {
          attempt += 1;
          if (attempt < RETRY_ATTEMPTS) {
            throw new RuntimeError("retry once");
          }
        },
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow, {
    onNodeRetry: (_node, _error, _attempt, nextDelayMs) => {
      retryCalled += ONE;
      lastDelay = nextDelayMs;
    },
  });

  expect(retryCalled).toBe(ONE);
  expect(lastDelay).toBe(RETRY_DELAY_MS);
  expect(result.status).toBe("succeeded");
});

test("runner calls onNodeError after retries exhausted", async () => {
  let errorCalled = ZERO;
  const workflow = new Workflow({
    id: "error-flow",
    nodes: [
      new Node({
        id: ERROR_NODE_ID,
        retry: { maxAttempts: ERROR_ATTEMPTS },
        handler: () => {
          throw new RuntimeError("always fails");
        },
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow, {
    onNodeError: () => {
      errorCalled += ONE;
    },
  });

  expect(result.status).toBe("failed");
  expect(errorCalled).toBe(ONE);
});

test("runner allows setMemory/updateMemory outside chatflow", async () => {
  const workflow = new Workflow({
    id: MEMORY_WORKFLOW_ID,
    nodes: [
      new Node({
        id: MEMORY_NODE_ID,
        handler: ({ setMemory, updateMemory, getMemory }) => {
          setMemory?.({ [MEMORY_KEY_A]: MEMORY_VALUE_A });
          updateMemory?.({
            [MEMORY_KEY_B]: MEMORY_VALUE_B,
            [MEMORY_KEY_C]: MEMORY_VALUE_C,
          });
          return getMemory?.();
        },
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow);

  expect(result.memory).toEqual({
    [MEMORY_KEY_A]: MEMORY_VALUE_A,
    [MEMORY_KEY_B]: MEMORY_VALUE_B,
    [MEMORY_KEY_C]: MEMORY_VALUE_C,
  });
});

test("chatflow requires conversationId", async () => {
  const workflow = new Workflow({
    id: "chatflow-missing",
    type: "chatflow",
  });
  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(InvalidArgumentError);
});
