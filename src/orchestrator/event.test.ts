import { TZDate } from "@date-fns/tz";
import { expect, test } from "vitest";
import { InvalidArgumentError } from "../core/errors.js";
import { Event } from "./event.js";

const EVENT_TYPE = "order.created";
const PAYLOAD = { id: "A-1" };
const METADATA = { correlationId: "corr" };
const MIN_ID_LENGTH = 1;

const FIXED_DATE = new TZDate("2024-01-01T00:00:00.000Z");

test("event creates defaults", () => {
  const event = Event.create(EVENT_TYPE, PAYLOAD, METADATA);

  expect(event.type).toBe(EVENT_TYPE);
  expect(event.payload).toEqual(PAYLOAD);
  expect(event.metadata).toEqual(METADATA);
  expect(event.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
  expect(event.timestamp).toBeInstanceOf(TZDate);
});

test("event accepts timestamp override", () => {
  const event = new Event({
    type: EVENT_TYPE,
    payload: PAYLOAD,
    timestamp: FIXED_DATE,
  });

  expect(event.timestamp).toBe(FIXED_DATE);
});

test("event validates type", () => {
  expect(() => new Event({ type: "" })).toThrow(InvalidArgumentError);
});
