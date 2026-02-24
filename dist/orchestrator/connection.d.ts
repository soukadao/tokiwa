export type ConnectionState = "connected" | "disconnected";
export interface ConnectionInit {
    name?: string;
    metadata?: Record<string, unknown>;
}
/**
 * 名前付きの接続を表すクラス。接続状態の管理とメタデータの保持を行う。
 */
export declare class Connection {
    readonly id: string;
    readonly name?: string;
    private state;
    private metadata;
    /**
     * 接続を生成する。初期状態は"disconnected"となる。
     *
     * @param init - 接続の初期化パラメータ（名前とメタデータ）
     */
    constructor(init?: ConnectionInit);
    /**
     * 接続状態を"connected"に設定する。
     */
    connect(): void;
    /**
     * 接続状態を"disconnected"に設定する。
     */
    disconnect(): void;
    /**
     * 現在の接続状態を返す。
     *
     * @returns 現在の接続状態（"connected" または "disconnected"）
     */
    getState(): ConnectionState;
    /**
     * メタデータをマージして更新する。既存のキーは上書きされる。
     *
     * @param update - マージするメタデータのキーと値のペア
     */
    updateMetadata(update: Record<string, unknown>): void;
    /**
     * メタデータのシャローコピーを返す。
     *
     * @returns メタデータオブジェクトの浅いコピー
     */
    getMetadata(): Record<string, unknown>;
}
