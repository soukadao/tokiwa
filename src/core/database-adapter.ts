import { StateError } from "./errors.js";

export type DatabaseType = "postgres" | "mysql" | "sqlite";

export type QueryValue = string | number | boolean | null | Date | Buffer;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly QueryValue[],
  ): Promise<QueryResult<T>>;
}

export interface DatabaseAdapterOptions {
  type: DatabaseType;
  driver: DatabaseDriver;
}

const DISCONNECTED_MESSAGE = "Database is not connected";

export class DatabaseAdapter {
  readonly type: DatabaseType;
  private readonly driver: DatabaseDriver;
  private connected = false;

  constructor(options: DatabaseAdapterOptions) {
    this.type = options.type;
    this.driver = options.driver;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.driver.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.driver.disconnect();
    this.connected = false;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly QueryValue[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.connected) {
      throw new StateError(DISCONNECTED_MESSAGE);
    }
    return this.driver.query<T>(sql, params);
  }
}
