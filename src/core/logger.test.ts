import { expect, test, vi } from "vitest";
import { createLogger, type LogEntry, Logger } from "./logger.js";

const ERROR_MESSAGE = "boom";
const INFO_MESSAGE = "info";
const CONTEXT = { traceId: "t-1" };
const UNSERIALIZABLE_CONTEXT: Record<string, unknown> = {};
UNSERIALIZABLE_CONTEXT.self = UNSERIALIZABLE_CONTEXT;
const NOTICE_MESSAGE = "notice";
const ALERT_MESSAGE = "alert";
const CRITICAL_MESSAGE = "critical";
const WARNING_MESSAGE = "warning";
const EMERGENCY_MESSAGE = "emergency";

const createSink = () => {
  const entries: LogEntry[] = [];
  const sink = (entry: LogEntry): void => {
    entries.push(entry);
  };
  return { entries, sink };
};

test("logger respects level and writes to sink", () => {
  const { entries, sink } = createSink();
  const logger = new Logger({ level: "error", sink });

  logger.info(INFO_MESSAGE);
  logger.error(ERROR_MESSAGE, CONTEXT);

  expect(entries).toHaveLength(1);
  expect(entries[0].level).toBe("error");
  expect(entries[0].message).toBe(ERROR_MESSAGE);
  expect(entries[0].context).toEqual(CONTEXT);
  expect(entries[0].timestamp).toBeInstanceOf(Date);
});

test("logger setLevel/getLevel works", () => {
  const { entries, sink } = createSink();
  const logger = createLogger({ sink });

  logger.setLevel("debug");
  expect(logger.getLevel()).toBe("debug");

  logger.debug(INFO_MESSAGE);
  expect(entries).toHaveLength(1);
});

test("default sink logs and handles unserializable context", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const logger = new Logger({ level: "debug" });

  logger.emergency(EMERGENCY_MESSAGE, UNSERIALIZABLE_CONTEXT);

  expect(spy).toHaveBeenCalledTimes(1);
  const message = String(spy.mock.calls[0]?.[0]);
  expect(message).toContain(EMERGENCY_MESSAGE);
  expect(message).toContain("[Unserializable]");

  spy.mockRestore();
});

test("logger helper methods call log", () => {
  const { entries, sink } = createSink();
  const logger = new Logger({ level: "debug", sink });

  logger.notice(NOTICE_MESSAGE);
  logger.alert(ALERT_MESSAGE);
  logger.critical(CRITICAL_MESSAGE);
  logger.warning(WARNING_MESSAGE);

  const levels = entries.map((entry) => entry.level);
  expect(levels).toEqual(["notice", "alert", "critical", "warning"]);
});
