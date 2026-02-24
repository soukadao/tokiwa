import { expect, test, vi } from "vitest";
import type { DistributedLock, LockHandle } from "../core/lock.js";
import {
  InMemoryConversationStore,
  Node,
  Workflow,
} from "../workflow/index.js";
import { Orchestrator } from "./orchestrator.js";

const CONVERSATION_ID = "conv-1";
const DELAY_MS = 10;
const ZERO = 0;
const ONE = 1;

const createChatflow = () => {
  const node = new Node({
    handler: () => ({ ok: true }),
  });
  return new Workflow({
    type: "chatflow",
    nodes: [node],
  });
};

test("chatflow uses distributed lock when provided", async () => {
  const handle: LockHandle = {
    key: "lock",
    token: "token",
  };
  const lock: DistributedLock = {
    acquire: vi.fn().mockResolvedValue(handle),
    release: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(true),
  };

  const store = new InMemoryConversationStore();
  const orchestrator = new Orchestrator({
    conversationStore: store,
    conversationLock: lock,
    conversationLockRefreshMs: 0,
  });
  const chatflow = createChatflow();
  orchestrator.registerWorkflow(chatflow);

  await orchestrator.runWorkflow(chatflow.id, {
    conversationId: CONVERSATION_ID,
  });

  expect(lock.acquire).toHaveBeenCalled();
  expect(lock.release).toHaveBeenCalledWith(handle);
});

test("chatflow serializes local conversation locks", async () => {
  const store = new InMemoryConversationStore();
  const orchestrator = new Orchestrator({ conversationStore: store });

  let inFlight = ZERO;
  let maxInFlight = ZERO;

  const node = new Node({
    handler: async () => {
      inFlight += ONE;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      inFlight -= ONE;
      return { ok: true };
    },
  });

  const chatflow = new Workflow({
    type: "chatflow",
    nodes: [node],
  });

  orchestrator.registerWorkflow(chatflow);

  await Promise.all([
    orchestrator.runWorkflow(chatflow.id, { conversationId: CONVERSATION_ID }),
    orchestrator.runWorkflow(chatflow.id, { conversationId: CONVERSATION_ID }),
  ]);

  expect(maxInFlight).toBe(ONE);
});
