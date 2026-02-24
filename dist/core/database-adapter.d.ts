export type DatabaseType = "postgres" | "mysql" | "sqlite";
export type QueryValue = string | number | boolean | null | Date | Buffer;
export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    rowCount: number;
}
export interface DatabaseDriver {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = Record<string, unknown>>(sql: string, params?: readonly QueryValue[]): Promise<QueryResult<T>>;
}
export interface DatabaseAdapterOptions {
    type: DatabaseType;
    driver: DatabaseDriver;
}
/**
 * データベースドライバーのラッパー
 * 接続状態の管理とクエリ実行時の状態チェックを行う
 */
export declare class DatabaseAdapter {
    readonly type: DatabaseType;
    private readonly driver;
    private connected;
    /**
     * @param options データベースの種類とドライバー設定
     */
    constructor(options: DatabaseAdapterOptions);
    /** データベースが接続中かどうかを返す */
    get isConnected(): boolean;
    /** データベースに接続する。既に接続済みの場合は何もしない */
    connect(): Promise<void>;
    /** データベースから切断する。既に切断済みの場合は何もしない */
    disconnect(): Promise<void>;
    /**
     * SQLクエリを実行する
     * @param sql SQL文
     * @param params バインドパラメータ
     * @returns クエリ結果
     * @throws {StateError} 未接続の場合
     */
    query<T = Record<string, unknown>>(sql: string, params?: readonly QueryValue[]): Promise<QueryResult<T>>;
}
