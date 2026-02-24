import { generateId, InvalidArgumentError } from "../core/index.js";
import type { Event } from "./event.js";

/**
 * イベントハンドラーに渡されるコンテキスト情報。
 */
export interface HandlerContext {
  /** ハンドラーを所有するサブスクライバーのID */
  subscriberId: string;
}

/**
 * イベントを処理するハンドラー関数の型定義。
 * @typeParam TPayload - イベントペイロードの型
 * @param event - 受信したイベント
 * @param context - ハンドラーコンテキスト
 */
export type EventHandler<TPayload = unknown> = (
  event: Event<TPayload>,
  context: HandlerContext,
) => void | Promise<void>;

/**
 * サブスクライバー作成時のオプション設定。
 */
export interface SubscriberOptions {
  /** サブスクライバーの名前（デバッグ用途） */
  name?: string;
  /** `true` の場合、ハンドラーは一度だけ実行され自動的に登録解除される */
  once?: boolean;
  /** イベントをフィルタリングする関数。`false` を返すとハンドラーは実行されない */
  filter?: (event: Event) => boolean;
}

/**
 * イベントサブスクライバーを表すクラス。
 * ハンドラー関数、オプションのフィルター、および一回限りの実行フラグを保持する。
 * @typeParam TPayload - イベントペイロードの型
 */
export class Subscriber<TPayload = unknown> {
  /** サブスクライバーの一意な識別子 */
  readonly id: string;
  /** 購読対象のイベントタイプ */
  readonly type: string;
  /** サブスクライバーの名前（デバッグ用途） */
  readonly name?: string;
  /** 一度だけ実行して自動登録解除するかどうか */
  readonly once: boolean;
  /** イベントフィルター関数 */
  readonly filter?: (event: Event) => boolean;
  /** イベントハンドラー関数 */
  readonly handler: EventHandler<TPayload>;

  /**
   * 新しいサブスクライバーを作成する。
   * @param type - 購読するイベントタイプ（空文字列は不可）
   * @param handler - イベント受信時に呼び出されるハンドラー関数
   * @param options - サブスクライバーのオプション設定
   * @throws {InvalidArgumentError} タイプが空文字列の場合
   */
  constructor(
    type: string,
    handler: EventHandler<TPayload>,
    options: SubscriberOptions = {},
  ) {
    if (!type || type.trim().length === 0) {
      throw new InvalidArgumentError(
        "Subscriber type must be a non-empty string",
      );
    }

    this.id = generateId();
    this.type = type;
    this.name = options.name;
    this.once = options.once ?? false;
    this.filter = options.filter;
    this.handler = handler;
  }
}
