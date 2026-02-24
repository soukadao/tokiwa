import { expect, test } from "vitest";
import {
  InMemoryConversationStore,
  Node,
  Workflow,
} from "../workflow/index.js";
import { Orchestrator } from "./orchestrator.js";

const EVENT_TYPE = "chat.message";
const CONVERSATION_ID = "conv-42";
const MEMORY_KEY = "count";
const UPDATED_COUNT = 1;
const DOUBLE_COUNT = 2;
const DELAY_MS = 10;

interface ChatPayload {
  conversationId: string;
}

test("chatflow stores memory via conversation store", async () => {
  const store = new InMemoryConversationStore();
  const orchestrator = new Orchestrator({ conversationStore: store });

  const workflow = new Workflow({
    type: "chatflow",
    nodes: [
      new Node({
        handler: ({ updateMemory }) => {
          updateMemory?.({ [MEMORY_KEY]: UPDATED_COUNT });
        },
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow, {
    type: "event",
    eventType: EVENT_TYPE,
    mapConversationId: (event) => (event.payload as ChatPayload).conversationId,
  });

  orchestrator.start();
  orchestrator.publish<ChatPayload>(EVENT_TYPE, {
    conversationId: CONVERSATION_ID,
  });
  await orchestrator.drain();

  const memory = await store.get(CONVERSATION_ID);
  expect(memory?.[MEMORY_KEY]).toBe(UPDATED_COUNT);

  await orchestrator.stop();
});

test("chatflow runs sequentially per conversation", async () => {
  const store = new InMemoryConversationStore();
  const orchestrator = new Orchestrator({ conversationStore: store });

  const workflow = new Workflow({
    type: "chatflow",
    nodes: [
      new Node({
        handler: async ({ getMemory, updateMemory }) => {
          const memory = getMemory?.() ?? {};
          const current =
            typeof memory[MEMORY_KEY] === "number" ? memory[MEMORY_KEY] : 0;
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          updateMemory?.({ [MEMORY_KEY]: current + 1 });
        },
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow, {
    type: "event",
    eventType: EVENT_TYPE,
    mapConversationId: (event) => (event.payload as ChatPayload).conversationId,
  });

  orchestrator.start();
  orchestrator.publish<ChatPayload>(EVENT_TYPE, {
    conversationId: CONVERSATION_ID,
  });
  orchestrator.publish<ChatPayload>(EVENT_TYPE, {
    conversationId: CONVERSATION_ID,
  });
  await orchestrator.drain();

  const memory = await store.get(CONVERSATION_ID);
  expect(memory?.[MEMORY_KEY]).toBe(DOUBLE_COUNT);

  await orchestrator.stop();
});
