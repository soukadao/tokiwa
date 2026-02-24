import { TZDate } from "@date-fns/tz";
import { expect, test } from "vitest";
import { Event } from "./event.js";
import { Notification } from "./notification.js";

const MESSAGE = "hello";
const TIMESTAMP = new TZDate("2024-01-01T00:00:00.000Z");

const DATA = { ok: true };
const MIN_ID_LENGTH = 1;

const EVENT = Event.create("system", { ok: true });

test("notification defaults", () => {
  const notification = new Notification({ message: MESSAGE });

  expect(notification.level).toBe("info");
  expect(notification.message).toBe(MESSAGE);
  expect(notification.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
  expect(notification.timestamp).toBeInstanceOf(TZDate);
});

test("notification accepts overrides", () => {
  const notification = new Notification({
    message: MESSAGE,
    level: "warning",
    timestamp: TIMESTAMP,
    data: DATA,
    event: EVENT,
  });

  expect(notification.level).toBe("warning");
  expect(notification.timestamp).toBe(TIMESTAMP);
  expect(notification.data).toEqual(DATA);
  expect(notification.event).toBe(EVENT);
});
