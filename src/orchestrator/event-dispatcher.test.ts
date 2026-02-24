import { expect, test } from "vitest";
import { RuntimeError } from "../core/index.js";
import { Event } from "./event.js";
import { EventDispatcher } from "./event-dispatcher.js";

const EVENT_TYPE = "order.created";
const OTHER_EVENT = "order.updated";
const ZERO = 0;
const ONE = 1;
const TWO = 2;

test("dispatch delivers to direct and wildcard subscribers", async () => {
  const dispatcher = new EventDispatcher();
  let direct = 0;
  let wildcard = 0;

  dispatcher.subscribe(EVENT_TYPE, async () => {
    direct += 1;
  });
  dispatcher.subscribe("*", async () => {
    wildcard += 1;
  });

  const result = await dispatcher.dispatch(Event.create(EVENT_TYPE));

  expect(result.delivered).toBe(TWO);
  expect(direct).toBe(ONE);
  expect(wildcard).toBe(ONE);
  expect(result.errors).toHaveLength(ZERO);
});

test("unsubscribe removes a subscriber", async () => {
  const dispatcher = new EventDispatcher();
  const subscriber = dispatcher.subscribe(EVENT_TYPE, async () => {});

  expect(dispatcher.unsubscribe(subscriber.id)).toBe(true);
  expect(dispatcher.getSubscriber(subscriber.id)).toBeUndefined();
});

test("unsubscribe returns false for unknown subscriber", () => {
  const dispatcher = new EventDispatcher();
  expect(dispatcher.unsubscribe("missing")).toBe(false);
});

test("filter errors are reported with stage=filter", async () => {
  const dispatcher = new EventDispatcher();
  const subscriber = dispatcher.subscribe(EVENT_TYPE, async () => {}, {
    filter: () => {
      throw new RuntimeError("filter failed");
    },
  });

  const result = await dispatcher.dispatch(Event.create(EVENT_TYPE));

  expect(result.delivered).toBe(ZERO);
  expect(result.errors).toHaveLength(ONE);
  expect(result.errors[0].subscriberId).toBe(subscriber.id);
  expect(result.errors[0].stage).toBe("filter");
});

test("once subscriber is removed after handler execution", async () => {
  const dispatcher = new EventDispatcher();
  const subscriber = dispatcher.subscribe(EVENT_TYPE, async () => {}, {
    once: true,
  });

  await dispatcher.dispatch(Event.create(EVENT_TYPE));

  expect(dispatcher.getSubscriber(subscriber.id)).toBeUndefined();
});

test("handler errors are reported with stage=handler", async () => {
  const dispatcher = new EventDispatcher();
  const subscriber = dispatcher.subscribe(EVENT_TYPE, async () => {
    throw new RuntimeError("handler failed");
  });

  const result = await dispatcher.dispatch(Event.create(EVENT_TYPE));

  expect(result.delivered).toBe(ZERO);
  expect(result.errors).toHaveLength(ONE);
  expect(result.errors[0].subscriberId).toBe(subscriber.id);
  expect(result.errors[0].stage).toBe("handler");
});

test("clear removes subscribers by type or globally", async () => {
  const dispatcher = new EventDispatcher();
  dispatcher.subscribe(EVENT_TYPE, async () => {});
  dispatcher.subscribe(OTHER_EVENT, async () => {});

  dispatcher.clear(EVENT_TYPE);
  expect(dispatcher.getSubscribers(EVENT_TYPE)).toHaveLength(ZERO);
  expect(dispatcher.getSubscribers()).toHaveLength(ONE);

  dispatcher.clear();
  expect(dispatcher.getSubscribers()).toHaveLength(ZERO);
});
