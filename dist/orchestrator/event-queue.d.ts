import type { Event } from "./event.js";
/**
 * キューから取得されたメッセージを表すインターフェース。
 * ACK/NACKによるメッセージの確認応答をサポートする。
 */
export interface QueueMessage {
    /** メッセージに含まれるイベント */
    event: Event;
    /** このメッセージの処理試行回数 */
    attempts: number;
    /** メッセージの処理完了を確認する（ACK） */
    ack: () => void | Promise<void>;
    /** メッセージの処理失敗を通知する（NACK） */
    nack: (reason?: string) => void | Promise<void>;
}
/**
 * デキューされたイベントの型。単純な {@link Event} または ACK/NACK 付きの {@link QueueMessage} のいずれか。
 */
export type DequeuedEvent = Event | QueueMessage;
/**
 * イベントキューのインターフェース。
 * エンキュー、デキュー、サイズ取得の基本操作と、オプションのピーク・クリア・リスト・ドレイン操作を定義する。
 */
export interface EventQueue {
    /**
     * イベントをキューに追加する。
     * @param event - キューに追加するイベント
     */
    enqueue(event: Event): void | Promise<void>;
    /**
     * キューの先頭からイベントを取り出す。
     * @returns 取り出したイベントまたはメッセージ。キューが空の場合は `undefined`。
     */
    dequeue(): DequeuedEvent | undefined | Promise<DequeuedEvent | undefined>;
    /**
     * キュー内の未処理イベント数を返す。
     * @returns 未処理のイベント数
     */
    size(): number | Promise<number>;
    /**
     * キューの先頭のイベントを取り出さずに参照する。
     * @returns 先頭のイベント。キューが空の場合は `undefined`。
     */
    peek?(): Event | undefined;
    /**
     * キュー内のすべてのイベントを削除する。
     */
    clear?(): void;
    /**
     * キュー内のすべての未処理イベントを配列として返す。
     * @returns 未処理イベントの配列
     */
    list?(): Event[];
    /**
     * キュー内のすべての未処理イベントを取り出して返し、キューを空にする。
     * @returns 取り出されたすべての未処理イベントの配列
     */
    drain?(): Event[];
}
