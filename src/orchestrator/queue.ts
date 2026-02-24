import type { Event } from "./event.js";
import type { EventQueue } from "./event-queue.js";

const COMPACT_AFTER_DEQUEUE_COUNT = 50;
const COMPACT_RATIO = 2;

/**
 * インメモリのFIFOイベントキュー。
 * デキュー回数が一定の閾値を超えた場合に自動コンパクションを行い、メモリ効率を維持する。
 * @implements {EventQueue}
 */
export class Queue implements EventQueue {
  /** キューに格納されたイベントの配列 */
  private items: Event[] = [];
  /** 次にデキューされるイベントのインデックス */
  private head = 0;

  /**
   * イベントをキューの末尾に追加する。
   * @param event - キューに追加するイベント
   */
  enqueue(event: Event): void {
    this.items.push(event);
  }

  /**
   * キューの先頭からイベントを取り出して返す。
   * デキュー回数が閾値を超え、かつ使用済み領域が全体の半分以上を占める場合に自動コンパクションを実行する。
   * @returns 取り出したイベント。キューが空の場合は `undefined`。
   */
  dequeue(): Event | undefined {
    if (this.head >= this.items.length) {
      return undefined;
    }

    const event = this.items[this.head];
    this.head += 1;

    if (
      this.head > COMPACT_AFTER_DEQUEUE_COUNT &&
      this.head * COMPACT_RATIO > this.items.length
    ) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }

    return event;
  }

  /**
   * キューの先頭のイベントを取り出さずに参照する。
   * @returns 先頭のイベント。キューが空の場合は `undefined`。
   */
  peek(): Event | undefined {
    return this.items[this.head];
  }

  /**
   * キュー内の未処理イベント数を返す。
   * @returns 未処理のイベント数
   */
  size(): number {
    return this.items.length - this.head;
  }

  /**
   * キュー内のすべてのイベントを削除する。
   */
  clear(): void {
    this.items.length = 0;
    this.head = 0;
  }

  /**
   * キュー内のすべての未処理イベントを配列として返す。キューの状態は変更しない。
   * @returns 未処理イベントの配列
   */
  list(): Event[] {
    return this.items.slice(this.head);
  }

  /**
   * キュー内のすべての未処理イベントを取り出して返し、キューを空にする。
   * @returns 取り出されたすべての未処理イベントの配列
   */
  drain(): Event[] {
    const drained = this.items.slice(this.head);
    this.items.length = 0;
    this.head = 0;
    return drained;
  }
}
