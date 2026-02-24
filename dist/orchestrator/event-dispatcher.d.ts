import type { Event } from "./event.js";
import { type EventHandler, type HandlerContext, Subscriber, type SubscriberOptions } from "./subscriber.js";
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
export declare class EventDispatcher {
    /** イベントタイプごとのサブスクライバーセット */
    private readonly subscribersByType;
    /** サブスクライバーIDによるサブスクライバーのマップ */
    private readonly subscribersById;
    /**
     * 指定されたイベントタイプに対して新しいハンドラーを登録する。
     * @param type - 購読するイベントタイプ（`*` でワイルドカード購読可能）
     * @param handler - イベント受信時に呼び出されるハンドラー関数
     * @param options - サブスクライバーのオプション設定（名前、一回限り、フィルターなど）
     * @returns 作成された {@link Subscriber} インスタンス
     */
    subscribe(type: string, handler: EventHandler, options?: SubscriberOptions): Subscriber;
    /**
     * 指定されたIDのサブスクライバーを登録解除する。
     * @param subscriberId - 登録解除するサブスクライバーのID
     * @returns 登録解除に成功した場合は `true`、該当するサブスクライバーが見つからない場合は `false`
     */
    unsubscribe(subscriberId: string): boolean;
    /**
     * サブスクライバーをすべて、または指定したタイプのものだけクリアする。
     * @param type - クリア対象のイベントタイプ。省略時はすべてのサブスクライバーを削除する。
     */
    clear(type?: string): void;
    /**
     * 指定されたIDのサブスクライバーを取得する。
     * @param subscriberId - 取得するサブスクライバーのID
     * @returns 該当する {@link Subscriber}、見つからない場合は `undefined`
     */
    getSubscriber(subscriberId: string): Subscriber | undefined;
    /**
     * すべてのサブスクライバー、または指定したタイプのサブスクライバー一覧を取得する。
     * @param type - フィルタリングするイベントタイプ。省略時はすべてのサブスクライバーを返す。
     * @returns サブスクライバーの配列
     */
    getSubscribers(type?: string): Subscriber[];
    /**
     * イベントをマッチするサブスクライバーにディスパッチする。
     * 直接一致するタイプのサブスクライバーとワイルドカード（`*`）サブスクライバーの両方に配信する。
     * フィルターやハンドラーで発生したエラーは収集され、結果に含まれる。
     * `once` フラグが設定されたサブスクライバーは実行後に自動的に登録解除される。
     * @param event - ディスパッチするイベント
     * @returns 配信数とエラー情報を含む {@link DispatchResult}
     */
    dispatch(event: Event): Promise<DispatchResult>;
}
