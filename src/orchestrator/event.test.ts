import { expect, test } from "vitest";
import { InvalidArgumentError } from "../core/errors.js";
import { Event } from "./event.js";

const EVENT_TYPE = "order.created";
const PAYLOAD = { id: "A-1" };
const METADATA = { correlationId: "corr" };
const CUSTOM_ID = "event-1";
const MIN_ID_LENGTH = 1;

const FIXED_DATE = new Date("2024-01-01T00:00:00.000Z");

test("event creates defaults", () => {
  const event = Event.create(EVENT_TYPE, PAYLOAD, METADATA);

  expect(event.type).toBe(EVENT_TYPE);
  expect(event.payload).toEqual(PAYLOAD);
  expect(event.metadata).toEqual(METADATA);
  expect(event.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
  expect(event.timestamp).toBeInstanceOf(Date);
});

test("event accepts overrides", () => {
  const event = new Event({
    id: CUSTOM_ID,
    type: EVENT_TYPE,
    payload: PAYLOAD,
    timestamp: FIXED_DATE,
  });

  expect(event.id).toBe(CUSTOM_ID);
  expect(event.timestamp).toBe(FIXED_DATE);
});

test("event validates type", () => {
  expect(() => new Event({ type: "" })).toThrow(InvalidArgumentError);
});
