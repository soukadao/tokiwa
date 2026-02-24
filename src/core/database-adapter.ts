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

/**
 * データベースドライバーのラッパー
 * 接続状態の管理とクエリ実行時の状態チェックを行う
 */
export class DatabaseAdapter {
  readonly type: DatabaseType;
  private readonly driver: DatabaseDriver;
  private connected = false;

  /**
   * @param options データベースの種類とドライバー設定
   */
  constructor(options: DatabaseAdapterOptions) {
    this.type = options.type;
    this.driver = options.driver;
  }

  /** データベースが接続中かどうかを返す */
  get isConnected(): boolean {
    return this.connected;
  }

  /** データベースに接続する。既に接続済みの場合は何もしない */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.driver.connect();
    this.connected = true;
  }

  /** データベースから切断する。既に切断済みの場合は何もしない */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.driver.disconnect();
    this.connected = false;
  }

  /**
   * SQLクエリを実行する
   * @param sql SQL文
   * @param params バインドパラメータ
   * @returns クエリ結果
   * @throws {StateError} 未接続の場合
   */
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
