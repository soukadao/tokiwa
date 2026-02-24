import { expect, test } from "vitest";
import { Event } from "./event.js";
import { Queue } from "./queue.js";

const EVENT_A = "a";
const EVENT_B = "b";
const EVENT_C = "c";
const EMPTY = 0;
const ONE = 1;
const COMPACT_TRIGGER_COUNT = 51;
const TOTAL_EVENTS = 60;

test("queue enqueues and dequeues in FIFO order", () => {
  const queue = new Queue();
  queue.enqueue(Event.create(EVENT_A));
  queue.enqueue(Event.create(EVENT_B));
  queue.enqueue(Event.create(EVENT_C));

  expect(queue.dequeue()?.type).toBe(EVENT_A);
  expect(queue.dequeue()?.type).toBe(EVENT_B);
  expect(queue.dequeue()?.type).toBe(EVENT_C);
  expect(queue.dequeue()).toBeUndefined();
});

test("queue size, list, and drain reflect remaining items", () => {
  const queue = new Queue();
  queue.enqueue(Event.create(EVENT_A));
  queue.enqueue(Event.create(EVENT_B));
  queue.enqueue(Event.create(EVENT_C));

  queue.dequeue();
  expect(queue.size()).toBe(2);
  expect(queue.list().map((event) => event.type)).toEqual([EVENT_B, EVENT_C]);

  const drained = queue.drain();
  expect(drained.map((event) => event.type)).toEqual([EVENT_B, EVENT_C]);
  expect(queue.size()).toBe(EMPTY);
});

test("queue peek and clear work", () => {
  const queue = new Queue();
  queue.enqueue(Event.create(EVENT_A));

  expect(queue.peek()?.type).toBe(EVENT_A);
  queue.clear();
  expect(queue.peek()).toBeUndefined();
  expect(queue.size()).toBe(EMPTY);
});

test("queue compacts storage after many dequeues", () => {
  const queue = new Queue();
  for (let i = 0; i < TOTAL_EVENTS; i += 1) {
    queue.enqueue(Event.create(`${EVENT_A}-${i}`));
  }

  for (let i = 0; i < COMPACT_TRIGGER_COUNT; i += 1) {
    queue.dequeue();
  }

  expect(queue.size()).toBe(TOTAL_EVENTS - COMPACT_TRIGGER_COUNT);
  expect(queue.peek()).toBeDefined();
  expect(queue.dequeue()).toBeDefined();
  expect(queue.size()).toBe(TOTAL_EVENTS - COMPACT_TRIGGER_COUNT - ONE);
});
