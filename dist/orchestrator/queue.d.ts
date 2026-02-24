import type { Event } from "./event.js";
import type { EventQueue } from "./event-queue.js";
/**
 * インメモリのFIFOイベントキュー。
 * デキュー回数が一定の閾値を超えた場合に自動コンパクションを行い、メモリ効率を維持する。
 * @implements {EventQueue}
 */
export declare class Queue implements EventQueue {
    /** キューに格納されたイベントの配列 */
    private items;
    /** 次にデキューされるイベントのインデックス */
    private head;
    /**
     * イベントをキューの末尾に追加する。
     * @param event - キューに追加するイベント
     */
    enqueue(event: Event): void;
    /**
     * キューの先頭からイベントを取り出して返す。
     * デキュー回数が閾値を超え、かつ使用済み領域が全体の半分以上を占める場合に自動コンパクションを実行する。
     * @returns 取り出したイベント。キューが空の場合は `undefined`。
     */
    dequeue(): Event | undefined;
    /**
     * キューの先頭のイベントを取り出さずに参照する。
     * @returns 先頭のイベント。キューが空の場合は `undefined`。
     */
    peek(): Event | undefined;
    /**
     * キュー内の未処理イベント数を返す。
     * @returns 未処理のイベント数
     */
    size(): number;
    /**
     * キュー内のすべてのイベントを削除する。
     */
    clear(): void;
    /**
     * キュー内のすべての未処理イベントを配列として返す。キューの状態は変更しない。
     * @returns 未処理イベントの配列
     */
    list(): Event[];
    /**
     * キュー内のすべての未処理イベントを取り出して返し、キューを空にする。
     * @returns 取り出されたすべての未処理イベントの配列
     */
    drain(): Event[];
}
