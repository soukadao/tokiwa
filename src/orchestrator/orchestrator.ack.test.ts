import { expect, test } from "vitest";
import { Node, Workflow } from "../workflow/index.js";
import type { EventQueue, QueueMessage } from "./event-queue.js";
import { Orchestrator } from "./orchestrator.js";

const EVENT_TYPE = "event.fail";

class AckQueue implements EventQueue {
  private messages: QueueMessage[] = [];
  public acked = 0;
  public nacked = 0;

  enqueue(event: QueueMessage["event"]): void {
    this.messages.push({
      event,
      attempts: 1,
      ack: async () => {
        this.acked += 1;
      },
      nack: async () => {
        this.nacked += 1;
      },
    });
  }

  dequeue(): QueueMessage | undefined {
    return this.messages.shift();
  }

  size(): number {
    return this.messages.length;
  }
}

const createFailingWorkflow = (): Workflow => {
  const node = new Node({
    handler: () => {
      throw new Error("fail");
    },
  });
  return new Workflow({
    nodes: [node],
  });
};

test("ackPolicy=always acks even on workflow failure", async () => {
  const queue = new AckQueue();
  const orchestrator = new Orchestrator({
    queue,
    ackPolicy: "always",
  });

  orchestrator.registerWorkflow(createFailingWorkflow(), {
    type: "event",
    eventType: EVENT_TYPE,
  });

  orchestrator.start();
  orchestrator.publish(EVENT_TYPE, {});
  await orchestrator.drain();
  await orchestrator.stop();

  expect(queue.acked).toBe(1);
  expect(queue.nacked).toBe(0);
});

test("ackPolicy=onSuccess nacks on workflow failure", async () => {
  const queue = new AckQueue();
  const orchestrator = new Orchestrator({
    queue,
    ackPolicy: "onSuccess",
  });

  orchestrator.registerWorkflow(createFailingWorkflow(), {
    type: "event",
    eventType: EVENT_TYPE,
  });

  orchestrator.start();
  orchestrator.publish(EVENT_TYPE, {});
  await orchestrator.drain();
  await orchestrator.stop();

  expect(queue.acked).toBe(0);
  expect(queue.nacked).toBe(1);
});
