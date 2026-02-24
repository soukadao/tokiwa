import { RuntimeError } from "../core/index.js";
import type { Event } from "./event.js";
import {
  type EventHandler,
  type HandlerContext,
  Subscriber,
  type SubscriberOptions,
} from "./subscriber.js";

/**
 * イベントディスパッチ時にハンドラーへ渡されるコンテキスト情報。
 * @extends HandlerContext
 */
export interface DispatchContext extends HandlerContext {
  /** ディスパッチャーインスタンスへの参照 */
  dispatcher: EventDispatcher;
  /** ディスパッチされたイベントのタイプ */
  eventType: string;
}

/**
 * ディスパッチ中に発生したエラーの詳細情報。
 */
export interface DispatchError {
  /** エラーが発生したサブスクライバーのID */
  subscriberId: string;
  /** 発生したエラーオブジェクト */
  error: Error;
  /** エラーが発生したステージ（フィルター実行時またはハンドラー実行時） */
  stage: "filter" | "handler";
}

/**
 * イベントディスパッチの実行結果。
 */
export interface DispatchResult {
  /** ディスパッチされたイベント */
  event: Event;
  /** 正常に配信されたサブスクライバーの数 */
  delivered: number;
  /** ディスパッチ中に発生したエラーの一覧 */
  errors: DispatchError[];
}

/**
 * サブスクライバーの登録とイベントディスパッチを管理するクラス。
 * ワイルドカード（`*`）によるイベント購読をサポートする。
 */
export class EventDispatcher {
  /** イベントタイプごとのサブスクライバーセット */
  private readonly subscribersByType = new Map<string, Set<Subscriber>>();
  /** サブスクライバーIDによるサブスクライバーのマップ */
  private readonly subscribersById = new Map<string, Subscriber>();

  /**
   * 指定されたイベントタイプに対して新しいハンドラーを登録する。
   * @param type - 購読するイベントタイプ（`*` でワイルドカード購読可能）
   * @param handler - イベント受信時に呼び出されるハンドラー関数
   * @param options - サブスクライバーのオプション設定（名前、一回限り、フィルターなど）
   * @returns 作成された {@link Subscriber} インスタンス
   */
  public subscribe(
    type: string,
    handler: EventHandler,
    options: SubscriberOptions = {},
  ): Subscriber {
    const subscriber = new Subscriber(type, handler, options);
    const bucket = this.subscribersByType.get(type) ?? new Set<Subscriber>();

    bucket.add(subscriber);
    this.subscribersByType.set(type, bucket);
    this.subscribersById.set(subscriber.id, subscriber);

    return subscriber;
  }

  /**
   * 指定されたIDのサブスクライバーを登録解除する。
   * @param subscriberId - 登録解除するサブスクライバーのID
   * @returns 登録解除に成功した場合は `true`、該当するサブスクライバーが見つからない場合は `false`
   */
  public unsubscribe(subscriberId: string): boolean {
    const subscriber = this.subscribersById.get(subscriberId);
    if (!subscriber) {
      return false;
    }

    this.subscribersById.delete(subscriberId);
    const bucket = this.subscribersByType.get(subscriber.type);
    if (bucket) {
      bucket.delete(subscriber);
      if (bucket.size === 0) {
        this.subscribersByType.delete(subscriber.type);
      }
    }

    return true;
  }

  /**
   * サブスクライバーをすべて、または指定したタイプのものだけクリアする。
   * @param type - クリア対象のイベントタイプ。省略時はすべてのサブスクライバーを削除する。
   */
  public clear(type?: string): void {
    if (!type) {
      this.subscribersByType.clear();
      this.subscribersById.clear();
      return;
    }

    const bucket = this.subscribersByType.get(type);
    if (!bucket) {
      return;
    }

    for (const subscriber of bucket) {
      this.subscribersById.delete(subscriber.id);
    }

    this.subscribersByType.delete(type);
  }

  /**
   * 指定されたIDのサブスクライバーを取得する。
   * @param subscriberId - 取得するサブスクライバーのID
   * @returns 該当する {@link Subscriber}、見つからない場合は `undefined`
   */
  public getSubscriber(subscriberId: string): Subscriber | undefined {
    return this.subscribersById.get(subscriberId);
  }

  /**
   * すべてのサブスクライバー、または指定したタイプのサブスクライバー一覧を取得する。
   * @param type - フィルタリングするイベントタイプ。省略時はすべてのサブスクライバーを返す。
   * @returns サブスクライバーの配列
   */
  public getSubscribers(type?: string): Subscriber[] {
    if (type) {
      return Array.from(this.subscribersByType.get(type) ?? []);
    }

    return Array.from(this.subscribersById.values());
  }

  /**
   * イベントをマッチするサブスクライバーにディスパッチする。
   * 直接一致するタイプのサブスクライバーとワイルドカード（`*`）サブスクライバーの両方に配信する。
   * フィルターやハンドラーで発生したエラーは収集され、結果に含まれる。
   * `once` フラグが設定されたサブスクライバーは実行後に自動的に登録解除される。
   * @param event - ディスパッチするイベント
   * @returns 配信数とエラー情報を含む {@link DispatchResult}
   */
  public async dispatch(event: Event): Promise<DispatchResult> {
    const targets = new Set<Subscriber>();
    const direct = this.subscribersByType.get(event.type);
    const wildcard = this.subscribersByType.get("*");

    if (direct) {
      for (const subscriber of direct) {
        targets.add(subscriber);
      }
    }

    if (wildcard) {
      for (const subscriber of wildcard) {
        targets.add(subscriber);
      }
    }

    const errors: DispatchError[] = [];
    let delivered = 0;

    for (const subscriber of targets) {
      let executed = false;
      if (subscriber.filter) {
        try {
          if (!subscriber.filter(event)) {
            continue;
          }
        } catch (error: unknown) {
          errors.push({
            subscriberId: subscriber.id,
            error:
              error instanceof Error
                ? error
                : new RuntimeError(String(error), { cause: error }),
            stage: "filter",
          });
          continue;
        }
      }

      try {
        executed = true;
        const context: DispatchContext = {
          subscriberId: subscriber.id,
          dispatcher: this,
          eventType: event.type,
        };
        await subscriber.handler(event, context);
        delivered += 1;
      } catch (error: unknown) {
        errors.push({
          subscriberId: subscriber.id,
          error:
            error instanceof Error
              ? error
              : new RuntimeError(String(error), { cause: error }),
          stage: "handler",
        });
      } finally {
        if (subscriber.once && executed) {
          this.unsubscribe(subscriber.id);
        }
      }
    }

    return { event, delivered, errors };
  }
}
