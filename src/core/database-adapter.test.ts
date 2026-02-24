import { expect, test } from "vitest";
import {
  DatabaseAdapter,
  type DatabaseDriver,
  type QueryResult,
} from "./database-adapter.js";
import { StateError } from "./errors.js";

const QUERY_SQL = "select 1";
const RESULT_ROW = { ok: true };
const ONE = 1;

class FakeDriver implements DatabaseDriver {
  connectCalls = 0;
  disconnectCalls = 0;
  queryCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async query<T = Record<string, unknown>>(
    _sql: string,
  ): Promise<QueryResult<T>> {
    this.queryCalls += 1;
    return { rows: [RESULT_ROW as T], rowCount: ONE };
  }
}

test("database adapter connects and queries", async () => {
  const driver = new FakeDriver();
  const adapter = new DatabaseAdapter({ type: "sqlite", driver });

  await expect(adapter.query(QUERY_SQL)).rejects.toThrow(StateError);

  await adapter.connect();
  await adapter.connect();

  expect(adapter.isConnected).toBe(true);

  const result = await adapter.query(QUERY_SQL);
  expect(result.rowCount).toBe(ONE);
  expect(result.rows[0]).toEqual(RESULT_ROW);
  expect(driver.connectCalls).toBe(ONE);
  expect(driver.queryCalls).toBe(ONE);

  await adapter.disconnect();
  await adapter.disconnect();

  expect(adapter.isConnected).toBe(false);
  expect(driver.disconnectCalls).toBe(ONE);
});
