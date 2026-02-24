import { generateId } from "../core/index.js";

export type ConnectionState = "connected" | "disconnected";

export interface ConnectionInit {
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 名前付きの接続を表すクラス。接続状態の管理とメタデータの保持を行う。
 */
export class Connection {
  readonly id: string;
  readonly name?: string;
  private state: ConnectionState = "disconnected";
  private metadata: Record<string, unknown>;

  /**
   * 接続を生成する。初期状態は"disconnected"となる。
   *
   * @param init - 接続の初期化パラメータ（名前とメタデータ）
   */
  constructor(init: ConnectionInit = {}) {
    this.id = generateId();
    this.name = init.name;
    this.metadata = init.metadata ?? {};
  }

  /**
   * 接続状態を"connected"に設定する。
   */
  connect(): void {
    this.state = "connected";
  }

  /**
   * 接続状態を"disconnected"に設定する。
   */
  disconnect(): void {
    this.state = "disconnected";
  }

  /**
   * 現在の接続状態を返す。
   *
   * @returns 現在の接続状態（"connected" または "disconnected"）
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * メタデータをマージして更新する。既存のキーは上書きされる。
   *
   * @param update - マージするメタデータのキーと値のペア
   */
  updateMetadata(update: Record<string, unknown>): void {
    this.metadata = { ...this.metadata, ...update };
  }

  /**
   * メタデータのシャローコピーを返す。
   *
   * @returns メタデータオブジェクトの浅いコピー
   */
  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }
}
