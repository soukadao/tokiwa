import { expect, test } from "vitest";
import { InvalidArgumentError } from "../core/errors.js";
import type { Event } from "./event.js";
import { Subscriber } from "./subscriber.js";

const EVENT_TYPE = "order";
const NAME = "listener";
const MIN_ID_LENGTH = 1;

const handler = async (): Promise<void> => {};

const filter = (_event: Event): boolean => true;

test("subscriber initializes options", () => {
  const subscriber = new Subscriber(EVENT_TYPE, handler, {
    name: NAME,
    once: true,
    filter,
  });

  expect(subscriber.type).toBe(EVENT_TYPE);
  expect(subscriber.name).toBe(NAME);
  expect(subscriber.once).toBe(true);
  expect(subscriber.filter).toBe(filter);
  expect(subscriber.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
});

test("subscriber validates type", () => {
  expect(() => new Subscriber("", handler)).toThrow(InvalidArgumentError);
});
