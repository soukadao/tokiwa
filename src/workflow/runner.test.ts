import { expect, test } from "vitest";
import { InvalidArgumentError, RuntimeError } from "../core/index.js";
import { Node, Runner, Workflow } from "./index.js";

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY_MS = 0;
const RETRY_BACKOFF_MULTIPLIER = 1;
const CONVERSATION_ID = "conv-1";
const MEMORY_KEY = "count";
const INITIAL_COUNT = 0;
const UPDATED_COUNT = 1;
const ZERO = 0;
const ONE = 1;
const HOOK_INPUT = 7;
const HOOK_RESULT = { ok: true };
const RETRY_DELAY_MS = 1;
const RETRY_ATTEMPTS = 2;
const RETRY_JITTER_MS = 0;
const ERROR_ATTEMPTS = 1;
const MEMORY_KEY_A = "a";
const MEMORY_KEY_B = "b";
const MEMORY_KEY_C = "c";
const MEMORY_VALUE_A = 1;
const MEMORY_VALUE_B = 2;
const MEMORY_VALUE_C = 3;
const DEEP_MEMORY_KEY = "nested";
const DEEP_MEMORY_SUBKEY = "count";
const DEEP_MEMORY_VALUE_ONE = 1;
const DEEP_MEMORY_VALUE_TWO = 2;
const FAILFAST_TIMEOUT_MS = 50;
const FAILFAST_CONCURRENCY = 2;
const MISSING_DEPENDENCY_ID = "missing";

test("runner executes dependencies before dependents", async () => {
  const order: string[] = [];
  const nodeA = new Node({
    handler: () => {
      order.push("A");
    },
  });
  const nodeB = new Node({
    dependsOn: [nodeA.id],
    handler: () => {
      order.push("B");
    },
  });
  const nodeC = new Node({
    dependsOn: [nodeA.id],
    handler: () => {
      order.push("C");
    },
  });
  const workflow = new Workflow({
    nodes: [nodeA, nodeB, nodeC],
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
  const failingNode = new Node({
    handler: () => {
      throw new RuntimeError("boom");
    },
  });
  const workflow = new Workflow({
    nodes: [
      failingNode,
      new Node({
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
  expect(result.errors[failingNode.id]).toBeInstanceOf(Error);
});

test("failFast aborts in-flight nodes via signal", async () => {
  let aborted = false;
  let timedOut = false;
  const workflow = new Workflow({
    nodes: [
      new Node({
        handler: async () => {
          await Promise.resolve();
          throw new RuntimeError("boom");
        },
      }),
      new Node({
        handler: ({ signal }) =>
          new Promise((resolve) => {
            if (!signal) {
              timedOut = true;
              resolve("no-signal");
              return;
            }
            const timeoutId = setTimeout(() => {
              timedOut = true;
              resolve("timeout");
            }, FAILFAST_TIMEOUT_MS);
            const onAbort = (): void => {
              aborted = true;
              clearTimeout(timeoutId);
              resolve("aborted");
            };
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
          }),
      }),
    ],
  });

  const runner = new Runner();
  const result = await runner.run(workflow, {
    failFast: true,
    concurrency: FAILFAST_CONCURRENCY,
  });

  expect(result.status).toBe("failed");
  expect(aborted).toBe(true);
  expect(timedOut).toBe(false);
});

test("runner throws on missing dependency", async () => {
  const node = new Node({
    dependsOn: [MISSING_DEPENDENCY_ID],
    handler: () => {},
  });
  const workflow = new Workflow({
    nodes: [node],
  });

  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(
    `Node ${node.id} depends on missing node: ${MISSING_DEPENDENCY_ID}`,
  );
});

test("runner throws on cyclic dependency", async () => {
  const nodeA = new Node({ handler: () => {} });
  const nodeB = new Node({ handler: () => {} });
  nodeA.addDependency(nodeB.id);
  nodeB.addDependency(nodeA.id);
  const workflow = new Workflow({
    nodes: [nodeA, nodeB],
  });

  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(
    "Workflow contains a cyclic dependency",
  );
});

test("runner retries nodes using retry policy", async () => {
  let attempt = 0;
  const node = new Node({
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
  });
  const workflow = new Workflow({
    nodes: [node],
  });

  const runner = new Runner();
  const result = await runner.run(workflow);

  expect(attempt).toBe(RETRY_MAX_ATTEMPTS);
  expect(result.attempts[node.id]).toBe(RETRY_MAX_ATTEMPTS);
  expect(result.status).toBe("succeeded");
  expect(result.timeline.some((entry) => entry.type === "node_retry")).toBe(
    true,
  );
});

test("chatflow exposes memory updates", async () => {
  const writer = new Node({
    handler: ({ updateMemory }) => {
      updateMemory?.({ [MEMORY_KEY]: UPDATED_COUNT });
    },
  });
  const reader = new Node({
    dependsOn: [writer.id],
    handler: ({ getMemory }) => {
      const memory = getMemory?.();
      if (!memory || memory[MEMORY_KEY] !== UPDATED_COUNT) {
        throw new RuntimeError("memory mismatch");
      }
    },
  });
  const workflow = new Workflow({
    type: "chatflow",
    nodes: [writer, reader],
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
  const hookNode = new Node({
    handler: ({ input }) => ({ ok: input === HOOK_INPUT }),
  });
  const workflow = new Workflow({
    nodes: [hookNode],
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

  expect(events).toEqual([`start:${hookNode.id}`, `complete:${hookNode.id}`]);
  expect(captured).toEqual(HOOK_RESULT);
});

test("runner calls onNodeRetry with delay", async () => {
  let attempt = 0;
  let retryCalled = ZERO;
  let lastDelay = ZERO;
  const workflow = new Workflow({
    nodes: [
      new Node({
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
    nodes: [
      new Node({
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
    nodes: [
      new Node({
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

test("runner deep clones input memory", async () => {
  const workflow = new Workflow({
    nodes: [
      new Node({
        handler: ({ memory }) => {
          const nested = (memory as { nested?: { count?: number } })?.nested;
          if (nested) {
            nested.count = DEEP_MEMORY_VALUE_TWO;
          }
        },
      }),
    ],
  });

  const initialMemory = {
    [DEEP_MEMORY_KEY]: { [DEEP_MEMORY_SUBKEY]: DEEP_MEMORY_VALUE_ONE },
  };

  const runner = new Runner();
  await runner.run(workflow, { memory: initialMemory });

  expect(initialMemory[DEEP_MEMORY_KEY][DEEP_MEMORY_SUBKEY]).toBe(
    DEEP_MEMORY_VALUE_ONE,
  );
});

test("chatflow requires conversationId", async () => {
  const workflow = new Workflow({
    type: "chatflow",
  });
  const runner = new Runner();

  await expect(runner.run(workflow)).rejects.toThrow(InvalidArgumentError);
});
