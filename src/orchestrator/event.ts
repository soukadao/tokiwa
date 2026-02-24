import { generateId, InvalidArgumentError } from "../core/index.js";

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  source?: string;
  tags?: string[];
}

export interface EventInit<TPayload = unknown> {
  type: string;
  payload?: TPayload;
  timestamp?: Date;
  metadata?: EventMetadata;
}

/**
 * ドメインイベントを表すクラス。型、ペイロード、タイムスタンプ、メタデータを保持する。
 *
 * @template TPayload - イベントのペイロードの型
 */
export class Event<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly timestamp: Date;
  readonly metadata: EventMetadata;

  /**
   * EventInitからイベントを生成する。typeが空文字列の場合はエラーをスローする。
   *
   * @param init - イベントの初期化パラメータ
   * @throws {InvalidArgumentError} typeが空文字列の場合
   */
  constructor(init: EventInit<TPayload>) {
    if (!init.type || init.type.trim().length === 0) {
      throw new InvalidArgumentError("Event type must be a non-empty string");
    }

    this.id = generateId();
    this.type = init.type;
    this.payload = init.payload as TPayload;
    this.timestamp = init.timestamp ?? new Date();
    this.metadata = init.metadata ?? {};
  }

  /**
   * イベントを生成するファクトリメソッド。型、ペイロード、メタデータを指定してイベントを作成する。
   *
   * @template TPayload - イベントのペイロードの型
   * @param type - イベントの種別を示す文字列
   * @param payload - イベントに付随するデータ
   * @param metadata - イベントのメタデータ（相関ID、原因ID、ソース、タグなど）
   * @returns 新しいEventインスタンス
   */
  static create<TPayload = unknown>(
    type: string,
    payload?: TPayload,
    metadata?: EventMetadata,
  ): Event<TPayload> {
    return new Event<TPayload>({ type, payload, metadata });
  }
}
